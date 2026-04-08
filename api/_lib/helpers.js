// ── Seniority ranking for anchor contact selection ─────────────────
const VP_PLUS_PATTERNS = [
  { pattern: /\b(ceo|chief executive)\b/i, rank: 100 },
  { pattern: /\b(coo|chief operating)\b/i, rank: 95 },
  { pattern: /\b(cmo|chief marketing)\b/i, rank: 93 },
  { pattern: /\b(cco|chief customer|chief commercial)\b/i, rank: 92 },
  { pattern: /\b(cro|chief revenue)\b/i, rank: 91 },
  { pattern: /\b(cdo|chief digital)\b/i, rank: 90 },
  { pattern: /\bchief\b/i, rank: 88 },
  { pattern: /\bpresident\b(?!.*\bvice\b)/i, rank: 85 },
  { pattern: /\b(managing director)\b/i, rank: 82 },
  { pattern: /\b(general manager)\b/i, rank: 80 },
  { pattern: /\b(evp|executive vice president)\b/i, rank: 75 },
  { pattern: /\bsvp\b|\bsenior vice president\b/i, rank: 70 },
  { pattern: /\bvp\b|\bvice president\b/i, rank: 60 },
];

function getTitleRank(title) {
  if (!title) return 0;
  for (const { pattern, rank } of VP_PLUS_PATTERNS) {
    if (pattern.test(title)) return rank;
  }
  return 0;
}

function splitPOCField(raw) {
  if (!raw || raw.length < 2) return [];
  return raw
    .split(/[\n\r]+/)
    .flatMap((line) => line.split(/[;\/]/))
    .map((s) => s.trim())
    .map((s) => s.replace(/^\d+[\.\)]\s*/, '').trim())
    .map((s) => s.replace(/^[A-Za-z]+[\-:]\s*/, '').trim())
    .filter((s) => s.length >= 3);
}

function isPersonName(str) {
  if (!str || str.length < 3) return false;
  if (/\b(inc|llc|corp|ltd|gmbh|plc)\b/i.test(str)) return false;
  if (/^[A-Z0-9]+$/.test(str)) return false;
  const words = str.split(/\s+/);
  return words.length >= 2 && words[0].length > 1;
}

export function parseAnchorContact(rawPOC, rawPOCTitle) {
  const names = splitPOCField(rawPOC);
  const titles = splitPOCField(rawPOCTitle);

  const contacts = names
    .map((name, i) => ({
      name,
      title: titles[i] || null,
      seniorityRank: getTitleRank(titles[i]),
    }))
    .filter((c) => isPersonName(c.name));

  const vpPlus = contacts.filter((c) => c.seniorityRank >= 60);

  if (vpPlus.length === 0) {
    const fallback = contacts[0];
    return fallback ? { name: fallback.name, title: fallback.title, seniorityRank: 0 } : null;
  }

  vpPlus.sort((a, b) => b.seniorityRank - a.seniorityRank);
  return vpPlus[0];
}

export function stripLegalSuffix(name) {
  return name
    .replace(/\s+(Holdings\s+Group|Holdings\s+LLC|Holdings\s+Inc\.?|Holdings\s+Corp\.?|Holdings)\b\.?/gi, '')
    .replace(/[,\s]+(Inc\.?|Incorporated|Corp\.?|Corporation|LLC|Ltd\.?|Limited|Co\.?|Company|Group|Plc|SA|AG|GmbH)\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatProductPhrase(products) {
  if (products.length === 1) return `the Khoros ${products[0]} platform`;
  if (products.length === 2) return `the Khoros ${products[0]} and ${products[1]} platforms`;
  return `the Khoros ${products.slice(0, -1).join(', ')}, and ${products[products.length - 1]} platforms`;
}

export function generateDraft(contactName, contactTitle, companyName, products) {
  const firstName = contactName.split(' ')[0];
  const cleanCompany = stripLegalSuffix(companyName);
  const platformPhrase = formatProductPhrase(products);

  const subject = `${firstName} — ${cleanCompany} + Khoros, wanted to connect personally`;

  const body = `Hi ${firstName},

I'm Suuchi Ramesh — I lead the commercial and customer organization at IgniteTech, which now owns Khoros. I'm reaching out directly because ${cleanCompany} is one of our most important partnerships, and I'd like to use this moment to build the right executive relationship.

We're making real investment in ${platformPhrase} and I'd rather you hear that from me than secondhand. I'm personally committed to making sure ${cleanCompany} gets the full picture.

Would you have 20-30 minutes in the next couple of weeks? I'd welcome the chance to connect.

Best,
Suuchi Ramesh
Chief Customer & Commercial Officer
IgniteTech / Khoros`;

  return { subject, draft: body };
}
