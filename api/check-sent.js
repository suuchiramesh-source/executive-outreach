import { google } from 'googleapis';
import { requireAuth } from './_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const user = requireAuth(req, res);
  if (!user) return;

  const { emails, gmailToken } = req.body;
  if (!gmailToken) {
    return res.status(400).json({ error: 'gmailToken is required' });
  }
  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return res.json({ results: {} });
  }

  console.log(`[CheckSent] Checking ${emails.length} emails using user's Gmail token`);

  // Use the user's OAuth access token directly
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: gmailToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Verify token works
  try {
    const profile = await gmail.users.getProfile({ userId: 'me' });
    console.log(`[CheckSent] Authenticated as: ${profile.data.emailAddress}`);
  } catch (err) {
    console.error(`[CheckSent] Token invalid: ${err.message}`);
    return res.status(401).json({ error: `Gmail token invalid: ${err.message}` });
  }

  const results = {};
  const BATCH = 5;

  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH);
    const batchResults = await Promise.all(
      batch.map(async (email) => {
        const q = `to:${email} in:sent`;
        try {
          const resp = await gmail.users.messages.list({ userId: 'me', q, maxResults: 1 });
          const messages = resp.data.messages || [];
          console.log(`[CheckSent] "${q}" → ${messages.length} message(s)`);
          if (messages.length === 0) return { email, sent: false };

          const msg = await gmail.users.messages.get({
            userId: 'me', id: messages[0].id, format: 'metadata', metadataHeaders: ['Date'],
          });
          const dateHeader = msg.data.payload?.headers?.find(h => h.name === 'Date');
          const lastDate = dateHeader ? new Date(dateHeader.value).toISOString().split('T')[0] : null;
          console.log(`[CheckSent] FOUND: ${email} — last sent ${lastDate}`);
          return { email, sent: true, lastDate };
        } catch (err) {
          console.warn(`[CheckSent] Error for ${email}: ${err.message}`);
          return { email, sent: false };
        }
      })
    );
    for (const r of batchResults) {
      results[r.email] = { sent: r.sent, lastDate: r.lastDate || null };
    }
  }

  const found = Object.values(results).filter(v => v.sent).length;
  console.log(`[CheckSent] Done: ${found}/${emails.length} previously emailed`);
  res.json({ results });
}
