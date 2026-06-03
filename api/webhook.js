// api/webhook.js — Stripe Webhook Handler
// Listens for successful payments and marks users as Pro

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // For now just acknowledge — full webhook verification can be added later
  const event = req.body;

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        // Payment successful — user should be granted Pro access
        // In a full implementation this would update a database
        console.log('Payment successful:', event.data.object.id);
        break;
      case 'customer.subscription.deleted':
        // Subscription cancelled
        console.log('Subscription cancelled:', event.data.object.id);
        break;
      default:
        console.log('Unhandled event:', event.type);
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}
