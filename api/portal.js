// api/portal.js — Stripe Billing Portal Session Creator
// Lets an existing customer manage or cancel their subscription via Stripe's hosted portal

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  try {
    const { customerId, origin } = req.body;
    if (!customerId) {
      return res.status(400).json({ error: 'Missing customer ID' });
    }
    const baseUrl = origin || 'https://kairoscope.app';

    const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'customer': customerId,
        'return_url': `${baseUrl}?portal_return=true`
      })
    });

    const session = await response.json();

    if (session.error) {
      return res.status(400).json({ error: session.error.message });
    }

    return res.status(200).json({ url: session.url });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
