import { getAccounts, clearCache } from '../_lib/accounts-cache.js';
import { requireAuth } from '../_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    clearCache();
    const accounts = await getAccounts();
    res.json(accounts);
  } catch (err) {
    console.error('Error refreshing accounts:', err);
    res.status(500).json({ error: err.message });
  }
}
