/**
 * Salesforce cross-reference — fetch additional signal about an account.
 * Uses the Salesforce REST API with a pre-issued access token.
 *
 * Returns relevant account metadata if found, null otherwise.
 */
export async function searchSalesforce(companyName) {
  const instanceUrl = process.env.SF_INSTANCE_URL;
  const accessToken = process.env.SF_ACCESS_TOKEN;

  if (!instanceUrl || !accessToken) {
    return null; // Salesforce not configured — silently skip
  }

  try {
    const query = encodeURIComponent(
      `SELECT Id, Name, Owner.Name, Owner.Email, Industry, AnnualRevenue, Description
       FROM Account
       WHERE Name LIKE '%${companyName.replace(/'/g, "\\'")}%'
       LIMIT 1`
    );

    const res = await fetch(`${instanceUrl}/services/data/v59.0/query?q=${query}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      console.warn(`Salesforce search returned ${res.status} for "${companyName}"`);
      return null;
    }

    const data = await res.json();
    const record = data.records?.[0];

    if (!record) return null;

    return {
      sfAccountId: record.Id,
      sfAccountName: record.Name,
      owner: record.Owner?.Name || null,
      ownerEmail: record.Owner?.Email || null,
      industry: record.Industry || null,
      annualRevenue: record.AnnualRevenue || null,
      description: record.Description || null,
    };
  } catch (err) {
    console.error('Salesforce query error:', err.message);
    return null;
  }
}
