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

    // ── EA debug logging (runs in the serverless function) ──
    if (apolloResult?._eaDebug) {
      const d = apolloResult._eaDebug;
      console.log(`[EA-DEBUG] ===== ELECTRONIC ARTS DEBUG START =====`);
      console.log(`[EA-DEBUG] Tier: ${d.tier} (${d.tierLabel}), Employees: ${d.employeeCount}`);
      console.log(`[EA-DEBUG] Call 1 (senior) returned: ${d.call1Count} contacts`);
      d.call1.forEach((p, i) => console.log(`[EA-DEBUG]   Call1[${i}]: ${p.name} — "${p.title}" (seniority=${p.seniority})`));
      console.log(`[EA-DEBUG] Call 2 (functional) returned: ${d.call2Count} contacts`);
      d.call2.forEach((p, i) => console.log(`[EA-DEBUG]   Call2[${i}]: ${p.name} — "${p.title}"`));
      console.log(`[EA-DEBUG] Merged: ${d.mergedCount} unique candidates`);
      console.log(`[EA-DEBUG] Revealed (before filtering): ${(d.revealedBeforeFilter || []).length}`);
      (d.revealedBeforeFilter || []).forEach((c, i) => console.log(`[EA-DEBUG]   Revealed[${i}]: ${c.name} — "${c.title}" email=${c.email} verified=${c.verified} score=${c.score}`));
      console.log(`[EA-DEBUG] Primary contacts: [${d.primaryNames.join(', ')}]`);
      console.log(`[EA-DEBUG] Secondary exclusions (tier ${d.tier}): [${d.secondaryExclusions.join(', ')}]`);
      console.log(`[EA-DEBUG] Excluded from secondary:`);
      (d.excludedFromSecondary || []).forEach((c) => console.log(`[EA-DEBUG]   REMOVED: ${c.name} — "${c.title}"`));
      console.log(`[EA-DEBUG] Final secondary list: ${d.finalSecondaryCount} contacts`);
      d.finalSecondary.forEach((c, i) => console.log(`[EA-DEBUG]   Secondary[${i}]: ${c.name} — "${c.title}" email=${c.email} verified=${c.verified}`));
      console.log(`[EA-DEBUG] ===== ELECTRONIC ARTS DEBUG END =====`);
      delete apolloResult._eaDebug; // don't send debug data to frontend
    }

    res.json({
      contact: apolloResult,
      salesforceSignal: sfResult,
    });
  } catch (err) {
    console.error('Error enriching contact:', err);
    res.status(500).json({ error: err.message });
  }
}
