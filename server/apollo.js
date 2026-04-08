const APOLLO_API_BASE = 'https://api.apollo.io';

/**
 * Product → general title relevance mapping.
 * Used by titleMatchesProduct() to check if a title is relevant to a product area.
 */
const PRODUCT_TITLE_MAP = {
  Care: {
    ideal: ['Chief Customer Officer', 'Chief Experience Officer'],
    acceptable: [
      'SVP Customer', 'SVP Support', 'SVP Service',
      'EVP Customer', 'VP Customer', 'VP Support',
      'Head of Customer', 'Head of Support',
    ],
  },
  Community: {
    ideal: ['Chief Marketing Officer', 'Chief Digital Officer', 'Chief Community Officer'],
    acceptable: [
      'SVP Marketing', 'SVP Digital', 'SVP Community',
      'EVP Marketing', 'EVP Digital', 'VP Marketing', 'VP Digital', 'VP Community',
      'Head of Marketing', 'Head of Digital', 'Head of Community',
    ],
  },
  Marketing: {
    ideal: ['Chief Marketing Officer', 'Chief Revenue Officer', 'Chief Growth Officer'],
    acceptable: [
      'SVP Marketing', 'SVP Revenue', 'SVP Growth', 'SVP Demand',
      'EVP Marketing', 'VP Marketing', 'VP Revenue', 'VP Growth',
      'Head of Marketing', 'Head of Demand', 'Head of Growth',
    ],
  },
};

// ── 5-Tier Company Sizing System ───────────────────────────────────
const TIERS = {
  1: { min: 50000, label: 'Global Giant' },
  2: { min: 10000, max: 49999, label: 'Large Enterprise' },
  3: { min: 1000, max: 9999, label: 'Mid-Market' },
  4: { min: 100, max: 999, label: 'Growth' },
  5: { min: 0, max: 99, label: 'Small Business' },
};

function getTier(employeeCount) {
  if (employeeCount >= 50000) return 1;
  if (employeeCount >= 10000) return 2;
  if (employeeCount >= 1000) return 3;
  if (employeeCount >= 100) return 4;
  return 5;
}

// ── Email domain root validation ───────────────────────────────────
function getEmailRoot(email) {
  if (!email || !email.includes('@')) return null;
  const domain = email.split('@')[1] || '';
  const root = domain.split('.')[0];
  return root.toLowerCase() || null;
}

function findCompanyRoot(people) {
  const rootCounts = {};
  for (const person of people) {
    const email = person.email || '';
    const root = getEmailRoot(email);
    if (root) {
      rootCounts[root] = (rootCounts[root] || 0) + 1;
    }
  }
  let bestRoot = null;
  let bestCount = 0;
  for (const [root, count] of Object.entries(rootCounts)) {
    if (count > bestCount) {
      bestRoot = root;
      bestCount = count;
    }
  }
  return bestRoot;
}

// ── EA/admin titles excluded from primary selection at ALL tiers ──
const EA_ADMIN_EXCLUSIONS = [
  'executive assistant', 'executive admin', 'business administration to',
  'administrative assistant', 'ea to ', 'assistant to the',
  'executive business admin', 'executive coordinator',
  'chief of staff to', 'personal assistant',
];

// ── Hard title exclusions by tier ──────────────────────────────────
const TIER_EXCLUSIONS = {
  1: [
    'chief executive', 'ceo', 'chair', 'president', 'chief financial', 'cfo',
    'chief operating officer', 'coo', 'general counsel', 'chief legal',
    'chief marketing officer', 'cmo', 'chief customer officer', 'cco',
    'chief digital officer', 'chief technology', 'cto',
    'founder', 'co-founder',
  ],
  2: [
    'chief executive', 'ceo', 'chair', 'president', 'chief financial', 'cfo',
    'general counsel', 'chief legal', 'founder', 'co-founder',
  ],
  3: [], // no exclusions
  4: [], // no exclusions
  5: [], // no exclusions
};

// Secondary list exclusions (less aggressive than primary)
const SECONDARY_EXCLUSIONS = {
  1: ['ceo', 'chief executive', 'chair', 'chairman', 'founder', 'co-founder', 'cfo', 'chief financial'],
  2: ['ceo', 'chief executive', 'chair', 'chairman', 'founder', 'co-founder'],
  // Tiers 3-5: no exclusions
};

// ── Target title priority by tier and product ──────────────────────
const TIER_TARGETS = {
  1: {
    Care: [
      'VP Customer Experience', 'SVP Customer Experience', 'VP Customer Operations',
      'VP Support', 'Head of Customer Experience', 'Director Customer Experience',
    ],
    Community: [
      'VP Digital', 'SVP Digital', 'VP Brand', 'VP Social',
      'Head of Community', 'VP Digital Marketing', 'Head of Digital',
    ],
    Marketing: [
      'VP Marketing Technology', 'SVP Marketing', 'VP Marketing Operations',
      'VP Growth', 'Head of Marketing Technology',
    ],
  },
  2: {
    Care: [
      'Chief Customer Officer', 'CCO', 'Chief Experience Officer',
      'SVP Customer Experience', 'VP Customer Experience',
      'Head of Customer', 'Head of Service', 'Director of Customer Experience',
      'Executive General Manager Customer', 'Group Executive Customer',
      'Managing Director Customer',
    ],
    Community: [
      'Chief Marketing Officer', 'CMO', 'Chief Digital Officer',
      'SVP Digital', 'VP Brand',
      'Head of Marketing', 'Head of Digital',
      'Group Executive Marketing', 'Managing Director Marketing',
      'Executive General Manager Marketing',
    ],
    Marketing: [
      'Chief Marketing Officer', 'CMO', 'VP Marketing Technology',
      'SVP Marketing',
      'Head of Marketing', 'Head of Digital',
      'Group Executive Marketing', 'Managing Director Marketing',
      'Executive General Manager Marketing',
    ],
  },
  3: {
    Care: [
      'Chief Customer Officer', 'CCO', 'COO', 'VP Customer Success',
      'VP Customer Experience',
    ],
    Community: [
      'CMO', 'Chief Marketing Officer', 'VP Marketing', 'VP Brand',
    ],
    Marketing: [
      'CMO', 'Chief Marketing Officer', 'VP Marketing',
    ],
  },
  // Tiers 4 & 5 use generic senior exec targeting
  4: null,
  5: null,
};

