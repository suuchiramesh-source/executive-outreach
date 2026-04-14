import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { fetchARRData, fetchProductData, fetchExtendedProductData } from './sheets.js';
import { matchAccounts } from './matcher.js';
import { enrichContact, searchContactsByLocation } from './apollo.js';
import { searchSalesforce } from './salesforce.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// ── Password protection ────────────────────────────────────────────
const APP_PASSWORD = process.env.APP_PASSWORD;

app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  if (!APP_PASSWORD) {
    // No password set — allow access
    return res.json({ success: true });
  }
  if (password === APP_PASSWORD) {
    return res.json({ success: true });
  }
  return res.status(401).json({ success: false, error: 'Incorrect password' });
});

// ── Cached merged data ──────────────────────────────────────────────
let cachedAccounts = null;
let cacheTimestamp = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 min

async function getAccounts() {
  if (cachedAccounts && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedAccounts;
  }
  try {
    // Fetch sequentially with a pause to avoid Google Sheets API rate limits
    const arrRows = await fetchARRData();
    await new Promise((r) => setTimeout(r, 2000));
    const productRows = await fetchProductData();
    const accounts = matchAccounts(arrRows, productRows);
    // Tag each account with whether it has a VP+ anchor contact from the sheet
    for (const acct of accounts) {
      const anchor = parseAnchorContact(acct.executivePOC, acct.executivePOCTitle);
      acct.hasAnchorContact = !!(anchor);
    }
    cachedAccounts = accounts;
    cacheTimestamp = Date.now();
    return cachedAccounts;
  } catch (err) {
    // If rate-limited but we have stale cache, serve it instead of failing
    if (cachedAccounts && (err?.code === 429 || err?.status === 429)) {
      console.warn('[Cache] Rate limited — serving stale cache');
      return cachedAccounts;
    }
    throw err;
  }
}

// ── Routes ──────────────────────────────────────────────────────────

