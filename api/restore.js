// api/restore.js — Restore Purchase, Stripe email lookup
// Looks up an email in Stripe directly over the REST API (no SDK),
// returns whether it has an active or trialing subscription.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    const cleanEmail = email.trim().toLowerCase();

    const custRes = await fetch(
      `https://api.stripe.com/v1/customers?email=${encodeURIComponent(cleanEmail)}&limit=10`,
      { headers: { 'Authorization': `Bearer ${secretKey}` } }
    );
    const customers = await custRes.json();

    if (customers.error) {
      return res.status(400).json({ error: customers.error.message });
    }

    for (const customer of (customers.data || [])) {
      const activeRes = await fetch(
        `https://api.stripe.com/v1/subscriptions?customer=${customer.id}&status=active&limit=1`,
        { headers: { 'Authorization': `Bearer ${secretKey}` } }
      );
      const active = await activeRes.json();
      if (active.data && active.data.length) {
        return res.status(200).json({ found: true, customerId: customer.id });
      }

      const trialRes = await fetch(
        `https://api.stripe.com/v1/subscriptions?customer=${customer.id}&status=trialing&limit=1`,
        { headers: { 'Authorization': `Bearer ${secretKey}` } }
      );
      const trialing = await trialRes.json();
      if (trialing.data && trialing.data.length) {
        return res.status(200).json({ found: true, customerId: customer.id });
      }
    }

    return res.status(200).json({ found: false });
  } catch (err) {
    console.error('restore.js error:', err);
    return res.status(500).json({ error: 'Lookup failed, try again' });
  }
}
