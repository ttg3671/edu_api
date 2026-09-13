---
name: redis-caching-invalidation
description: >-
  Use this skill when implementing route-level caching, data caching with getOrSetCache, non-blocking Redis cache invalidation, and cache key management in edu-api.
  Covers cache.middleware.js, clearCache with scanStream, key patterns, and clearCacheScript.js.
---

# Redis Caching & Invalidation Strategy

This skill guides the implementation of caching strategies, TTL policies, and non-blocking cache invalidations using Redis in `edu-api`.

---

## Caching Mechanisms in the Project

The codebase provides two primary caching patterns:

### 1. Route-Level Caching (`middleware/cache.middleware.js`)

Caches complete JSON HTTP responses using `cache:${req.originalUrl}` as the key.

```javascript
import { Router } from "express";
import { cacheMiddleware } from "../middleware/cache.middleware.js";
import { getHomeFeed } from "../controllers/user.controllers.js";

const router = Router();

// Cache home feed for 5 minutes (300 seconds)
router.get("/home", cacheMiddleware(300), getHomeFeed);

export default router;
```

**How it works:**
- Intercepts requests before reaching controllers.
- If key exists in Redis, returns cached JSON with status immediately.
- If key does not exist, hooks `res.json` to store successful (200-399) responses with TTL.

---

### 2. Programmatic Data Caching (`utils/cache.js` -> `getOrSetCache`)

Caches specific queries or computation results inside controllers or services:

```javascript
import { getOrSetCache } from "../utils/cache.js";
import pool from "../config/db.js";

export const getUserDetails = async (userId) => {
  const cacheKey = `user_profile:${userId}`;
  const ttl = 1800; // 30 minutes

  return await getOrSetCache(cacheKey, async () => {
    const [[user]] = await pool.query(
      "SELECT id, name, email, avatar, role FROM users WHERE id = ?",
      [userId]
    );
    return user;
  }, ttl);
};
```

---

## Non-Blocking Cache Invalidation (`clearCache`)

### Why `scanStream` Matters:
In high-traffic production environments, never run `redis.keys("*")` because it blocks the single-threaded Redis engine. `utils/cache.js` uses `scanStream` with chunks of 100 to safely delete matching keys.

```javascript
import { clearCache } from "../utils/cache.js";

// Invalidate specific user profile
await clearCache(`user_profile:${userId}`);

// Invalidate all paginated subscription queries for a user
await clearCache(`user_subscriptions_list:${userId}:*`);

// Invalidate all cached public home feed variants (with query params)
await clearCache("cache:/api/v1/users/home*");
```

---

## Standard Key Naming Conventions

Maintain strict namespaces across the application:

| Pattern | Purpose | When to Invalidate |
| :--- | :--- | :--- |
| `cache:/api/v1/users/home*` | Public homepage courses/modules | Admin updates courses, modules, or layout |
| `user_profile:<userId>` | User profile details | User edits profile, avatar, or role |
| `user_subscriptions_list:<userId>:*` | User subscription history | Stripe webhook received, manual admin grant |
| `syllabus:<courseId>` | Course syllabus and lesson structure | Admin creates, edits, reorders lessons |

---

## Cache Invalidation Trigger Points Checklist

When modifying state, ensure relevant keys are cleared:

1. **Course / Module / Lesson Update**:
   ```javascript
   await clearCache("cache:/api/v1/users/home*");
   await clearCache(`syllabus:${courseId}*`);
   ```
2. **User Profile Update**:
   ```javascript
   await clearCache(`user_profile:${userId}`);
   await clearCache(`user_profiles:${userId}`);
   ```
3. **Subscription Lifecycle Event**:
   ```javascript
   await clearCache(`user_profile:${userId}`);
   await clearCache(`user_subscriptions_list:${userId}:*`);
   await clearCache("cache:/api/v1/users/home*");
   ```

---

## Manual Cache Flushing

To flush all application caches during maintenance or deployments:

```bash
npm run clear-cache
```

This runs `utils/clearCacheScript.js`, scanning and clearing `cache:*` and `user_*` keys safely.
