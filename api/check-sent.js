import { google } from 'googleapis';
import { requireAuth } from './_lib/session.js';

const SENDER_EMAIL = process.env.SENDER_EMAIL || 'suuchi.ramesh@ignitetech.com';

function getGmailAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY env var is not set');
  const key = JSON.parse(keyJson);
  console.log(`[CheckSent] Service account: ${key.client_email}`);
  console.log(`[CheckSent] Impersonating: ${SENDER_EMAIL}`);
  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    subject: SENDER_EMAIL,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const user = requireAuth(req, res);
  if (!user) return;

  const { emails } = req.body;
  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return res.json({ results: {} });
  }

  console.log(`[CheckSent] Checking ${emails.length} emails: ${emails.slice(0, 5).join(', ')}${emails.length > 5 ? '...' : ''}`);

  let gmail;
  try {
    const auth = getGmailAuth();
    gmail = google.gmail({ version: 'v1', auth });
    // Verify auth works with a profile call
    const profile = await gmail.users.getProfile({ userId: 'me' });
    console.log(`[CheckSent] Gmail auth OK — authenticated as: ${profile.data.emailAddress}`);
  } catch (err) {
    console.error(`[CheckSent] Gmail auth FAILED: ${err.message}`);
    // Return error info so frontend can show it
    return res.json({ results: {}, authError: err.message });
  }

  const results = {};
  const BATCH = 5;

  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH);
    const batchResults = await Promise.all(
      batch.map(async (email) => {
        // Try multiple query formats
        const queries = [
          `to:${email} in:sent`,
          `to:${email}`,
          `${email} in:sent`,
        ];

        for (const q of queries) {
          try {
            console.log(`[CheckSent] Query: "${q}"`);
            const resp = await gmail.users.messages.list({
              userId: 'me',
              q,
              maxResults: 1,
            });
            const messages = resp.data.messages || [];
            const total = resp.data.resultSizeEstimate || 0;
            console.log(`[CheckSent] "${q}" → ${messages.length} messages (estimate: ${total})`);

            if (messages.length > 0) {
              // Get the date of the most recent sent message
              try {
                const msg = await gmail.users.messages.get({
                  userId: 'me',
                  id: messages[0].id,
                  format: 'metadata',
                  metadataHeaders: ['Date', 'To', 'Subject'],
                });
                const headers = msg.data.payload?.headers || [];
                const dateHeader = headers.find(h => h.name === 'Date');
                const toHeader = headers.find(h => h.name === 'To');
                const subjectHeader = headers.find(h => h.name === 'Subject');
                const lastDate = dateHeader ? new Date(dateHeader.value).toISOString().split('T')[0] : null;
                console.log(`[CheckSent] FOUND for ${email}: to="${toHeader?.value}" subject="${subjectHeader?.value?.substring(0, 50)}" date=${lastDate}`);
                return { email, sent: true, lastDate };
              } catch (err2) {
                console.warn(`[CheckSent] Failed to get message details for ${email}:`, err2.message);
                return { email, sent: true, lastDate: null };
              }
            }
          } catch (err) {
            console.warn(`[CheckSent] Query "${q}" failed for ${email}: ${err.message}`);
          }
        }
        console.log(`[CheckSent] NOT FOUND: ${email} — no sent emails with any query`);
        return { email, sent: false };
      })
    );

    for (const r of batchResults) {
      results[r.email] = { sent: r.sent, lastDate: r.lastDate || null };
    }
  }

  const foundCount = Object.values(results).filter(v => v.sent).length;
  console.log(`[CheckSent] Summary: ${foundCount}/${emails.length} contacts have been previously emailed`);
  res.json({ results });
}
