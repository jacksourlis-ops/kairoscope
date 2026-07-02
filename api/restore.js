// Restore Purchase — looks up an email in Stripe, returns whether it has
// an active (or trialing) subscription, and the customer ID if so.
// Uses the same STRIPE_SECRET_KEY env var your other Stripe files use.
// If your existing api files use a different env var name for the Stripe
// secret key, rename it below to match.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const cleanEmail = email.trim().toLowerCase();

    const customers = await stripe.customers.list({ email: cleanEmail, limit: 10 });

    for (const customer of customers.data) {
      const active = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'active',
        limit: 1
      });
      if (active.data.length) {
        return res.status(200).json({ found: true, customerId: customer.id });
      }
      const trialing = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'trialing',
        limit: 1
      });
      if (trialing.data.length) {
        return res.status(200).json({ found: true, customerId: customer.id });
      }
    }

    return res.status(200).json({ found: false });
  } catch (err) {
    console.error('restore.js error:', err);
    return res.status(500).json({ error: 'Lookup failed, try again' });
  }
}
sss
