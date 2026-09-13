---
name: stripe-subscriptions-webhooks
description: >-
  Use this skill when implementing, modifying, or debugging Stripe payments, checkout sessions, customer billing portal, and webhook event handling in edu-api.
  Covers raw body verification, BullMQ webhook worker, subscription lifecycle events, cache invalidation, and real-time Socket.IO notifications.
---

# Stripe Payments, Subscriptions & Webhook Processing

This skill defines procedures for managing Stripe subscriptions, checkout flows, customer billing portals, and asynchronous webhook handling in `edu-api`.

---

## Critical Architecture: Webhook Raw Body

Stripe signature verification **requires the raw unparsed request body**.

In `app.js`, the raw body parser **must be mounted before `express.json()`**:

```javascript
// app.js
// MUST be before express.json()
app.use("/api/v1/payments/webhook", express.raw({ type: 'application/json' }));
app.use(express.json());
```

---

## Webhook Route Handler Pattern (`routes/payment.routes.js`)

The HTTP endpoint verifies the signature, delegates the event to BullMQ, and responds immediately with `200 OK`:

```javascript
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '../config/env.js';
import { webhookQueue } from '../libs/queue.js';
import logger from '../libs/logger.js';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export const stripeWebhookHandler = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error(`Stripe Webhook Signature Verification Failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Idempotent enqueue using Stripe event ID as BullMQ Job ID
  await webhookQueue.add(
    'process-stripe-event',
    { event },
    {
      jobId: `stripe_${event.id}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 }
    }
  );

  return res.status(200).json({ received: true });
};
```

---

## Webhook Worker Event Handlers (`workers/webhookWorker.js`)

The background worker handles events asynchronously without risk of HTTP timeouts:

### Supported Stripe Events:
1. `checkout.session.completed`:
   - Extracts `userId`, `planId` from `session.metadata`.
   - Inserts subscription into `user_subscriptions` table (`stripe_sub_id`, `plan_id`, `status: 'active'`, `period_end`).
   - Invalidates user caches.
   - Emits real-time event via `socketIO.notify(`user_${userId}`, 'SUBSCRIPTION_ACTIVATED', { ... })`.

2. `customer.subscription.updated`:
   - Updates `status`, `current_period_end`, `cancel_at_period_end` in `user_subscriptions`.
   - Invalidates user caches.
   - Emits `SUBSCRIPTION_UPDATED` to user socket.

3. `customer.subscription.deleted`:
   - Sets status to `'canceled'` or `'expired'`.
   - Revokes premium access, notifies user socket.

4. `invoice.payment_succeeded` / `invoice.payment_failed`:
   - Tracks billing status and alerts user of payment renewal or failure.

---

## Cache Invalidation Pattern for Subscriptions

Whenever subscription state changes in the worker or controllers:

```javascript
import { clearCache } from '../utils/cache.js';

await Promise.all([
  clearCache(`user_profile:${userId}`),
  clearCache(`user_profiles:${userId}`),
  clearCache(`user_subscriptions_list:${userId}:*`),
  clearCache("cache:/api/v1/users/home*")
]);
```

---

## Creating Checkout & Portal Sessions

### 1. Checkout Session:
```javascript
const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  customer_email: user.email,
  line_items: [{ price: stripePriceId, quantity: 1 }],
  mode: 'subscription',
  success_url: `${BASE_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${BASE_URL}/payment/cancel`,
  metadata: {
    user_id: String(user.id),
    plan_id: String(planId)
  }
});
```

### 2. Billing Portal Session:
```javascript
const portalSession = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,
  return_url: `${BASE_URL}/profile`
});
```

---

## Testing Webhooks Locally

Use the Stripe CLI to forward events to the local Express server:
```bash
stripe listen --forward-to localhost:3000/api/v1/payments/webhook
```
Copy the webhook signing secret output by the CLI and assign it to `STRIPE_WEBHOOK_SECRET` in `.env.production.local`.
