import { google } from 'googleapis';

const SENDER_EMAIL = process.env.SENDER_EMAIL || 'suuchi@ignitetech.com';

function getGmailAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY env var is not set');
  const key = JSON.parse(keyJson);
  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.compose'],
    subject: SENDER_EMAIL,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, subject, body } = req.body;
    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'to, subject, and body are required' });
    }

    const auth = getGmailAuth();
    const gmail = google.gmail({ version: 'v1', auth });

    const rawMessage = [
      `From: Suuchi Ramesh <${SENDER_EMAIL}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ].join('\r\n');

    const encoded = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const draft = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: { raw: encoded },
      },
    });

    console.log(`[Gmail] Draft created: ${draft.data.id} → ${to}`);
    res.json({ success: true, draftId: draft.data.id });
  } catch (err) {
    console.error('[Gmail] Draft creation error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
