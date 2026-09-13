---
name: email-security-rate-limiting
description: >-
  Use this skill when implementing email verification, OTP flows, password resets, email delivery security, and anti-abuse defenses in edu-api.
  Covers emailRateLimiter.middleware.js, emailSecurity.service.js, abuseDetection.service.js, disposable email checks, and delivery error handling.
---

# Email Security, Rate Limiting & Abuse Detection

This skill guides the implementation of email dispatching safeguards, spam/abuse prevention, disposable domain filtering, and multi-tier rate limiting in `edu-api`.

---

## Defense-in-Depth Architecture

Email endpoints (registration, OTP verification, password reset, email update) are vulnerable to SMS/SMTP exhaustion, credential stuffing, and bot spam. The application uses a multi-layer defense:

```
Incoming Request
      │
      ├──> [1] emailRateLimiter.middleware.js (Redis Sliding Window per-IP & per-Email)
      │
      ├──> [2] abuseDetection.service.js (Honeypot, User-Agent, IP Reputation)
      │
      ├──> [3] emailSecurity.service.js (Disposable domain blocklist, RFC 5322, MX validation)
      │
      ├──> [4] Global Rate Limiter (Per-minute and Per-hour systemwide caps)
      │
      └──> [5] BullMQ emailQueue (Deduplicated background delivery via Nodemailer)
```

---

## Protecting Routes with `emailRateLimiter`

Apply `emailRateLimiter` to all routes that trigger an outbound email:

```javascript
import { Router } from "express";
import { emailRateLimiter } from "../middleware/emailRateLimiter.middleware.js";
import { sendOtpValidators } from "../validators/auth.validators.js";
import { sendOtp } from "../controllers/mail.controllers.js";

const router = Router();

// Enforces sliding window limit per IP and per recipient address
router.post(
  "/send-otp",
  sendOtpValidators,
  emailRateLimiter({
    action: "otp",
    maxRequestsPerWindow: 3,
    windowSeconds: 300 // Max 3 OTP requests every 5 minutes
  }),
  sendOtp
);

export default router;
```

---

## Email Validation & Disposable Domain Blocking

Before creating accounts or enqueueing emails, run verification through `services/emailSecurity.service.js`:

```javascript
import { 
  isDisposableEmail, 
  isValidEmailFormat, 
  maskEmail 
} from "../services/emailSecurity.service.js";
import { createError } from "../utils/validationHelper.js";
import logger from "../libs/logger.js";

export const validateRecipientEmail = async (email) => {
  // 1. Format check
  if (!isValidEmailFormat(email)) {
    throw createError("Invalid email format", 400);
  }

  // 2. Disposable domain check (e.g. mailinator, guerrillamail)
  if (await isDisposableEmail(email)) {
    logger.warn(`[SECURITY] Blocked disposable email signup: ${maskEmail(email)}`);
    throw createError("Temporary or disposable email addresses are not permitted", 400);
  }
};
```

---

## Masking Sensitive Data in Logs

**Never log raw email addresses in logs or error traces.** Always use `maskEmail`:

```javascript
import { maskEmail } from "../services/emailSecurity.service.js";
import logger from "../libs/logger.js";

// Input: "andrei.neagoie@zerotomastery.io" -> Output: "a***e@zerotomastery.io"
logger.info(`Sending password reset link to: ${maskEmail(user.email)}`);
```

---

## Permanent vs. Transient SMTP Failures

Inside background workers (`workers/emailWorker.js`), classify SMTP errors to prevent endless retries for non-existent addresses:

```javascript
import { isPermanentFailure } from "../services/emailSecurity.service.js";
import { UnrecoverableError } from "bullmq";

if (!result.isSuccess) {
  const isPermanent = isPermanentFailure(result.error);

  if (isPermanent) {
    // 5xx errors, mailbox not found, domain rejected
    logger.error(`Permanent failure sending to ${maskEmail(to)}: ${result.error}`);
    throw new UnrecoverableError(result.error); // BullMQ will not retry
  } else {
    // 4xx errors, connection timeouts, temporary SMTP greylisting
    logger.warn(`Transient failure sending to ${maskEmail(to)}. Scheduling retry...`);
    throw new Error(result.error); // BullMQ will retry with exponential backoff
  }
}
```

---

## Checklist for New Email Flows

1. [ ] Route is protected by `emailRateLimiter`.
2. [ ] Email is validated against disposable email lists.
3. [ ] Outbound emails are sent via `enqueueEmail` with an appropriate `dedupWindowSeconds`.
4. [ ] Email addresses in logs are masked using `maskEmail()`.
5. [ ] Worker classifies delivery failures to avoid burning SMTP reputation on dead inboxes.
