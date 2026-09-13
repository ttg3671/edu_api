# Developer & Agent Guide: edu-api

Welcome to `edu-api`! This document serves as the primary architecture reference and operational handbook for human developers and AI pair programmers working on this codebase.

---

## 1. Project Architecture Overview

`edu-api` is a high-performance backend REST API and real-time event service for an educational/video-learning platform.

- **Runtime & Module System**: Node.js >= 22 with native ECMAScript Modules (`"type": "module"`).
- **Web Framework**: Express 5 (`5.2.1`).
- **Primary Database**: MySQL 8.x using `mysql2/promise` with connection pooling and transactional utilities.
- **Cache & Message Broker**: Redis (`ioredis`) for route caching, rate limiting, and BullMQ background queues.
- **Background Workers**: `bullmq` handling asynchronous Stripe webhooks (`stripe-webhooks`) and transactional emails (`email-tasks`).
- **Real-Time Communication**: `socket.io` with Redis broadcast adapters for pushing instant notifications to user devices.
- **Billing & Subscriptions**: Stripe Checkout, Customer Portal, and signature-verified webhooks.
- **Media & Push Integrations**: Cloudinary (image assets), Vimeo (video streaming), Firebase Admin (push notifications).
- **Logging & Monitoring**: `pino` and `pino-http` for structured, low-overhead JSON logging.

---

## 2. Directory Structure

```
edu-api/
├── .agents/skills/          # Specialized workspace skills for AI pair programmers
├── config/                  # Database, Redis, Firebase, Cloudinary, Socket, and Env configuration
├── controllers/             # Request handlers orchestrating business logic and database queries
├── libs/                    # Core libraries (Pino logger, BullMQ queues)
├── middleware/              # Express middlewares (auth, role checks, caching, rate limiting, error handler)
├── routes/                  # Express route declarations and middleware attachment
├── services/                # Specialized domain services (abuse detection, email security, SMTP)
├── utils/                   # Reusable helpers (auth, pagination, validation, caching, enums)
├── validators/              # express-validator request validation schemas
├── workers/                 # BullMQ background worker definitions (emailWorker, webhookWorker)
├── app.js                   # Express application setup, middleware pipeline, and route mounting
├── index.js                 # HTTP and Socket server initialization, graceful shutdown
└── swagger.js               # OpenAPI / Swagger generation script
```

---

## 3. Core Development Rules & Conventions

### 1. Layered Pattern
- **Routes (`routes/*.js`)**: Define endpoints, bind validation arrays, and attach authentication/authorization middlewares.
- **Validators (`validators/*.js`)**: Validate request body, query parameters, and URL params using `express-validator`.
- **Controllers (`controllers/*.js`)**:
  - Always call `handleValidationErrors(req)` as the first line of the handler.
  - Wrap handlers in `asyncHandler` (from `utils/paginationHelper.js`).
  - Throw errors using `createError(message, statusCode)` (from `utils/validationHelper.js`).
  - Return responses using `sendSuccess(res, data, message)` or `sendPaginatedResponse(res, data, meta)`.

### 2. Database Safety & Transactions
- **Never concatenate unescaped input into SQL strings**. Always use parameterized `?` placeholders.
- Wrap multi-table modifications or critical balance/status changes in `withTransaction(pool, async (conn) => { ... })`.
- Use `validateIdExists` or `validateIdsExist` to guard foreign keys before performing inserts/updates.

### 3. Asynchronous Background Tasks
- **Never perform long-running or failure-prone tasks synchronously** (e.g. sending emails or processing Stripe webhooks).
- Dispatch emails using `enqueueEmail()` (`libs/queue.js`).
- Distinguish between transient errors (retriable) and permanent errors (throwing `UnrecoverableError` in BullMQ).

### 4. Caching & Cache Invalidation
- Use `cacheMiddleware(seconds)` for cacheable GET endpoints.
- Invalidate cache entries upon mutation using `clearCache(pattern)` (`utils/cache.js`), which utilizes non-blocking Redis `scanStream`.

### 5. Sensitive Data & Privacy
- Always mask emails before logging with `maskEmail(email)`.
- Never expose password hashes, refresh tokens, or secret keys in API responses.

---

## 4. Workspace Skills (`.agents/skills/`)

The following specialized skills are available to guide complex tasks:

1. **[`api-endpoint-scaffolding`](./.agents/skills/api-endpoint-scaffolding/SKILL.md)**: Scaffolding new Express 5 endpoints adhering to the 4-tier pattern, validation chains, and standardized JSON envelopes.
2. **[`mysql-database-operations`](./.agents/skills/mysql-database-operations/SKILL.md)**: Safe database queries, transactional atomicity with `withTransaction`, and cursor/offset pagination.
3. **[`bullmq-queue-workers`](./.agents/skills/bullmq-queue-workers/SKILL.md)**: Managing background queues (`email-tasks`, `stripe-webhooks`), deduplication, retries, and worker lifecycle.
4. **[`auth-session-security`](./.agents/skills/auth-session-security/SKILL.md)**: Multi-token JWT lifecycle, SHA-256 device fingerprinting, session concurrency, and role authorization.
5. **[`stripe-subscriptions-webhooks`](./.agents/skills/stripe-subscriptions-webhooks/SKILL.md)**: Stripe billing portal, checkout sessions, raw body webhook verification, and cache synchronization.
6. **[`redis-caching-invalidation`](./.agents/skills/redis-caching-invalidation/SKILL.md)**: Route-level caching, `getOrSetCache`, non-blocking key invalidations with `scanStream`, and maintenance scripts.
7. **[`email-security-rate-limiting`](./.agents/skills/email-security-rate-limiting/SKILL.md)**: Anti-abuse defense, disposable email filters, sliding-window rate limiters, and SMTP delivery error handling.

---

## 5. Useful Scripts & Commands

```bash
# Start API in development mode
npm run dev

# Start background workers individually in development mode
npm run dev:worker
npm run dev:worker:email

# Clear Redis application cache
npm run clear-cache

# Regenerate Swagger / OpenAPI documentation
node swagger.js
```