// Generic targets for Tier 4 & 5 (all products)
const TIER_45_TARGETS = ['CEO', 'President', 'Founder', 'CMO', 'CCO', 'COO'];

/**
 * Seniority scoring — higher = more senior
 */
function getSeniority(title) {
  if (!title) return 0;
  const t = title.toLowerCase();

  if (/\b(ceo|chief executive)\b/.test(t)) return 100;
  if (/\b(coo|chief operating)\b/.test(t)) return 95;
  if (/\b(cmo|chief marketing)\b/.test(t)) return 93;
  if (/\b(cco|chief customer|chief commercial)\b/.test(t)) return 92;
  if (/\b(cro|chief revenue)\b/.test(t)) return 91;
  if (/\b(cdo|chief digital)\b/.test(t)) return 90;
  if (/\bchief\b/.test(t)) return 88;
  if (/\bpresident\b/.test(t) && !/\bvice\b/.test(t)) return 85;
  if (/\b(evp|executive vice president)\b/.test(t)) return 75;
  if (/\bsenior vice president\b/.test(t) || /\bsvp\b/.test(t)) return 70;
  if (/\b(group vp|gvp)\b/.test(t)) return 65;
  if (/\bvice president\b/.test(t) || /\bvp\b/.test(t)) return 60;
  if (/\bhead of\b/.test(t)) return 55;
  if (/\bsenior director\b/.test(t)) return 50;
  if (/\bdirector\b/.test(t)) return 40;
  if (/\bsenior manager\b/.test(t)) return 30;
  if (/\bmanager\b/.test(t)) return 20;
  return 10;
}

/**
 * Check if a person's title is relevant to a product area
 */
function titleMatchesProduct(title, product) {
  if (!title) return false;
  const t = title.toLowerCase();
  const map = PRODUCT_TITLE_MAP[product];
  if (!map) return false;

  // Person must be at least VP-level to match product titles
  const seniority = getSeniority(title);
  if (seniority < 55) return false; // Below "Head of" level — skip

  const allTitles = [...map.ideal, ...map.acceptable];
  return allTitles.some((target) => {
    const targetLower = target.toLowerCase();
    // Extract meaningful domain keywords (ignore level words)
    const levelWords = new Set(['chief', 'senior', 'vice', 'president', 'executive', 'svp', 'evp', 'vp', 'head', 'of']);
    const keyTerms = targetLower.split(/\s+/).filter((w) => w.length > 2 && !levelWords.has(w));
    return keyTerms.length > 0 && keyTerms.every((term) => t.includes(term));
  });
}

/**
 * Score a person for a SINGLE product using the tier system.
 * Exclusions are handled BEFORE this function is called (pool filtering).
 * This only scores against the tier-appropriate target list.
 */
function scorePersonForProduct(person, product, tier) {
  const seniority = getSeniority(person.title);
  const titleLower = (person.title || '').toLowerCase();

  // Tiers 4 & 5: generic exec targeting
  if (tier >= 4) {
    for (let i = 0; i < TIER_45_TARGETS.length; i++) {
      if (titleLower.includes(TIER_45_TARGETS[i].toLowerCase())) {
        return seniority + 200 - i * 10;
      }
    }
    // Also accept product-relevant titles
    if (titleMatchesProduct(person.title, product)) {
      return seniority + 75;
    }
    if (seniority >= 85) return seniority * 0.5;
    return 0;
  }

  // Tiers 1–3: use tier-specific target lists
  const targets = TIER_TARGETS[tier]?.[product];
  if (targets) {
    for (let i = 0; i < targets.length; i++) {
      if (titleLower.includes(targets[i].toLowerCase())) {
        return seniority + 200 - i * 10;
      }
    }
  }

  // Weak fallback: general product relevance
  if (titleMatchesProduct(person.title, product)) {
    return seniority + 50;
  }

  return 0;
}

/**
 * Score a person across all products (for allCandidates display scoring).
 */
function scorePersonForProducts(person, products, tier) {
  let bestScore = 0;
  let matchedProduct = null;

  for (const product of products) {
    const s = scorePersonForProduct(person, product, tier || 5);
    if (s > bestScore) {
      bestScore = s;
      matchedProduct = product;
    }
  }

  if (products.length > 1 && bestScore > 0) {
    let productsMatched = 0;
    for (const product of products) {
      if (titleMatchesProduct(person.title, product)) productsMatched++;
    }
    if (productsMatched > 1) {
      bestScore += productsMatched * 15;
    }
  }

  return { score: bestScore, matchedProduct };
}

/**
 * Main enrichment function.
 *
 * Returns an object with:
 *   - productContacts: array of { product, contact } — one per product (deduped)
 *   - knownPOC: anchor contact from the sheet
 *   - allCandidates: all scored candidates for the "Other Senior Contacts" section
 *   - employeeCount: from Apollo org data
 *
 * For single-product accounts, productContacts has one entry.
 * For multi-product, each product gets its own best contact (may overlap).
 */
