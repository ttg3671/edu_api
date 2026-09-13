---
name: mysql-database-operations
description: >-
  Use this skill when querying, updating, or performing transactional operations on the MySQL database in edu-api.
  Covers connection pooling, parameterized queries, transactions with withTransaction, validation helpers, and pagination.
---

# MySQL Database Operations & Patterns

This skill guides database access patterns, transaction handling, schema conventions, and pagination utilities in the `edu-api` project using `mysql2/promise`.

---

## Connection Pool (`config/db.js`)

The application uses a singleton connection pool:
- `pool.query(sql, params)`: Automatically acquires and releases a connection from the pool. Suitable for standalone read/write statements.
- Connection limits: `50` in production, `10` in development.
- Timezone configured as `'local'` with `dateStrings: true`.

```javascript
import pool from "../config/db.js";

// Standard parameterized query
const [rows] = await pool.query(
  "SELECT id, title, status FROM courses WHERE id = ? AND is_active = 1",
  [courseId]
);
```

---

## Transactions (`withTransaction`)

Always use `withTransaction` from `utils/paginationHelper.js` when performing multi-statement operations that must be atomic (e.g., updating user status and writing audit log, reordering modules/lessons, processing payments).

```javascript
import pool from "../config/db.js";
import { withTransaction } from "../utils/paginationHelper.js";
import { createError } from "../utils/validationHelper.js";

const result = await withTransaction(pool, async (connection) => {
  // Step 1: Check existing record with FOR UPDATE if pessimistic locking is needed
  const [[existing]] = await connection.query(
    "SELECT id, balance FROM user_wallets WHERE user_id = ? FOR UPDATE",
    [userId]
  );

  if (!existing || existing.balance < amount) {
    throw createError("Insufficient balance", 400);
  }

  // Step 2: Deduct balance
  await connection.query(
    "UPDATE user_wallets SET balance = balance - ? WHERE user_id = ?",
    [amount, userId]
  );

  // Step 3: Record transaction record
  const [insertResult] = await connection.query(
    "INSERT INTO wallet_transactions (user_id, amount, type, created_at) VALUES (?, ?, 'DEBIT', NOW())",
    [userId, amount]
  );

  return { transactionId: insertResult.insertId };
});
```

*Note: `withTransaction` handles `beginTransaction()`, `commit()`, automatic `rollback()` on error, and guarantees `connection.release()` in `finally`.*

---

## Existence & Foreign Key Validation Helpers

Before updating or linking relational records, validate IDs using helpers in `utils/validationHelper.js`:

```javascript
import { validateIdExists, validateIdsExist } from "../utils/validationHelper.js";

// Validate a single ID exists
await validateIdExists(connection, "courses", courseId, "Course not found");

// Validate an array of foreign keys exist (e.g. tag IDs or module IDs)
await validateIdsExist(connection, "tags", tagIds, "One or more invalid tag IDs provided");
```

---

## Pagination Patterns

### 1. Offset Pagination (`getPaginatedResults`)

Ideal for admin dashboards and paginated tables with total count:

```javascript
import pool from "../config/db.js";
import { getPaginationParams, getPaginatedResults, sendPaginatedResponse } from "../utils/paginationHelper.js";

export const listUsers = asyncHandler(async (req, res) => {
  const { itemsPerPage, pageNumber, offset } = getPaginationParams(req.query, 15);

  const countQuery = "SELECT COUNT(*) as c FROM users WHERE role = ?";
  const dataQuery = "SELECT id, name, email, role, created_at FROM users WHERE role = ? ORDER BY id DESC LIMIT ? OFFSET ?";
  const params = ['student'];

  const { data, totalCount, totalPages } = await getPaginatedResults(
    pool,
    countQuery,
    dataQuery,
    params,
    [...params, itemsPerPage, offset],
    itemsPerPage
  );

  return sendPaginatedResponse(res, data, { pageNumber, totalPages, totalCount, itemsPerPage });
});
```

### 2. Cursor Pagination (`getCursorResults`)

Ideal for high-throughput infinite scrolling feeds (e.g. notifications, user activity):

```javascript
import pool from "../config/db.js";
import { getCursorPaginationParams, getCursorResults, sendCursorPaginatedResponse } from "../utils/paginationHelper.js";

export const getNotifications = asyncHandler(async (req, res) => {
  const { limit, cursor } = getCursorPaginationParams(req.query, 20);

  const baseQuery = "SELECT id, message, created_at FROM notifications WHERE user_id = ?";
  const { result, nextCursor, hasMore } = await getCursorResults(
    pool,
    baseQuery,
    [req.user.id],
    cursor,
    limit,
    'id',
    'DESC'
  );

  return sendCursorPaginatedResponse(res, result, { nextCursor, hasMore });
});
```

---

## Safety & Best Practices Checklist

1. [ ] **Never concatenate strings into SQL queries**. Always use `?` parameterization.
2. [ ] Always destructure query responses appropriately:
   - `const [rows] = await pool.query(...)` for arrays.
   - `const [[record]] = await pool.query("... LIMIT 1", ...)` for a single row.
3. [ ] When modifying parent-child entities (like syllabus sections and lessons), wrap changes in `withTransaction`.
4. [ ] Invalidate relevant Redis caches after mutating data (e.g., `clearCache("user_profile:${userId}")`).
