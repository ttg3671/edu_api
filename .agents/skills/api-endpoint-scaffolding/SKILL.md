---
name: api-endpoint-scaffolding
description: >-
  Use this skill when designing, scaffolding, or extending REST API endpoints in the edu-api project.
  Guides the standard Express 5 layered pattern: routes, validators, controllers, services, and error handling.
---

# API Endpoint Scaffolding & Architecture

This skill defines the standardized procedure for adding or modifying REST API endpoints in `edu-api`. All endpoints must conform to Express 5 ESM standards, express-validator validation chains, centralized error handling, and consistent JSON envelopes.

---

## Architectural Layers

Every API feature in this codebase follows a 4-tier pattern:

```
Request ──> [ routes/<name>.routes.js ]
                  │
                  ├──> [ validators/<name>.validators.js ] (express-validator)
                  │
                  ├──> [ middleware/*.middleware.js ] (auth, role, cache, rate limits)
                  │
                  └──> [ controllers/<name>.controllers.js ]
                            │
                            ├──> [ services/<name>.service.js ] (optional complex domain logic)
                            └──> [ Database (MySQL) / Redis / Queue ]
```

---

## Step-by-Step Implementation Guide

### 1. Define Request Validation (`validators/<name>.validators.js`)

Use `express-validator` (`body`, `param`, `query`). Return validation chains as arrays.

```javascript
import { body, param, query } from "express-validator";

export const createResourceValidators = [
  body("title")
    .trim()
    .notEmpty().withMessage("Title is required")
    .isLength({ max: 255 }).withMessage("Title cannot exceed 255 characters"),
  body("price")
    .isFloat({ min: 0 }).withMessage("Price must be a positive number"),
  body("categoryId")
    .isInt({ min: 1 }).withMessage("Valid category ID is required")
];

export const getResourceByIdValidators = [
  param("id")
    .isInt({ min: 1 }).withMessage("Invalid ID parameter")
];
```

### 2. Implement Controller Handler (`controllers/<name>.controllers.js`)

Controllers must:
- Extract and validate input using `handleValidationErrors(req)`.
- Use `asyncHandler` from `../utils/paginationHelper.js` or wrap in try/catch calling `next(err)`.
- Return responses using `sendSuccess(res, data, message)` or `sendPaginatedResponse(res, result, meta)`.
- Throw errors using `createError(message, statusCode)` from `../utils/validationHelper.js`.

```javascript
import pool from "../config/db.js";
import { handleValidationErrors, createError } from "../utils/validationHelper.js";
import { asyncHandler, sendSuccess } from "../utils/paginationHelper.js";
import logger from "../libs/logger.js";

/**
 * Create a new resource
 * POST /api/v1/resource
 */
export const createResource = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { title, price, categoryId } = req.body;
  const userId = req.user?.id; // populated by authMiddleware

  const [result] = await pool.query(
    `INSERT INTO resources (title, price, category_id, created_by, created_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [title, price, categoryId, userId]
  );

  return sendSuccess(res, { id: result.insertId, title }, "Resource created successfully");
});
```

### 3. Configure Routes (`routes/<name>.routes.js`)

Mount validation chains and authentication/authorization middleware:

```javascript
import { Router } from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import authorizeRoles from "../middleware/role.middleware.js";
import { createResourceValidators } from "../validators/<name>.validators.js";
import { createResource } from "../controllers/<name>.controllers.js";

const router = Router();

router.post(
  "/",
  authMiddleware,
  authorizeRoles("ADMIN", "INSTRUCTOR"),
  createResourceValidators,
  createResource
);

export default router;
```

### 4. Mount in Main Application (`app.js`)

Register the router under `/api/v1/<resource>` in `app.js`:

```javascript
import resourceRouter from "./routes/resource.routes.js";
// ...
app.use("/api/v1/resources", resourceRouter);
```

---

## Response & Error Conventions

### Success Response Format:
```json
{
  "isSuccess": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

### Error Response Format (handled by `middleware/error.middleware.js`):
```json
{
  "isSuccess": false,
  "message": "Invalid ID found. Try again..."
}
```

*Note: In development (`NODE_ENV !== 'production'`), error responses automatically include `stack`.*

---

## Verification & Checklist

1. [ ] Validation errors return HTTP `400` with descriptive error messages.
2. [ ] Unauthenticated requests to protected endpoints return HTTP `401`.
3. [ ] Unauthorized requests (insufficient role) return HTTP `403`.
4. [ ] Resource not found throws `createError("Not Found", 404)`.
5. [ ] MySQL duplicate key errors (`ER_DUP_ENTRY`) are intercepted and formatted by `error.middleware.js`.
6. [ ] Update OpenAPI doc if applicable via `node swagger.js`.
