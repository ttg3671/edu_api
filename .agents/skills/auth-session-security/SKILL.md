---
name: auth-session-security
description: >-
  Use this skill when handling user authentication, JWT issuance and verification, device fingerprinting, session concurrency, and role-based access control in edu-api.
  Covers access/refresh tokens, cookie management, user_devices tracking, authMiddleware, and authorizeRoles.
---

# Authentication, Device Tracking & Session Security

This skill guides user authentication, multi-token lifecycle management, device fingerprinting, multi-device limits, and role authorization in `edu-api`.

---

## Token Architecture & Environment Secrets (`config/env.js`)

The system separates privileges into specialized JWTs:

| Token Type | Secret Variable | Expiry Variable | Transport / Storage | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Access Token** | `ACCESS_TOKEN_SECRET` | `ACCESS_EXPIRES_IN` | Authorization Header (`Bearer <token>`) | Authenticating protected REST calls |
| **Refresh Token** | `REFRESH_TOKEN_SECRET` | `REFRESH_EXPIRES_IN` | HTTP-only Cookie (`jwt`) & `user_devices` table | Seamless renewal of expired access tokens |
| **OTP Token** | `OTP_TOKEN_SECRET` | `OTP_EXPIRES_IN` | JSON Payload / Query Param | Temporary token issued alongside 6-digit OTP |
| **Short Token** | `SHORT_TOKEN_SECRET` | `SHORT_EXPIRES_IN` | Response Body / Redirect | Password reset verification |

---

## Device Fingerprinting & Concurrency (`utils/authHelper.js`)

Each login captures device characteristics to prevent unauthorized multi-device sharing:

```javascript
import { 
  generateDeviceFingerprint, 
  getDeviceTypeFromUserAgent 
} from "../utils/authHelper.js";

// 1. Determine platform category ('android', 'ios', 'tv', 'web')
const deviceType = req.headers['x-device-type'] || getDeviceTypeFromUserAgent(req.headers['user-agent']);

// 2. Compute SHA-256 fingerprint from client ID or fallback to User-Agent + IP + Accept-Language
const rawFingerprint = req.headers['x-device-fingerprint'];
const deviceFingerprint = generateDeviceFingerprint(rawFingerprint, req);
```

### Session Tracking in Database:
Active devices are maintained in `user_devices`:
- Tracks `user_id`, `device_id`, `device_name`, `device_type`, `refresh_token_hash`, `last_login`, `is_active`.
- If a user exceeds device limits, oldest inactive devices or unverified devices are revoked.

---

## Token Issuance & Refresh Cookies

### Issuing Tokens:
```javascript
import { generateTokens, setTokenCookie } from "../utils/authHelper.js";

// Generates both access and refresh tokens
const { accessToken, refreshToken } = generateTokens(
  { id: user.id, email: user.email, role: user.role },
  deviceId
);

// Stores refresh token in secure HTTP-only cookie
setTokenCookie(res, refreshToken);

// Returns access token in response body
return sendSuccess(res, { accessToken, user });
```

### Cookie Security Options:
- `httpOnly: true` (prevents XSS access)
- `secure: NODE_ENV === 'production'`
- `sameSite: 'strict'` or `'none'` depending on cross-origin mobile/web clients.

---

## Protecting Routes with Middleware

### 1. Basic JWT Verification (`middleware/auth.middleware.js`):
Validates `Authorization: Bearer <token>`. Attaches decoded payload to `req.user`.

```javascript
import authMiddleware from "../middleware/auth.middleware.js";

router.get("/profile", authMiddleware, getProfile);
```

### 2. Role-Based Access Control (`middleware/role.middleware.js`):
Enforces user roles (case-insensitive):

```javascript
import authMiddleware from "../middleware/auth.middleware.js";
import authorizeRoles from "../middleware/role.middleware.js";

// Only accessible by admin or staff
router.post(
  "/admin/courses",
  authMiddleware,
  authorizeRoles("ADMIN", "STAFF"),
  adminController.createCourse
);
```

### 3. Email Verification Guard (`middleware/emailVerified.middleware.js`):
Blocks unverified users from purchasing or posting:

```javascript
import emailVerifiedMiddleware from "../middleware/emailVerified.middleware.js";

router.post("/subscribe", authMiddleware, emailVerifiedMiddleware, initiateSubscription);
```

---

## Reviewer & Test Account Bypass (`isReviewer`)

For Apple App Store or Google Play Store automated app review processes, use `isReviewer(email)`:
- If `email === REVIEWER_EMAIL`, certain verification steps (e.g. strict SMS/OTP or disposable checks) can be safely bypassed to facilitate store approval.

---

## Security Checklist

1. [ ] Access tokens have a short lifespan (e.g., 15m to 1h).
2. [ ] Refresh tokens are never sent in plain JSON bodies for browsers; use HTTP-only cookies.
3. [ ] Passwords hashed with `bcryptjs` using appropriate salt rounds (>= 10).
4. [ ] Passwords and secrets are stripped from user responses before returning to clients.
5. [ ] Device logout invalidates both the HTTP-only cookie and the record in `user_devices`.
