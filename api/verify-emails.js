export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const HUNTER_API_KEY = process.env.HUNTER_API_KEY;

  if (!HUNTER_API_KEY) {
    return res.json({ results: {} });
  }

  try {
    const { emails } = req.body;
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
      if (i + BATCH_SIZE < emails.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    res.json({ results });
  } catch (err) {
    console.error('[Hunter] Batch error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
