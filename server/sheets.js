import { google } from 'googleapis';

const ARR_SHEET_ID = '1QxifbT-4udVfJTyMSWfYQNjgVXtH8WKpX26pCJ9jpOg';
const ARR_TAB = 'ARR Sorted';
const PRODUCT_SHEET_ID = '1sy-4gd8a8ptkLXuriQfIvsIkRVdTT4RcVszG3LOm_d8';
const PRODUCT_TAB = 'Current Week Khoros Product Wise ARR';

function getAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY env var is not set');
  }
  const key = JSON.parse(keyJson);
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

async function getSheets() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  return sheets;
}

// Disable gaxios built-in retries — we handle retries ourselves via withRetry()
google.options({ retryConfig: { retry: 0 } });

/**
 * Retry wrapper with exponential backoff for Google Sheets API rate limits.
 * Uses longer delays (15s base) since Google quotas reset per minute.
 */
async function withRetry(fn, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.code || err?.response?.status;
      if (status === 429 && attempt < maxRetries) {
        const delay = Math.min(15000 * Math.pow(2, attempt), 120000);
        console.warn(`[Sheets] Rate limited (429) — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Fetch ARR Sorted tab:
 *   Col A = Customer Name
 *   Col B = Total ARR
 *   Col N = Executive POC (hint)
 *   Col X = Status
 */
export async function fetchARRData() {
  const sheets = await getSheets();
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: ARR_SHEET_ID,
      range: `'${ARR_TAB}'!A:X`,
    })
  );

  const rows = res.data.values || [];
  if (rows.length < 2) return [];

  const header = rows[0];
  console.log('[ARR Sheet] Headers:', header.map((h, i) => `[${i}]${h}`).join(', '));

  const data = rows.slice(1);

  const results = data
    .map((row) => {
      const customerName = (row[0] || '').trim();
      const rawARR = (row[1] || '').replace(/[$,]/g, '');
      const totalARR = parseFloat(rawARR) || 0;
      const executivePOC = (row[13] || '').trim(); // Col N = index 13
      const executivePOCTitle = (row[14] || '').trim(); // Col O = index 14
      const status = (row[23] || '').trim().toLowerCase(); // Col X = index 23

      return { customerName, totalARR, executivePOC, executivePOCTitle, status };
    })
    .filter((r) => {
      const validStatus =
        r.status === 'active' ||
        r.status === 'is active' ||
        r.status.includes('partial cancel');
      return r.customerName && validStatus && r.totalARR >= 100000;
    });

  console.log(`[ARR Sheet] ${results.length} accounts after filtering (active/partial, ARR >= 100K)`);
  if (results.length > 0) {
    console.log('[ARR Sheet] Sample:', results[0]);
  }
  return results;
}

/**
 * Fetch Product Wise ARR tab:
 *   Pull account name and Subscription Line Class (Care / Community / Marketing)
 */
export async function fetchProductData() {
  const sheets = await getSheets();
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: PRODUCT_SHEET_ID,
      range: `'${PRODUCT_TAB}'!A:Z`,
    })
  );

  const rows = res.data.values || [];
  if (rows.length < 3) {
    console.warn('[Product Sheet] Not enough rows');
    return [];
  }

  // Find the real header row — it has column names, not summary data.
  // Scan first 10 rows for one that contains "subscription" or "end user" or "customer"
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const rowText = rows[i].join(' ').toLowerCase();
    if (
      rowText.includes('subscription') ||
      rowText.includes('end user') ||
      rowText.includes('line class') ||
      rowText.includes('customer')
    ) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    console.warn('[Product Sheet] Could not find header row in first 10 rows');
    rows.slice(0, 5).forEach((r, i) => console.warn(`  Row ${i}:`, r));
    return [];
  }

  const rawHeader = rows[headerRowIdx];
  const header = rawHeader.map((h) => (h || '').toLowerCase().trim());
  const data = rows.slice(headerRowIdx + 1);

  console.log(`[Product Sheet] Header at row ${headerRowIdx}:`, rawHeader.map((h, i) => `[${i}]"${h}"`).join(', '));
  console.log(`[Product Sheet] ${data.length} data rows`);

  // Find column indices
  // "End User" is the clean account name; fall back to "Customer" or "Account"
  let nameIdx = header.findIndex((h) => h === 'end user');
  if (nameIdx === -1) nameIdx = header.findIndex((h) => h.includes('end user'));
  if (nameIdx === -1) nameIdx = header.findIndex((h) => h.includes('customer') && !h.includes('subscription'));
  if (nameIdx === -1) nameIdx = header.findIndex((h) => h.includes('account'));
  if (nameIdx === -1) nameIdx = header.findIndex((h) => h.includes('name') && !h.includes('product'));

  // "Subscription Line Class" is the product type
  let classIdx = header.findIndex((h) => h.includes('subscription line class'));
  if (classIdx === -1) classIdx = header.findIndex((h) => h.includes('line class'));
  if (classIdx === -1) classIdx = header.findIndex((h) => h === 'product' || h === 'product type');

  console.log(`[Product Sheet] Name column: [${nameIdx}] "${rawHeader[nameIdx] || 'NOT FOUND'}", Class column: [${classIdx}] "${rawHeader[classIdx] || 'NOT FOUND'}"`);

  if (nameIdx === -1) {
    console.warn('[Product Sheet] FAILED to find account name column. Headers:', header);
    return [];
  }
  if (classIdx === -1) {
    console.warn('[Product Sheet] FAILED to find product class column. Headers:', header);
    return [];
  }

  // Log unique class values
  const uniqueClasses = [...new Set(data.map((row) => (row[classIdx] || '').trim()).filter(Boolean))];
  console.log('[Product Sheet] Unique class values:', uniqueClasses);

  const productMap = [];
  for (const row of data) {
    const accountName = (row[nameIdx] || '').trim();
    const lineClass = (row[classIdx] || '').trim();
    if (accountName && lineClass) {
      productMap.push({ accountName, lineClass });
    }
  }

  console.log(`[Product Sheet] ${productMap.length} account-product pairs extracted`);
  if (productMap.length > 0) {
    console.log('[Product Sheet] Samples:', productMap.slice(0, 5));
  }

  return productMap;
}