// GET /api/accounts — filtered, merged account list
app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await getAccounts();
    res.json(accounts);
  } catch (err) {
    console.error('Error fetching accounts:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/accounts-extended — extended product accounts (Jive, Gensym, Computron, DNN)
const VALID_EXTENDED = ['Jive', 'Gensym', 'Computron', 'DNN'];
let extCache = {};
let extCacheTs = {};
app.get('/api/accounts-extended', async (req, res) => {
  try {
    const product = req.query.product;
    if (!product || !VALID_EXTENDED.includes(product)) {
      return res.status(400).json({ error: `Invalid product. Must be one of: ${VALID_EXTENDED.join(', ')}` });
    }
    const key = product.toLowerCase();
    const refresh = req.query.refresh === '1';
    if (!refresh && extCache[key] && Date.now() - (extCacheTs[key] || 0) < CACHE_TTL) {
      return res.json(extCache[key]);
    }
    const accounts = await fetchExtendedProductData(product);
    extCache[key] = accounts;
    extCacheTs[key] = Date.now();
    res.json(accounts);
  } catch (err) {
    console.error('Error fetching extended accounts:', err);
    res.status(500).json({ error: err.message });
  }
});

// Force refresh cache
app.post('/api/accounts/refresh', async (req, res) => {
  try {
    cachedAccounts = null;
    const accounts = await getAccounts();
    res.json(accounts);
  } catch (err) {
    console.error('Error refreshing accounts:', err);
    res.status(500).json({ error: err.message });
  }
});

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

/**
 * Split a POC field (col N or col O) into individual entries.
 * Handles numbered lists, newlines, slashes, semicolons, and label prefixes.
 */
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

/**
 * Validate that a string looks like a person name.
 */
function isPersonName(str) {
  if (!str || str.length < 3) return false;
  if (/\b(inc|llc|corp|ltd|gmbh|plc)\b/i.test(str)) return false;
  if (/^[A-Z0-9]+$/.test(str)) return false; // all caps codes like "O1"
  const words = str.split(/\s+/);
  return words.length >= 2 && words[0].length > 1;
}

/**
 * Parse Executive POC (col N) and Executive POC Title (col O) to find
 * the most senior VP+ contact as the "anchor contact" for the account.
 *
 * Returns { name, title, seniorityRank } or null.
 */
function parseAnchorContact(rawPOC, rawPOCTitle) {
  const names = splitPOCField(rawPOC);
  const titles = splitPOCField(rawPOCTitle);

  // Pair names with titles by index; unpaired names get null title
  const contacts = names
    .map((name, i) => ({
      name,
      title: titles[i] || null,
      seniorityRank: getTitleRank(titles[i]),
    }))
    .filter((c) => isPersonName(c.name));

  // Keep only VP+ contacts (rank >= 60)
  const vpPlus = contacts.filter((c) => c.seniorityRank >= 60);

  if (vpPlus.length === 0) {
    // No VP+ with titles — return the first valid name as a low-confidence anchor
    const fallback = contacts[0];
    return fallback ? { name: fallback.name, title: fallback.title, seniorityRank: 0 } : null;
  }

  // Return the most senior one
  vpPlus.sort((a, b) => b.seniorityRank - a.seniorityRank);
  return vpPlus[0];
}

// POST /api/enrich — Apollo + Salesforce contact enrichment
app.post('/api/enrich', async (req, res) => {
  try {
    const { companyName, products, executivePOC, executivePOCTitle, totalARR } = req.body;
    const anchorContact = parseAnchorContact(executivePOC, executivePOCTitle);
    console.log(`[Enrich] "${companyName}" — anchor: ${anchorContact ? `${anchorContact.name} (${anchorContact.title}, rank=${anchorContact.seniorityRank})` : 'none'}, ARR: $${totalARR}`);
    const [apolloResult, sfResult] = await Promise.all([
      enrichContact(companyName, products, anchorContact, totalARR),
      searchSalesforce(companyName).catch(() => null),
    ]);
    res.json({
      contact: apolloResult,
      salesforceSignal: sfResult,
    });
  } catch (err) {
    console.error('Error enriching contact:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/draft — generate email draft
app.post('/api/draft', async (req, res) => {
  try {
    const { contactName, contactTitle, companyName, products } = req.body;
    const result = generateDraft(contactName, contactTitle, companyName, products);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Strip legal suffixes from a company name for use in emails.
 * "General Motors Holdings LLC" → "General Motors"
 */
function stripLegalSuffix(name) {
  return name
    .replace(/\s+(Holdings\s+Group|Holdings\s+LLC|Holdings\s+Inc\.?|Holdings\s+Corp\.?|Holdings)\b\.?/gi, '')
    .replace(/[,\s]+(Inc\.?|Incorporated|Corp\.?|Corporation|LLC|Ltd\.?|Limited|Co\.?|Company|Group|Plc|SA|AG|GmbH)\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Format a product list into natural English:
 *   ["Care"] → "the Khoros Care platform"
 *   ["Care", "Community"] → "the Khoros Care and Community platforms"
 *   ["Care", "Community", "Marketing"] → "the Khoros Care, Community, and Marketing platforms"
 */
function formatProductPhrase(products) {
  if (products.length === 1) return `the Khoros ${products[0]} platform`;
  if (products.length === 2) return `the Khoros ${products[0]} and ${products[1]} platforms`;
  return `the Khoros ${products.slice(0, -1).join(', ')}, and ${products[products.length - 1]} platforms`;
}

function generateDraft(contactName, contactTitle, companyName, products) {
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

// ── Visit Outreach — location-based contact search ────────────────
app.post('/api/visit-search', async (req, res) => {
  try {
    const { companyName, location } = req.body;
    if (!companyName || !location) {
      return res.status(400).json({ error: 'companyName and location are required' });
    }
    const contacts = await searchContactsByLocation(companyName, location);
    res.json({ contacts });
  } catch (err) {
    console.error('[Visit] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Gmail sent check ──────────────────────────────────────────────
app.post('/api/check-sent', async (req, res) => {
  const { emails } = req.body;
  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return res.json({ results: {} });
  }
  try {
    const auth = getGmailAuth();
    const gmail = google.gmail({ version: 'v1', auth });
    const results = {};
    const BATCH = 5;
    for (let i = 0; i < emails.length; i += BATCH) {
      const batch = emails.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        batch.map(async (email) => {
          try {
            const resp = await gmail.users.messages.list({ userId: 'me', q: `in:sent to:${email}`, maxResults: 1 });
            const messages = resp.data.messages || [];
            if (messages.length === 0) return { email, sent: false };
            const msg = await gmail.users.messages.get({ userId: 'me', id: messages[0].id, format: 'metadata', metadataHeaders: ['Date'] });
            const dateHeader = msg.data.payload?.headers?.find(h => h.name === 'Date');
            const lastDate = dateHeader ? new Date(dateHeader.value).toISOString().split('T')[0] : null;
            return { email, sent: true, lastDate };
          } catch { return { email, sent: false }; }
        })
      );
      for (const r of batchResults) results[r.email] = { sent: r.sent, lastDate: r.lastDate || null };
    }
    res.json({ results });
  } catch (err) {
    console.error('[CheckSent] Gmail auth error:', err.message);
    res.json({ results: {}, error: err.message });
  }
});

// ── Hunter.io email verification ───────────────────────────────────
const HUNTER_API_KEY = process.env.HUNTER_API_KEY;

app.post('/api/verify-emails', async (req, res) => {
  if (!HUNTER_API_KEY) {
    return res.json({ results: {} });
  }
  try {
    const { emails } = req.body; // array of email strings
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.json({ results: {} });
    }

    const results = {};
    const BATCH_SIZE = 5;

    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (email) => {
          try {
            const url = `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${HUNTER_API_KEY}`;
            const resp = await fetch(url);
            const data = await resp.json();
            const result = data?.data?.result || data?.data?.status || 'unknown';
            console.log(`[Hunter] ${email} → ${result} (status: ${data?.data?.status})`);
            return { email, status: result };
          } catch (err) {
            console.warn(`[Hunter] Error verifying ${email}:`, err.message);
            return { email, status: 'unknown' };
          }
        })
      );
      for (const r of batchResults) {
        results[r.email] = r.status;
      }
      // 500ms delay between batches
      if (i + BATCH_SIZE < emails.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    res.json({ results });
  } catch (err) {
    console.error('[Hunter] Batch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Gmail draft creation ───────────────────────────────────────────
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'suuchi@ignitetech.com';

function getGmailAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY env var is not set');
  const key = JSON.parse(keyJson);
  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.compose'],
    subject: SENDER_EMAIL, // impersonate the sender via domain-wide delegation
  });
}

app.post('/api/create-draft', async (req, res) => {
  try {
    const { to, cc, subject, body } = req.body;
    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'to, subject, and body are required' });
    }

    const auth = getGmailAuth();
    const gmail = google.gmail({ version: 'v1', auth });

    // Build RFC 2822 email message
    const headers = [
      `From: Suuchi Ramesh <${SENDER_EMAIL}>`,
      `To: ${to}`,
    ];
    if (cc) headers.push(`Cc: ${cc}`);
    headers.push(
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    );
    const rawMessage = headers.join('\r\n');

    // Base64url encode
    const encoded = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const draft = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: { raw: encoded },
      },
    });

    console.log(`[Gmail] Draft created: ${draft.data.id} → ${to}`);
    res.json({ success: true, draftId: draft.data.id });
  } catch (err) {
    console.error('[Gmail] Draft creation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Serve Vite build in production ──────────────────────────────────
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
