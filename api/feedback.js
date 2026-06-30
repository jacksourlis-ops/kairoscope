// api/feedback.js — Cancellation Survey Logger
// No database exists yet, so this simply logs responses to Vercel's function logs
// (Project → Deployments → your deployment → Functions → feedback). Can be upgraded
// later to email or write to a spreadsheet if cancellation volume grows.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { reason, detail } = req.body;
    console.log('CANCELLATION FEEDBACK:', {
      reason: reason || '(none selected)',
      detail: detail || '',
      at: new Date().toISOString()
    });
    return res.status(200).json({ received: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
