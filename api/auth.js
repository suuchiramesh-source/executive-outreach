export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const APP_PASSWORD = process.env.APP_PASSWORD;
  const { password } = req.body;

  if (!APP_PASSWORD) {
    return res.json({ success: true });
  }
  if (password === APP_PASSWORD) {
    return res.json({ success: true });
  }
  return res.status(401).json({ success: false, error: 'Incorrect password' });
}
