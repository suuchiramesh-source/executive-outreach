import { searchContactsByLocation } from '../server/apollo.js';
import { requireAuth } from './_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const user = requireAuth(req, res);
  if (!user) return;

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
}