export async function enrichContact(companyName, products, anchorContact, totalARR) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.warn('[Apollo] No API key — using fallback');
    return buildFallback(companyName, products, anchorContact);
  }

  try {
    // Step 1: Find the organization
    const org = await findOrganization(apiKey, companyName);
    const orgId = org?.id;
    const orgName = org?.name || companyName;
    let employeeCount = org?.estimated_num_employees || org?.employee_count || 0;

    console.log(`[Apollo] Org "${companyName}": ${orgId ? `"${orgName}" (${orgId}), ~${employeeCount} employees (from org search)` : 'not found'}`);

    // Step 2: Build a clean search name
    let cleanName = companyName
      .replace(/[.,\s]+(Inc|Corp|Corporation|LLC|Ltd|Limited|Plc|SA|AG|GmbH|Co)\.?\s*$/i, '')
      .replace(/\s+(Holdings|Holding|Americas|America|HQ|Headquarters|Group|International|Intl)\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    let seniorPeople = await searchSeniorPeople(apiKey, cleanName, orgId);

    // Fallback search variants if initial search returns 0
    if (seniorPeople.length === 0) {
      // Variant 1: strip extra suffixes (Bank, Pty, Ltd, etc.)
      const stripped = cleanName
        .replace(/\b(Bank|Pty|Ltd|Limited|Inc|Corp|Corporation|Group|Holdings|LLC|NV|BV|SA|AG|GmbH|Plc)\b\.?/gi, '')
        .replace(/\s+/g, ' ').trim();
      if (stripped && stripped !== cleanName) {
        console.log(`[Apollo] Retry variant 1 (stripped): "${stripped}"`);
        seniorPeople = await searchSeniorPeople(apiKey, stripped, orgId);
      }

      // Variant 2: first 2 words only
      if (seniorPeople.length === 0) {
        const first2 = cleanName.split(/\s+/).slice(0, 2).join(' ');
        if (first2 && first2 !== stripped && first2 !== cleanName) {
          console.log(`[Apollo] Retry variant 2 (first 2 words): "${first2}"`);
          seniorPeople = await searchSeniorPeople(apiKey, first2, orgId);
        }
      }

      // Variant 3: acronym for long names (3+ words → initials)
      if (seniorPeople.length === 0) {
        const words = cleanName.split(/\s+/);
        if (words.length >= 3) {
          const acronym = words.map((w) => w[0]).join('').toUpperCase();
          if (acronym.length >= 2) {
            console.log(`[Apollo] Retry variant 3 (acronym): "${acronym}"`);
            seniorPeople = await searchSeniorPeople(apiKey, acronym, orgId);
          }
        }
      }

      // Original fallback: progressively shorter names
      if (seniorPeople.length === 0) {
        const words = cleanName.split(/\s+/);
        while (words.length > 1 && seniorPeople.length === 0) {
          words.pop();
          const shorter = words.join(' ');
          console.log(`[Apollo] Retry (shorter): "${shorter}"`);
          seniorPeople = await searchSeniorPeople(apiKey, shorter, orgId);
        }
      }
    }

    // If org search returned 0 employees (matched wrong entity), check people's org data
    if (employeeCount === 0 && seniorPeople.length > 0) {
      for (const person of seniorPeople) {
        const pOrgCount = person.organization?.estimated_num_employees || person.organization?.employee_count || 0;
        if (pOrgCount > employeeCount) {
          employeeCount = pOrgCount;
        }
      }
      if (employeeCount > 0) {
        console.log(`[Apollo] Employee count corrected from people's org data: ~${employeeCount}`);
      }
    }

    // ARR-based fallback: companies with high ARR (>$500K) are almost certainly large enterprises
    // Apollo often fails to return employee count for subsidiaries/holdings entities
    if (employeeCount === 0 && totalARR > 500000) {
      employeeCount = 50000; // conservative estimate — triggers large company rules
      console.log(`[Apollo] Employee count inferred from ARR ($${totalARR}): treating as large company (~${employeeCount})`);
    }

    // Step 3: Look up the anchor contact from the sheet
    let knownContact = null;
    if (anchorContact) {
      const pocPeople = await searchByName(apiKey, cleanName, orgId, anchorContact.name);
      if (pocPeople.length > 0) {
        const pocRaw = pocPeople[0];
        const revealed = pocRaw.id ? await revealPerson(apiKey, pocRaw.id) : pocRaw;
        knownContact = {
          name: revealed.name || `${revealed.first_name || ''} ${revealed.last_name || ''}`.trim() || anchorContact.name,
          title: anchorContact.title || revealed.title || null,
          source: 'sheet',
        };
      } else {
        knownContact = { name: anchorContact.name, title: anchorContact.title || null, source: 'sheet' };
      }
    }

    // ── TIER-BASED CONTACT TARGETING (rewritten from scratch) ──
    const tier = getTier(employeeCount);
    const tierLabel = TIERS[tier].label;
    const exclusions = TIER_EXCLUSIONS[tier] || [];

    console.log(`[Apollo] ${seniorPeople.length} contacts | Tier ${tier} (${tierLabel}) | ~${employeeCount} employees`);
    console.log(`[Apollo] All candidates:`, seniorPeople.map((p) => `${p.first_name || ''} ${p.last_name || p.last_name_obfuscated || ''} (${p.title})`));

    // Step A: Build primary candidate pool (apply tier exclusions + EA/admin exclusion)
    let primaryPool = seniorPeople.filter((person) => {
      const t = (person.title || '').toLowerCase();
      // Always exclude EA/admin titles at every tier
      const isEA = EA_ADMIN_EXCLUSIONS.some((ex) => t.includes(ex));
      if (isEA) {
        console.log(`[Apollo] EXCLUDED EA/admin: ${person.first_name || ''} ${person.last_name || person.last_name_obfuscated || ''} — "${person.title}"`);
        return false;
      }
      // Apply tier-specific exclusions
      if (exclusions.length > 0) {
        const excluded = exclusions.some((ex) => t.includes(ex));
        if (excluded) {
          console.log(`[Apollo] EXCLUDED primary (Tier ${tier}): ${person.first_name || ''} ${person.last_name || person.last_name_obfuscated || ''} — "${person.title}"`);
          return false;
        }
      }
      return true;
    });
    console.log(`[Apollo] Primary pool after exclusion: ${seniorPeople.length} → ${primaryPool.length}`);

    // Step A2: Domain root validation — exclude contacts with mismatched email domains
    const companyRoot = findCompanyRoot(seniorPeople);
    if (companyRoot && seniorPeople.length > 1) {
      const beforeDomain = primaryPool.length;
      primaryPool = primaryPool.filter((person) => {
        const root = getEmailRoot(person.email);
        if (!root) return true; // no email — keep in pool
        if (root === companyRoot) return true;
        console.log(`[Apollo] DOMAIN MISMATCH (primary): ${person.first_name || ''} ${person.last_name || person.last_name_obfuscated || ''} — email root "${root}" != company root "${companyRoot}"`);
        return false;
      });
      if (beforeDomain !== primaryPool.length) {
        console.log(`[Apollo] Domain filter: ${beforeDomain} → ${primaryPool.length} (company root: "${companyRoot}")`);
      }
    }

    // Step B: Score and select primary per product
    const productContacts = [];
    const usedNames = new Set();

    for (const product of products) {
      const scored = primaryPool.map((person) => {
        const s = scorePersonForProduct(person, product, tier);
        const emailBoost = person.has_email ? 30 : 0;
        return { ...person, productScore: s + emailBoost };
      });
      scored.sort((a, b) => b.productScore - a.productScore);

      // Prefer candidate with verified email, fall back to any
      const withEmail = scored.find((c) => c.productScore > 0 && c.has_email);
      const best = withEmail || scored.find((c) => c.productScore > 0) || scored[0];
      if (!best) continue;

      const revealed = best.id ? await revealPerson(apiKey, best.id) : best;
      const revealedTitle = revealed.title || best.title || '';
      const fullName = revealed.name || `${revealed.first_name || ''} ${revealed.last_name || ''}`.trim() || `${best.first_name || ''} ${best.last_name_obfuscated || ''}`.trim();

      // Post-reveal exclusion check — if excluded, try next
      if (exclusions.length > 0 && exclusions.some((t) => revealedTitle.toLowerCase().includes(t))) {
        console.log(`[Apollo] EXCLUDED post-reveal: ${fullName} — "${revealedTitle}"`);
        // Try next in scored list
        for (const alt of scored) {
          if (alt === best) continue;
          const altRevealed = alt.id ? await revealPerson(apiKey, alt.id) : alt;
          const altTitle = altRevealed.title || alt.title || '';
          if (exclusions.some((t) => altTitle.toLowerCase().includes(t))) continue;
          const altName = altRevealed.name || `${altRevealed.first_name || ''} ${altRevealed.last_name || ''}`.trim();
          if (usedNames.has(altName)) { const ex = productContacts.find((pc) => pc.fullName === altName); if (ex) ex.products.push(product); break; }
          usedNames.add(altName);
          productContacts.push({ product, products: [product], fullName: altName, title: altTitle || 'Executive', email: altRevealed.email || alt.email || null, linkedinUrl: altRevealed.linkedin_url || alt.linkedin_url || null, source: 'apollo', confidence: (altRevealed.email || alt.email) ? 'high' : 'medium' });
          break;
        }
        continue;
      }

      const email = revealed.email || best.email || null;
      const linkedin = revealed.linkedin_url || best.linkedin_url || null;

      if (usedNames.has(fullName)) {
        const existing = productContacts.find((pc) => pc.fullName === fullName);
        if (existing) existing.products.push(product);
        continue;
      }

      usedNames.add(fullName);
      console.log(`[Apollo] ${product} (Tier ${tier}): ${fullName} — ${revealedTitle} (score=${best.productScore}, email=${email ? 'yes' : 'no'})`);

      productContacts.push({
        product, products: [product], fullName,
        title: revealedTitle || 'Executive', email, linkedinUrl: linkedin,
        source: 'apollo', confidence: email ? 'high' : 'medium',
      });
    }

    // Fallback chain: any non-excluded contact → any contact at all
    if (productContacts.length === 0) {
      const fallbackPool = primaryPool.length > 0 ? primaryPool : seniorPeople;
      if (fallbackPool.length > 0) {
        const fb = fallbackPool[0].id ? await revealPerson(apiKey, fallbackPool[0].id) : fallbackPool[0];
        const fbName = fb.name || `${fb.first_name || ''} ${fb.last_name || ''}`.trim();
        console.log(`[Apollo] Fallback primary: ${fbName} — ${fb.title} (from ${primaryPool.length > 0 ? 'filtered pool' : 'full pool'})`);
        productContacts.push({
          product: products[0] || null, products: [...products], fullName: fbName,
          title: fb.title || 'Executive', email: fb.email || null,
          linkedinUrl: fb.linkedin_url || null, source: 'apollo',
          confidence: fb.email ? 'medium' : 'low',
        });
      }
    }

    // ── Call 2: Fetch functional secondary contacts ──
    const functionalPeople = await searchFunctionalContacts(apiKey, cleanName, orgId, products);

    // Merge Call 1 + Call 2 candidates, deduplicate by name
    const seenNames = new Set();
    const mergedCandidates = [];
    for (const person of [...seniorPeople, ...functionalPeople]) {
      const name = `${(person.first_name || '').toLowerCase()} ${(person.last_name || person.last_name_obfuscated || '').toLowerCase()}`.trim();
      if (seenNames.has(name)) continue;
      seenNames.add(name);
      mergedCandidates.push(person);
    }
    console.log(`[Apollo] Merged candidates: ${seniorPeople.length} (Call 1) + ${functionalPeople.length} (Call 2) = ${mergedCandidates.length} unique`);

    // Score and sort all merged candidates for the secondary list
    const globalCandidates = mergedCandidates.map((person) => {
      const { score, matchedProduct } = scorePersonForProducts(person, products, tier);
      return { ...person, score: score + (person.has_email ? 30 : 0) + getSeniority(person.title), matchedProduct };
    });
    globalCandidates.sort((a, b) => b.score - a.score);

    let allCandidates = await revealCandidates(
      apiKey,
      globalCandidates.slice(0, 15),
      org?.website_url
    );
    // Flag domain mismatches on revealed candidates
    if (companyRoot && allCandidates.length > 1) {
      for (const c of allCandidates) {
        const root = getEmailRoot(c.email);
        if (root && root !== companyRoot) {
          c.domainMismatch = true;
          c.verified = false; // override Apollo verified flag
          console.log(`[Apollo] DOMAIN MISMATCH (secondary): ${c.name} — email root "${root}" != "${companyRoot}"`);
        }
      }
    }
    console.log(`[Apollo] allCandidates after reveal: ${allCandidates.length} contacts`);

    // ── DEBUG: EA-specific logging ──
    const isEADebug = companyName.toLowerCase().includes('electronic arts');
    if (isEADebug) {
      console.log(`[EA-DEBUG] ===== ELECTRONIC ARTS DEBUG START =====`);
      console.log(`[EA-DEBUG] Tier: ${tier} (${tierLabel}), Employees: ${employeeCount}`);
      console.log(`[EA-DEBUG] Call 1 (senior) returned: ${seniorPeople.length} contacts`);
      seniorPeople.forEach((p, i) => console.log(`[EA-DEBUG]   Call1[${i}]: ${p.first_name} ${p.last_name || p.last_name_obfuscated} — "${p.title}" (seniority=${getSeniority(p.title)})`));
      console.log(`[EA-DEBUG] Call 2 (functional) returned: ${functionalPeople.length} contacts`);
      functionalPeople.forEach((p, i) => console.log(`[EA-DEBUG]   Call2[${i}]: ${p.first_name} ${p.last_name || p.last_name_obfuscated} — "${p.title}"`));
      console.log(`[EA-DEBUG] Merged candidates: ${mergedCandidates.length}`);
      console.log(`[EA-DEBUG] Top 15 scored (sent to reveal):`);
      globalCandidates.slice(0, 15).forEach((p, i) => console.log(`[EA-DEBUG]   Scored[${i}]: ${p.first_name} ${p.last_name || p.last_name_obfuscated} — "${p.title}" score=${p.score} product=${p.matchedProduct}`));
      console.log(`[EA-DEBUG] After reveal: ${allCandidates.length} candidates`);
      allCandidates.forEach((c, i) => console.log(`[EA-DEBUG]   Revealed[${i}]: ${c.name} — "${c.title}" email=${c.email ? 'yes' : 'no'} verified=${c.verified} score=${c.score}`));
      console.log(`[EA-DEBUG] productContacts (primary): ${productContacts.length}`);
      productContacts.forEach((pc) => console.log(`[EA-DEBUG]   Primary: ${pc.fullName} — "${pc.title}" (${pc.products.join(',')})`));
    }

    // ── Post-merge fallback: if still no primary but we have candidates, pick one ──
    if (productContacts.length === 0 && allCandidates.length > 0) {
      const fb = allCandidates[0];
      console.log(`[Apollo] Post-merge fallback primary: ${fb.name} — ${fb.title}`);
      productContacts.push({
        product: products[0] || null, products: [...products],
        fullName: fb.name,
        title: fb.title || 'Executive',
        email: fb.email || null,
        linkedinUrl: fb.linkedinUrl || null,
        source: 'apollo',
        confidence: fb.email ? 'medium' : 'low',
      });
    }

    // ── Secondary list: tier-based filtering ──
    // Remove primary contacts from secondary list
    const primaryNames = new Set(productContacts.map(pc => pc.fullName?.toLowerCase()));
    let filteredSecondary = allCandidates.filter(c => !primaryNames.has(c.name?.toLowerCase()));

    // Apply tier-specific secondary exclusions
    const secExclusions = SECONDARY_EXCLUSIONS[tier] || [];
    if (secExclusions.length > 0) {
      const afterExclusion = filteredSecondary.filter(c => {
        const t = (c.title || '').toLowerCase();
        return !secExclusions.some(ex => t.includes(ex));
      });
      // If after filtering <2 remain, relax filters — show all except primary
      if (afterExclusion.length >= 2 || filteredSecondary.length < 2) {
        filteredSecondary = afterExclusion;
      }
      // else: keep filteredSecondary unfiltered (already has primary removed)
    }

    // Sort by seniority: EVP/SVP → VP → Director/Head → others
    filteredSecondary.sort((a, b) => getSeniority(b.title) - getSeniority(a.title));

    if (isEADebug) {
      console.log(`[EA-DEBUG] Secondary filtering:`);
      console.log(`[EA-DEBUG]   Primary names removed: [${[...primaryNames].join(', ')}]`);
      console.log(`[EA-DEBUG]   After removing primary: ${allCandidates.filter(c => !primaryNames.has(c.name?.toLowerCase())).length} candidates`);
      console.log(`[EA-DEBUG]   Tier ${tier} secondary exclusions: [${secExclusions.join(', ')}]`);
      const beforeExclusion = allCandidates.filter(c => !primaryNames.has(c.name?.toLowerCase()));
      beforeExclusion.forEach((c) => {
        const t = (c.title || '').toLowerCase();
        const excluded = secExclusions.some(ex => t.includes(ex));
        if (excluded) console.log(`[EA-DEBUG]   EXCLUDED from secondary: ${c.name} — "${c.title}"`);
      });
      console.log(`[EA-DEBUG]   Final secondary list: ${filteredSecondary.length} contacts`);
      filteredSecondary.forEach((c, i) => console.log(`[EA-DEBUG]   Secondary[${i}]: ${c.name} — "${c.title}" seniority=${getSeniority(c.title)} email=${c.email ? 'yes' : 'no'} verified=${c.verified}`));
      console.log(`[EA-DEBUG] ===== ELECTRONIC ARTS DEBUG END =====`);
    }

    allCandidates = filteredSecondary;

    // Only show "no qualified" if Apollo returned zero contacts total
    if (productContacts.length === 0 && mergedCandidates.length === 0) {
      console.log(`[Apollo] No contacts at all for "${companyName}"`);
      return {
        fullName: 'No qualified contact found',
        title: 'Select manually from contacts below',
        email: null, linkedinUrl: null, source: 'none', confidence: 'low',
        matchedProduct: products[0] || null,
        knownPOC: knownContact, allCandidates,
        productContacts: [], employeeCount, tier, tierLabel,
        noQualifiedContact: true,
      };
    }

    const primary = productContacts[0];
    console.log(`[Apollo] PRIMARY for "${companyName}" (Tier ${tier} ${tierLabel}): "${primary.fullName}" — "${primary.title}"`);
    console.log(`[Apollo] Product contacts: [${productContacts.map((pc) => `${pc.fullName} (${pc.title})`).join(', ')}]`);
    console.log(`[Apollo] allCandidates for secondary: ${allCandidates.length} contacts`);

    return {
      fullName: primary.fullName,
      title: primary.title,
      email: primary.email,
      linkedinUrl: primary.linkedinUrl,
      source: primary.source,
      confidence: primary.confidence,
      matchedProduct: primary.products.join(', '),
      knownPOC: knownContact,
      allCandidates,
      productContacts,
      employeeCount,
      tier,
      tierLabel,
    };
  } catch (err) {
    console.error('[Apollo] Enrichment error:', err.message);
    return buildFallback(companyName, products, anchorContact);
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Apollo API helpers ──────────────────────────────────────────────

async function revealPerson(apiKey, personId) {
  try {
    const res = await fetch(`${APOLLO_API_BASE}/api/v1/people/match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({ id: personId }),
    });
    const data = await res.json();
    return data.person || data;
  } catch (err) {
    console.warn(`[Apollo] Failed to reveal person ${personId}:`, err.message);
    return {};
  }
}

/**
 * Reveal full details for a list of candidates (name, email, LinkedIn).
 * Calls the reveal API for each in parallel.
 */
async function revealCandidates(apiKey, candidates, companyWebsite) {
  // Extract expected email domain from company website
  let expectedDomain = null;
  if (companyWebsite) {
    try {
      const url = new URL(companyWebsite.startsWith('http') ? companyWebsite : `https://${companyWebsite}`);
      expectedDomain = url.hostname.replace(/^www\./, '');
    } catch {}
  }
  const revealed = await Promise.all(
    candidates.map(async (c) => {
      if (!c.id) {
        return {
          name: c.name || `${c.first_name || ''} ${c.last_name || c.last_name_obfuscated || ''}`.trim(),
          title: c.title,
          email: c.email || null,
          linkedinUrl: c.linkedin_url || null,
          score: c.score,
          matchedProduct: c.matchedProduct,
          verified: false,
        };
      }
      try {
        const full = await revealPerson(apiKey, c.id);
        const name = full.name || `${full.first_name || ''} ${full.last_name || ''}`.trim();
        const email = full.email || null;
        const linkedinUrl = full.linkedin_url || null;

        // Validate: check org match and email domain
        const revealedOrg = (full.organization?.name || '').toLowerCase();
        const searchOrg = (c.organization?.name || '').toLowerCase();
        const orgMatch = revealedOrg === searchOrg || !revealedOrg;

        // Check email domain matches company (compare base name, ignore TLD differences like .com vs .ca)
        let emailDomainMatch = true;
        if (email && expectedDomain) {
          const emailDomain = email.split('@')[1] || '';
          const emailBase = emailDomain.split('.')[0];
          const expectedBase = expectedDomain.split('.')[0];
          emailDomainMatch = emailBase === expectedBase || emailDomain === expectedDomain || emailDomain.endsWith('.' + expectedDomain);
        }

        // Validate LinkedIn slug matches the person's name
        let linkedinNameMatch = true;
        if (linkedinUrl && name) {
          const slug = linkedinUrl.split('/in/').pop()?.split('/')[0]?.split('?')[0] || '';
          const slugLower = slug.toLowerCase().replace(/[^a-z]/g, '');
          const nameParts = name.toLowerCase().split(/\s+/).map(p => p.replace(/[^a-z]/g, ''));
          // At least the first name should appear in the LinkedIn slug
          const firstInSlug = nameParts[0] && slugLower.includes(nameParts[0]);
          const lastInSlug = nameParts.length > 1 && nameParts[nameParts.length - 1] && slugLower.includes(nameParts[nameParts.length - 1]);
          linkedinNameMatch = firstInSlug || lastInSlug;
          if (!linkedinNameMatch) {
            console.log(`[Apollo] LinkedIn mismatch: name="${name}" slug="${slug}" — demoting`);
          }
        }

        const isVerified = !!(email && linkedinUrl && orgMatch && emailDomainMatch && linkedinNameMatch);
        return {
          name,
          title: full.title || c.title,
          email,
          linkedinUrl,
          score: linkedinNameMatch ? c.score : c.score * 0.3, // heavily demote mismatches
          matchedProduct: c.matchedProduct,
          verified: isVerified,
        };
      } catch {
        return {
          name: c.name || `${c.first_name || ''} ${c.last_name_obfuscated || ''}`.trim(),
          title: c.title,
          email: null,
          linkedinUrl: null,
          score: c.score,
          matchedProduct: c.matchedProduct,
          verified: false,
        };
      }
    })
  );

  // Filter out entries with invalid names
  const filtered = revealed.filter((r) => {
    const name = (r.name || '').trim();
    // Company names
    if (/\b(inc|llc|corp|ltd|gmbh|plc|company|group|solutions|technologies)\b/i.test(name)) {
      console.log(`[Apollo] Dropped non-person name: "${name}"`);
      return false;
    }
    // Names that are too short or look like codes/initials
    const words = name.split(/\s+/);
    if (words.length < 2) return false;
    // Both first and last name should be at least 2 real characters
    // Both parts need at least 2 chars (allows "Wu", "Li", "Lu" etc.)
    if (words[0].length < 2 || words[words.length - 1].length < 2) {
      console.log(`[Apollo] Dropped suspicious name: "${name}"`);
      return false;
    }
    // If both first and last are <=3 chars AND no vowels, likely garbage
    if (words[0].length <= 3 && words[words.length - 1].length <= 3) {
      const hasVowel = /[aeiou]/i.test(words[0]) && /[aeiou]/i.test(words[words.length - 1]);
      if (!hasVowel) {
        console.log(`[Apollo] Dropped suspicious name: "${name}" (too short, no vowels)`);
        return false;
      }
    }
    return true;
  });

  // Sort: verified contacts with email first, then by score
  filtered.sort((a, b) => {
    if (a.verified && !b.verified) return -1;
    if (!a.verified && b.verified) return 1;
    if (a.email && !b.email) return -1;
    if (!a.email && b.email) return 1;
    return b.score - a.score;
  });

  return filtered;
}

async function findOrganization(apiKey, companyName) {
  const res = await fetch(`${APOLLO_API_BASE}/api/v1/mixed_companies/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({
      q_organization_name: companyName,
      page: 1,
      per_page: 5,
    }),
  });
  const data = await res.json();
  const orgs = data.organizations || data.accounts || [];

  // Find the best org match — prefer shortest name that contains the search term
  // This picks "General Motors" over "General Motors Components Holdings, LLC"
  function stripOrgSuffix(name) {
    return name.toLowerCase()
      .replace(/\b(inc|corp|corporation|ltd|llc|plc|company|co|holdings|holding|group|international|intl)\b\.?/gi, '')
      .replace(/[.,]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const normInput = stripOrgSuffix(companyName);

  const scored = orgs.map((org) => {
    const normOrg = stripOrgSuffix(org.name || '');
    let score = 0;
    if (normOrg === normInput) score = 100; // exact match
    else if (normOrg.startsWith(normInput)) score = 80;
    else if (normInput.startsWith(normOrg)) score = 70;
    else score = 0;
    // Prefer shorter names (parent over subsidiary) — penalty for extra words
    score -= (normOrg.split(' ').length - normInput.split(' ').length) * 5;
    return { org, score, normOrg };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored.find((s) => s.score > 0);
  if (best) {
    console.log(`[Apollo] Org match: "${best.normOrg}" (score=${best.score})`);
    return best.org;
  }
  return orgs[0] || null;
}

// ── Product-specific functional titles for secondary contact search (Call 2) ──
const FUNCTIONAL_TITLES = {
  Care: [
    'VP Customer', 'Vice President Customer', 'SVP Customer', 'Director Customer Experience',
    'Head of Customer', 'VP Support', 'Director Support', 'VP Service', 'Head of Service',
    'VP Client', 'Director Client Success', 'Senior Director Customer',
  ],
  Community: [
    'VP Digital', 'Vice President Digital', 'SVP Digital', 'Director Digital',
    'Head of Community', 'VP Brand', 'Director Brand', 'VP Social', 'Head of Social',
    'Senior Director Digital', 'VP Communications', 'Director Communications',
  ],
  Marketing: [
    'VP Marketing', 'Vice President Marketing', 'SVP Marketing', 'Director Marketing',
    'Head of Marketing', 'VP Growth', 'Director Growth', 'Senior Director Marketing',
    'VP Marketing Technology', 'Director Marketing Operations',
  ],
};

async function searchFunctionalContacts(apiKey, companyName, orgId, products) {
  // Build combined title list from all relevant products
  const titles = [];
  for (const product of products) {
    const productTitles = FUNCTIONAL_TITLES[product];
    if (productTitles) titles.push(...productTitles);
  }
  if (titles.length === 0) return [];

  // Deduplicate
  const uniqueTitles = [...new Set(titles)];

  const searchBody = {
    q_organization_name: companyName,
    person_titles: uniqueTitles,
    page: 1,
    per_page: 15,
  };

  try {
    const res = await fetch(`${APOLLO_API_BASE}/api/v1/mixed_people/api_search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify(searchBody),
    });
    const data = await res.json();
    let people = data.people || [];

    // Apply same company name filtering as searchSeniorPeople
    const normCompany = companyName.toLowerCase().replace(/[.,\s]+(inc|corp|corporation|ltd|llc|plc|company|co)\.?$/i, '').trim();
    people = people.filter((p) => {
      const pOrg = (p.organization?.name || '').toLowerCase().replace(/[.,\s]+(inc|corp|corporation|ltd|llc|plc|company|co)\.?$/i, '').trim();
      if (pOrg === normCompany) return true;
      const regex = new RegExp(`^${escapeRegex(normCompany)}(\\s*[,.]|$)`, 'i');
      return regex.test(pOrg);
    });

    // Filter out non-person entries
    people = people.filter((p) => {
      const first = (p.first_name || '').trim();
      const last = (p.last_name || p.last_name_obfuscated || '').trim();
      if (!first || !last) return false;
      if (first.split(/\s+/).length > 2) return false;
      return true;
    });

    // Filter out EA/admin titles
    people = people.filter((p) => {
      const t = (p.title || '').toLowerCase();
      return !EA_ADMIN_EXCLUSIONS.some((ex) => t.includes(ex));
    });

    console.log(`[Apollo] Call 2 (functional): ${people.length} contacts found for [${products.join(', ')}]`);
    return people;
  } catch (err) {
    console.warn(`[Apollo] Call 2 error:`, err.message);
    return [];
  }
}

