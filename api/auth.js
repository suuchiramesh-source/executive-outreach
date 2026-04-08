import { createSessionToken } from './_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ success: false, error: 'Missing credential' });
  }

  try {
    // Verify Google ID token
    const googleRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );
    if (!googleRes.ok) {
      return res.status(401).json({ success: false, error: 'Invalid Google token' });
    }

    const tokenInfo = await googleRes.json();

    // Verify audience matches our client ID
    if (tokenInfo.aud !== process.env.GOOGLE_CLIENT_ID) {
      return res.status(401).json({ success: false, error: 'Invalid token audience' });
    }

    // Restrict to @ignitetech.com emails only
    const email = tokenInfo.email;
    if (!email || !email.endsWith('@ignitetech.com')) {
      return res.status(403).json({
        success: false,
        error: 'Access is restricted to @ignitetech.com email addresses only',
      });
    }

    // Create session token (7-day expiry)
    const name = tokenInfo.name || email.split('@')[0];
    const picture = tokenInfo.picture || null;
    const token = createSessionToken({ email, name, picture });

    return res.json({
      success: true,
      token,
      user: { email, name, picture },
    });
  } catch (err) {
    console.error('[Auth] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Authentication failed' });
  }
}
