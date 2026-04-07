import stringSimilarity from 'string-similarity';

const CONFIDENCE_THRESHOLD = 0.45;  // above = auto-match (lowered for flexibility)
const LOW_CONFIDENCE_FLOOR = 0.3;   // between floor and threshold = flag for review

/**
 * Normalize company name for better matching:
 * strips common suffixes, lowercases, removes punctuation
 */
function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[.,'"!?()]/g, '')
    .replace(
      /\b(inc|incorporated|corp|corporation|llc|ltd|limited|co|company|group|holdings|plc|sa|ag|gmbh|the|intl|international)\b/g,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classify product line to standard categories.
 * Broadened to catch more variations.
 */
function classifyProduct(lineClass) {
  const lc = lineClass.toLowerCase().trim();
  // Match "Khoros Care Product", "Khoros Community Product", "Khoros Marketing Product" etc.
  if (lc.includes('care')) return 'Care';
  if (lc.includes('communit')) return 'Community';
  if (lc.includes('market')) return 'Marketing';
  if (lc.includes('service') || lc.includes('support')) return 'Care';
  if (lc.includes('social') || lc.includes('forum')) return 'Community';
  if (lc.includes('campaign') || lc.includes('automation')) return 'Marketing';
  // "Khoros Product" without a specific line — classify as generic
  if (lc.includes('khoros') || lc.includes('product')) return 'Platform';
  console.warn(`[Matcher] Unknown product class: "${lineClass}"`);
  return lineClass;
}

/**
 * Merge ARR rows with product rows using fuzzy matching.
 * Returns enriched account list with products attached.
 */
export function matchAccounts(arrRows, productRows) {
  console.log(`[Matcher] Matching ${arrRows.length} ARR accounts against ${productRows.length} product rows`);

  if (productRows.length === 0) {
    console.warn('[Matcher] No product rows — all accounts will have Unknown products');
    return arrRows.map((arr) => ({
      id: normalize(arr.customerName).replace(/\s+/g, '-') || `acct-${Math.random().toString(36).slice(2, 8)}`,
      customerName: arr.customerName,
      totalARR: arr.totalARR,
      status: arr.status,
      executivePOC: arr.executivePOC,
      executivePOCTitle: arr.executivePOCTitle,
      products: ['Unknown'],
      matchConfidence: 0,
      matchedProductAccount: null,
      lowConfidenceMatch: false,
    }));
  }

  // Build normalized lookup — group products by normalized account name
  const productByNorm = new Map();
  for (const p of productRows) {
    const norm = normalize(p.accountName);
    if (!productByNorm.has(norm)) {
      productByNorm.set(norm, []);
    }
    productByNorm.get(norm).push(p);
  }

  const productNames = [...productByNorm.keys()];
  let matchedCount = 0;
  let lowConfCount = 0;
  let unmatchedCount = 0;

  const results = [];

  for (const arr of arrRows) {
    const normName = normalize(arr.customerName);

    // Step 1: Try exact normalized match first
    let matchedProducts = [];
    let bestScore = 0;
    let bestMatch = null;

    if (productByNorm.has(normName)) {
      // Exact match after normalization
      bestScore = 1.0;
      bestMatch = normName;
      matchedProducts = productByNorm.get(normName).map((p) => classifyProduct(p.lineClass));
    } else if (productNames.length > 0) {
      // Fuzzy match
      const match = stringSimilarity.findBestMatch(normName, productNames);
      bestScore = match.bestMatch.rating;
      bestMatch = match.bestMatch.target;

      if (bestScore >= CONFIDENCE_THRESHOLD) {
        matchedProducts = (productByNorm.get(bestMatch) || []).map((p) => classifyProduct(p.lineClass));
      }
    }

    // Deduplicate products
    matchedProducts = [...new Set(matchedProducts)];

    const isLowConfidence = bestScore >= LOW_CONFIDENCE_FLOOR && bestScore < CONFIDENCE_THRESHOLD;

    if (matchedProducts.length > 0) matchedCount++;
    else if (isLowConfidence) lowConfCount++;
    else unmatchedCount++;

    const account = {
      id: normName.replace(/\s+/g, '-') || `acct-${Math.random().toString(36).slice(2, 8)}`,
      customerName: arr.customerName,
      totalARR: arr.totalARR,
      status: arr.status,
      executivePOC: arr.executivePOC,
      executivePOCTitle: arr.executivePOCTitle,
      products: matchedProducts.length > 0 ? matchedProducts : ['Unknown'],
      matchConfidence: bestScore,
      matchedProductAccount: bestMatch || null,
      lowConfidenceMatch: isLowConfidence,
    };

    results.push(account);
  }

  console.log(`[Matcher] Results: ${matchedCount} matched, ${lowConfCount} low-confidence, ${unmatchedCount} unmatched`);

  // Log a few examples
  const examples = results.slice(0, 3);
  for (const ex of examples) {
    console.log(`[Matcher]   "${ex.customerName}" → products=[${ex.products}] confidence=${ex.matchConfidence.toFixed(2)} matched="${ex.matchedProductAccount}"`);
  }

  // Sort by ARR descending
  results.sort((a, b) => b.totalARR - a.totalARR);
  return results;
}
