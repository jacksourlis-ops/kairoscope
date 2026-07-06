// api/check-subscription.js — Given a known Stripe customer ID, checks
// whether they still have an active or trialing subscription right now.
// Used after returning from the billing portal to correctly decide
// whether to show the cancellation survey, instead of assuming every
// portal visit means a cancellation.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  const { customerId } = req.body || {};
  if (!customerId || typeof customerId !== 'string') {
    return res.status(400).json({ error: 'customerId required' });
  }

  try {
    const activeRes = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active&limit=1`,
      { headers: { 'Authorization': `Bearer ${secretKey}` } }
    );
    const active = await activeRes.json();
    if (active.data && active.data.length > 0) {
      return res.status(200).json({ active: true });
    }

    const trialRes = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=trialing&limit=1`,
      { headers: { 'Authorization': `Bearer ${secretKey}` } }
    );
    const trial = await trialRes.json();
    if (trial.data && trial.data.length > 0) {
      return res.status(200).json({ active: true });
    }

    return res.status(200).json({ active: false });
  } catch (err) {
    console.error('check-subscription.js error:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
