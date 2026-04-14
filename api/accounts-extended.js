import { fetchExtendedProductData } from '../server/sheets.js';
import { requireAuth } from './_lib/session.js';

const VALID_PRODUCTS = ['Jive', 'Gensym', 'Computron', 'DNN'];

let cache = {};
let cacheTs = {};
const CACHE_TTL = 15 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const user = requireAuth(req, res);
  if (!user) return;

  const product = req.query.product;
  if (!product || !VALID_PRODUCTS.includes(product)) {
    return res.status(400).json({ error: `Invalid product. Must be one of: ${VALID_PRODUCTS.join(', ')}` });
  }

  try {
    const key = product.toLowerCase();
    const refresh = req.query.refresh === '1';
    if (!refresh && cache[key] && Date.now() - (cacheTs[key] || 0) < CACHE_TTL) {
      return res.json(cache[key]);
    }

    const accounts = await fetchExtendedProductData(product);
    cache[key] = accounts;
    cacheTs[key] = Date.now();
    res.json(accounts);
  } catch (err) {
    console.error(`Error fetching ${product} accounts:`, err);
    res.status(500).json({ error: err.message });
  }
}