async function searchSeniorPeople(apiKey, companyName, orgId) {
  const titles = [
    'Chief', 'CEO', 'COO', 'CMO', 'CRO', 'CCO', 'CDO', 'CFO', 'CTO',
    'President',
    'Executive Vice President', 'EVP',
    'Senior Vice President', 'SVP',
    'Vice President', 'VP',
    'Head of',
  ];

  // Try with org ID first if available, then without if that returns nothing
  // Search by company name (organization_ids doesn't work with api_search)
  const searchBody = {
    q_organization_name: companyName,
    person_titles: titles,
    page: 1,
    per_page: 25,
  };

  const res = await fetch(`${APOLLO_API_BASE}/api/v1/mixed_people/api_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify(searchBody),
  });
  const data = await res.json();
  let people = data.people || [];

  // Filter out people from wrong companies — STRICT matching
  // "Intuit Salud" must NOT match "Intuit" — only exact match or known patterns
  const normCompany = companyName.toLowerCase().replace(/[.,\s]+(inc|corp|corporation|ltd|llc|plc|company|co)\.?$/i, '').trim();
  console.log(`[Apollo] Raw people search returned ${people.length} results, filtering for "${normCompany}"`);
  if (people.length > 0) {
    console.log(`[Apollo] Sample orgs:`, people.slice(0, 5).map(p => p.organization?.name || 'N/A'));
  }
  people = people.filter((p) => {
    const rawOrg = (p.organization?.name || '');
    const pOrg = rawOrg.toLowerCase().replace(/[.,\s]+(inc|corp|corporation|ltd|llc|plc|company|co)\.?$/i, '').trim();
    // Exact match after normalization
    if (pOrg === normCompany) return true;
    // Allow if org is "<company> <division>" only if the next char after company name
    // is NOT a letter (i.e. it's a space, comma, dash, or end of string)
    // This prevents "Intuit Salud" from matching "Intuit" but allows "Intuit, Inc."
    // Actually: require the org name to EQUAL the company name. Period.
    // Exception: company is a substring AND the org name contains it as a standalone word
    // Use word boundary check
    const regex = new RegExp(`^${escapeRegex(normCompany)}(\\s*[,.]|$)`, 'i');
    return regex.test(pOrg);
  });
  console.log(`[Apollo] After org-name filter: ${people.length} people at "${normCompany}"`);

  // Filter out entries that look like company names or bad data
  people = people.filter((p) => {
    const first = (p.first_name || '').trim();
    const last = (p.last_name || p.last_name_obfuscated || '').trim();
    const name = `${first} ${last}`;
    const lower = name.toLowerCase().trim();

    // Reject company names
    if (/\b(inc|llc|corp|ltd|gmbh|plc|co\b|company|group|holdings|solutions|technologies|consulting)\b/i.test(lower)) {
      console.log(`[Apollo] Filtered non-person: "${name}"`);
      return false;
    }
    // Reject first name with multiple words (org names)
    if (first.split(/\s+/).length > 2) {
      console.log(`[Apollo] Filtered non-person: "${name}" (multi-word first name)`);
      return false;
    }
    // Reject if first name and last name look swapped or are the same
    if (first.toLowerCase() === last.toLowerCase().replace(/\*/g, '')) {
      console.log(`[Apollo] Filtered suspicious: "${name}" (first=last)`);
      return false;
    }
    // Reject names where first name is typically a surname (heuristic: first name
    // ends in 'ez', 'son', 'ski' etc. and last name is a common first name)
    const surnamePatterns = /^(velazquez|rodriguez|martinez|gonzalez|hernandez|williams|johnson|jackson|anderson|thompson|garcia|lopez|wilson|moore|taylor|thomas|harris|robinson|clark|lewis|lee|walker|hall|allen|young|king|wright|hill|scott|green|baker|adams|nelson|carter|mitchell|roberts|turner|phillips|campbell|parker|evans|edwards|collins|stewart|sanchez|morris|rogers|reed|cook|morgan|bell|murphy|bailey|rivera|cooper|richardson|cox|howard|ward|torres|peterson|gray|ramirez|james|watson|brooks|kelly|sanders|price|bennett|wood|barnes|ross|henderson|coleman|jenkins|perry|powell|long|patterson|hughes|flores|washington|butler|simmons|foster|gonzales|bryant|alexander|russell|griffin|diaz|hayes)$/i;
    if (surnamePatterns.test(first.toLowerCase())) {
      console.log(`[Apollo] Filtered suspicious: "${name}" (first name looks like a surname)`);
      return false;
    }
    return true;
  });

  // Sort by seniority
  people.sort((a, b) => getSeniority(b.title) - getSeniority(a.title));
  return people;
}

async function searchByName(apiKey, companyName, orgId, personName) {
  const res = await fetch(`${APOLLO_API_BASE}/api/v1/mixed_people/api_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({
      q_organization_name: companyName,
      q_keywords: personName,
      page: 1,
      per_page: 5,
    }),
  });
  const data = await res.json();
  return data.people || [];
}

// ── Fallback ────────────────────────────────────────────────────────

function buildFallback(companyName, products, anchorContact) {
  // Determine best target title based on products
  let targetTitle = 'Executive';
  for (const product of products) {
    const map = PRODUCT_TITLE_MAP[product];
    if (map) {
      targetTitle = map.ideal[0];
      break;
    }
  }

  const hasAnchor = anchorContact && anchorContact.name && anchorContact.name !== 'Unknown';

  return {
    fullName: hasAnchor ? anchorContact.name : null,
    title: hasAnchor ? (anchorContact.title || `(Sheet POC — target: ${targetTitle})`) : null,
    email: null,
    linkedinUrl: null,
    source: hasAnchor ? 'sheet_hint' : 'none',
    confidence: 'low',
    matchedProduct: products[0] || null,
    knownPOC: hasAnchor ? { name: anchorContact.name, title: anchorContact.title, source: 'sheet' } : null,
    allCandidates: [],
    productContacts: [],
    noContacts: !hasAnchor, // true when Apollo returned nothing and no sheet anchor
    companyName, // pass through for the "Search on Apollo" link
  };
}
