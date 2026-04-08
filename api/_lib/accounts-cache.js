import { fetchARRData, fetchProductData } from '../../server/sheets.js';
import { matchAccounts } from '../../server/matcher.js';
import { parseAnchorContact } from './helpers.js';

let cachedAccounts = null;
let cacheTimestamp = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 min

export function clearCache() {
  cachedAccounts = null;
  cacheTimestamp = 0;
}

export async function getAccounts() {
  if (cachedAccounts && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedAccounts;
  }
  try {
    const arrRows = await fetchARRData();
    await new Promise((r) => setTimeout(r, 2000));
    const productRows = await fetchProductData();
    const accounts = matchAccounts(arrRows, productRows);
    for (const acct of accounts) {
      const anchor = parseAnchorContact(acct.executivePOC, acct.executivePOCTitle);
      acct.hasAnchorContact = !!(anchor);
    }
    cachedAccounts = accounts;
    cacheTimestamp = Date.now();
    return cachedAccounts;
  } catch (err) {
    if (cachedAccounts && (err?.code === 429 || err?.status === 429)) {
      console.warn('[Cache] Rate limited — serving stale cache');
      return cachedAccounts;
    }
    throw err;
  }
}
