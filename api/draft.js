import { generateDraft } from './_lib/helpers.js';
import { requireAuth } from './_lib/session.js';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const { contactName, contactTitle, companyName, products } = req.body;
    const result = generateDraft(contactName, contactTitle, companyName, products);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
