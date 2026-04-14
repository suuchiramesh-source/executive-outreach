import { google } from 'googleapis';
import { requireAuth } from './_lib/session.js';

const SENDER_EMAIL = process.env.SENDER_EMAIL || 'suuchi@ignitetech.com';

function getGmailAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY env var is not set');
  const key = JSON.parse(keyJson);
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

  try {
    const auth = getGmailAuth();
    const gmail = google.gmail({ version: 'v1', auth });

    const results = {};
    // Process in parallel batches of 5
    const BATCH = 5;
    for (let i = 0; i < emails.length; i += BATCH) {
      const batch = emails.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        batch.map(async (email) => {
          try {
            const resp = await gmail.users.messages.list({
              userId: 'me',
              q: `in:sent to:${email}`,
              maxResults: 1,
            });
            const messages = resp.data.messages || [];
            if (messages.length === 0) {
              return { email, sent: false };
            }
            // Get the date of the most recent sent message
            const msg = await gmail.users.messages.get({
              userId: 'me',
              id: messages[0].id,
              format: 'metadata',
              metadataHeaders: ['Date'],
            });
            const dateHeader = msg.data.payload?.headers?.find(h => h.name === 'Date');
            const lastDate = dateHeader ? new Date(dateHeader.value).toISOString().split('T')[0] : null;
            return { email, sent: true, lastDate };
          } catch (err) {
            console.warn(`[CheckSent] Error checking ${email}:`, err.message);
            return { email, sent: false, error: err.message };
          }
        })
      );
      for (const r of batchResults) {
        results[r.email] = { sent: r.sent, lastDate: r.lastDate || null };
      }
    }

    res.json({ results });
  } catch (err) {
    // If Gmail auth fails entirely, return empty results (degrade gracefully)
    console.error('[CheckSent] Gmail auth error:', err.message);
    res.json({ results: {}, error: err.message });
  }
}
