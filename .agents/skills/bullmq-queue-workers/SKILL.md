---
name: bullmq-queue-workers
description: >-
  Use this skill when managing background jobs, queues, and workers in edu-api using BullMQ and Redis.
  Covers emailQueue, webhookQueue, job deduplication, retry backoff, UnrecoverableError handling, and worker execution.
---

# BullMQ Queues and Background Workers

This skill guides the design, enqueueing, processing, and debugging of asynchronous background jobs using BullMQ and Redis in `edu-api`.

---

## Active Queues Architecture (`libs/queue.js`)

The project uses two dedicated BullMQ queues:

| Queue Name | Queue Instance | Primary Worker | Purpose |
| :--- | :--- | :--- | :--- |
| `email-tasks` | `emailQueue` | `workers/emailWorker.js` | Transactional emails, OTPs, password reset, welcome emails with deduplication and global rate limiting |
| `stripe-webhooks` | `webhookQueue` | `workers/webhookWorker.js` | Asynchronous processing of Stripe billing events without blocking HTTP webhook endpoints |

---

## Enqueueing Email Tasks (`enqueueEmail`)

Never send emails synchronously within HTTP request handlers. Always use `enqueueEmail` from `libs/queue.js`:

```javascript
import { enqueueEmail } from "../libs/queue.js";

// Basic email enqueue
await enqueueEmail({
  to: user.email,
  subject: "Welcome to our platform!",
  html: "<h1>Welcome!</h1>",
  text: "Welcome to our platform!"
}, {
  action: "welcome",               // Action tag for rate limiting & monitoring
  dedupWindowSeconds: 300           // 5-minute deduplication window
});

// Priority / OTP Email
await enqueueEmail({
  to: user.email,
  subject: "Your One-Time Password",
  html: `<p>Your code is: <strong>${otp}</strong></p>`
}, {
  action: "otp",
  dedupWindowSeconds: 60            // 1-minute window
});
```

### Automatic Protections in `enqueueEmail`:
1. **Deterministic Job Deduplication**: Prevents duplicate emails if user triggers multiple identical requests within `dedupWindowSeconds`.
2. **Global Rate Limit Inspection**: Delays job execution if system is nearing SMTP rate thresholds.
3. **Safe Delivery Monitoring**: Logs masked recipient IDs into Redis metrics (`recordEmailQueued`).

---

## Enqueueing Stripe Webhook Tasks

In `routes/payment.routes.js` or `controllers/payment.controllers.js`:

```javascript
import { webhookQueue } from "../libs/queue.js";
import logger from "../libs/logger.js";

export const handleStripeWebhook = async (req, res) => {
  const event = req.stripeEvent; // Verified event object

  await webhookQueue.add(
    "process-webhook",
    { event },
    {
      jobId: `stripe_${event.id}`, // Idempotent: event ID guarantees single execution
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 }
    }
  );

  // Always respond 200 immediately to Stripe
  return res.status(200).json({ received: true });
};
```

---

## Worker Error Handling & Retries

In worker files (`workers/*.js`), distinguish between **transient** (retriable) and **permanent** (unrecoverable) errors:

```javascript
import { Worker, UnrecoverableError } from "bullmq";
import redisClient from "../config/redis.js";
import logger from "../libs/logger.js";

const customWorker = new Worker("custom-tasks", async (job) => {
  const { userId, payload } = job.data;

  // 1. Permanent Validation Failure: Stop retrying immediately
  if (!userId) {
    logger.error(`[UNRECOVERABLE] Missing userId in job ${job.id}`);
    throw new UnrecoverableError("Invalid job parameters");
  }

  // 2. Network / External API call (transient errors retry automatically)
  try {
    await externalService.call(payload);
  } catch (err) {
    if (err.isPermanent) {
      throw new UnrecoverableError(err.message);
    }
    // Throwing standard Error triggers BullMQ exponential retry backoff
    throw new Error(`Transient failure: ${err.message}`);
  }
}, {
  connection: redisClient,
  concurrency: 5,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 }
});
```

---

## Running & Managing Workers

### Development Mode (with nodemon):
```bash
# Run workers individually:
npm run dev:worker
npm run dev:worker:email
```

### Production Mode:
```bash
# Run individual worker in dedicated processes/containers:
npm run worker
npm run worker:email
```

*Note: In `index.js`, workers are also imported directly (`import './workers/webhookWorker.js'`, `import './workers/emailWorker.js'`) for single-process environments.*

---

## Checklist for New Background Tasks

1. [ ] Jobs have a unique or deterministic `jobId` for idempotency.
2. [ ] Workers catch unrecoverable errors and throw `UnrecoverableError`.
3. [ ] Sensitive user data (e.g. emails, tokens) is masked before logging.
4. [ ] Worker concurrency is explicitly tuned for Redis and database connection pool limits.
5. [ ] Worker lifecycle listeners (`worker.on('completed')`, `worker.on('failed')`) log diagnostics.
