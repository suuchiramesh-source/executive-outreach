import { enrichContact } from '../server/apollo.js';
import { searchSalesforce } from '../server/salesforce.js';
import { parseAnchorContact } from './_lib/helpers.js';
import { requireAuth } from './_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const user = requireAuth(req, res);
  if (!user) return;

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
}
