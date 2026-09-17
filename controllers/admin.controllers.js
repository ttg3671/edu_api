import dbConnectionPromise from "../config/db.js";
import logger from "../libs/logger.js";
import { IDENTIFIER, STRIPE_SECRET_KEY } from "../config/env.js";
import { Vimeo } from '@vimeo/vimeo';
import Stripe from 'stripe';

import {
  handleValidationErrors,
  createError
} from "../utils/validationHelper.js";

import {
  getPaginationParams,
  getCursorPaginationParams,
  getPaginatedResults,
  sendEmptySuccess,
  sendPaginatedResponse,
  sendCursorPaginatedResponse,
  sendSuccess,
  asyncHandler,
  withTransaction
} from '../utils/paginationHelper.js';
import { clearCache } from "../utils/cache.js";

const vimeoClient = new Vimeo(null, null, IDENTIFIER);
const stripe = new Stripe(STRIPE_SECRET_KEY);

// ------------ CATEGORY GROUPS CRUD ------------

export const category_groups_get = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { limit, cursor } = getCursorPaginationParams(req.query);
  const db = await dbConnectionPromise;

  let dataQuery;
  let queryParams;

  if (cursor) {
    dataQuery = 'SELECT id, group_name FROM category_groups WHERE id > ? ORDER BY id ASC LIMIT ?';
    queryParams = [cursor, limit + 1];
  } else {
    dataQuery = 'SELECT id, group_name FROM category_groups ORDER BY id ASC LIMIT ?';
    queryParams = [limit + 1];
  }

  const [rows] = await db.query(dataQuery, queryParams);

  if (rows.length === 0) {
    return sendCursorPaginatedResponse(res, [], { nextCursor: null, hasMore: false });
  }

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return sendCursorPaginatedResponse(res, data, { nextCursor, hasMore });
});

export const category_groups_post = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { group_name } = req.body;

  const [[existing]] = await db.query(
    "SELECT 1 FROM category_groups WHERE group_name = ? LIMIT 1",
    [group_name]
  );

  if (existing) {
    throw createError("Category group already exists. Please insert a new one...");
  }

  const [result] = await db.query(
    "INSERT INTO category_groups (group_name) VALUES (?)", 
    [group_name]
  );

  await clearCache("cache:/api/v1/users/home*");

  return sendSuccess(res, result.insertId);
});

export const category_groups_update = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { id } = req.params;
  const { group_name } = req.body;

  const [[existing]] = await db.query(
    "SELECT 1 FROM category_groups WHERE id = ? LIMIT 1",
    [id]
  );

  if (!existing) {
    throw createError("Category group not found...");
  }

  const [[duplicate]] = await db.query(
    "SELECT 1 FROM category_groups WHERE group_name = ? AND id != ? LIMIT 1",
    [group_name, id]
  );

  if (duplicate) {
    throw createError("Category group already exists. Please insert a new one...");
  }

  const [result] = await db.query(
    "UPDATE category_groups SET group_name = ? WHERE id = ?",
    [group_name, id]
  );

  if (result.affectedRows === 0) {
    throw createError("Update operation failed...");
  }

  await clearCache("cache:/api/v1/users/home*");

  return sendSuccess(res, "", "Category group updated successfully");
});

export const category_groups_delete = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { id } = req.params;
  const db = await dbConnectionPromise;

  const [[existing]] = await db.query(
    "SELECT 1 FROM category_groups WHERE id = ? LIMIT 1",
    [id]
  );

  if (!existing) {
    throw createError("Category group not found...");
  }

  const [result] = await db.query("DELETE FROM category_groups WHERE id = ?", [id]);

  if (result.affectedRows === 0) {
    throw createError("Failed to delete. Try Again...");
  }

  await clearCache("cache:/api/v1/users/home*");

  return sendSuccess(res, "", "Category group deleted successfully");
});


// ------------ CATEGORY CRUD ------------

export const categories_get = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { limit, cursor } = getCursorPaginationParams(req.query);
  const group_id = req.params.group_id || req.query.group_id;
  const db = await dbConnectionPromise;

  let whereConditions = [];
  let queryParams = [];

  // 1. Group ID Logic
  if (group_id && group_id !== 'undefined' && group_id !== '') {
    whereConditions.push("c.group_id = ?");
    queryParams.push(Number(group_id));
  }

  // 2. Cursor Pagination Logic
  if (cursor) {
    whereConditions.push("c.id > ?");
    queryParams.push(Number(cursor));
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  const dataQuery = `
    SELECT 
      c.id, 
      c.group_id, 
      c.name, 
      cg.group_name
    FROM categories AS c
    LEFT JOIN category_groups AS cg ON c.group_id = cg.id
    ${whereClause}
    ORDER BY c.id ASC
    LIMIT ?
  `;

  queryParams.push(limit + 1);

  const [rows] = await db.query(dataQuery, queryParams);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return sendCursorPaginatedResponse(res, data, { nextCursor, hasMore });
});

export const categories_post = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { group_id, name } = req.body;

  // Check if group exists
  const [[groupExists]] = await db.query(
    "SELECT 1 FROM category_groups WHERE id = ? LIMIT 1",
    [group_id]
  );

  if (!groupExists) {
    throw createError("Category group not found...", 404);
  }

  const [[existing]] = await db.query(
    "SELECT 1 FROM categories WHERE name = ? AND group_id = ? LIMIT 1",
    [name, group_id]
  );

  if (existing) {
    throw createError("Category already exists in this group...");
  }

  const [result] = await db.query(
    "INSERT INTO categories (group_id, name) VALUES (?, ?)", 
    [group_id, name]
  );

  await clearCache("cache:/api/v1/users/home*");

  return sendSuccess(res, result.insertId);
});

export const categories_update = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { id } = req.params;
  const { group_id, name } = req.body;

  // Check if category exists
  const [[exists]] = await db.query(
    "SELECT 1 FROM categories WHERE id = ? LIMIT 1",
    [id]
  );

  if (!exists) {
    throw createError("Category not found...");
  }

  // Check if group exists
  const [[groupExists]] = await db.query(
    "SELECT 1 FROM category_groups WHERE id = ? LIMIT 1",
    [group_id]
  );

  if (!groupExists) {
    throw createError("Category group not found...", 404);
  }

  const [[duplicate]] = await db.query(
    "SELECT 1 FROM categories WHERE name = ? AND group_id = ? AND id != ? LIMIT 1",
    [name, group_id, id]
  );

  if (duplicate) {
    throw createError("Category already exists in this group...");
  }

  const [result] = await db.query(
    "UPDATE categories SET group_id = ?, name = ? WHERE id = ?",
    [group_id, name, id]
  );
  if (result.affectedRows === 0) {
    throw createError("Update operation failed...");
  }

  await clearCache("cache:/api/v1/users/home*");

  return sendSuccess(res, "", "Category updated successfully");
});

export const category_delete = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { id } = req.params;
  const db = await dbConnectionPromise;

  const [[exists]] = await db.query(
    "SELECT 1 FROM categories WHERE id = ? LIMIT 1",
    [id]
  );

  if (!exists) {
    throw createError("Category not found...");
  }

  const [result] = await db.query("DELETE FROM categories WHERE id = ?", [id]);

  if (result.affectedRows === 0) {
    throw createError("Failed to delete. Try Again...");
  }

  await clearCache("cache:/api/v1/users/home*");

  return sendSuccess(res, "", "Category deleted successfully");
});


// ------------- NAV PILLS CRUD -----------------

export const nav_pills_get = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { limit, cursor } = getCursorPaginationParams(req.query);
  const db = await dbConnectionPromise;

  let dataQuery;
  let queryParams;

  if (cursor) {
    dataQuery = 'SELECT id, name, active_color, ui_style FROM nav_pills WHERE id > ? ORDER BY id ASC LIMIT ?';
    queryParams = [cursor, limit + 1];
  } else {
    dataQuery = 'SELECT id, name, active_color, ui_style FROM nav_pills ORDER BY id ASC LIMIT ?';
    queryParams = [limit + 1];
  }

  const [rows] = await db.query(dataQuery, queryParams);

  if (rows.length === 0) {
    return sendCursorPaginatedResponse(res, [], { nextCursor: null, hasMore: false });
  }

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return sendCursorPaginatedResponse(res, data, { nextCursor, hasMore });
});

export const nav_pills_post = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { name, active_color, ui_style, is_active } = req.body;

  const [[existing]] = await db.query(
    "SELECT 1 FROM nav_pills WHERE name = ? LIMIT 1",
    [name]
  );

  if (existing) {
    throw createError("This nav pill already exists", 400);
  }

  const [result] = await db.query(
    "INSERT INTO nav_pills (name, active_color, ui_style) VALUES (?, ?, ?)",
    [name, active_color || '#FFFFFF', ui_style || 'list']
  );

  await clearCache("cache:/api/v1/users/home*");
  await clearCache("cache:/api/v1/users/nav-pill*");
  await clearCache("cache:/api/v1/users/section*");

  return sendSuccess(res, result.insertId, "Nav pill created successfully");
});

export const nav_pills_update = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { id } = req.params;
  const { name, active_color, ui_style } = req.body;

  const [[duplicate]] = await db.query(
    "SELECT 1 FROM nav_pills WHERE name = ? AND id != ? LIMIT 1",
    [name, id]
  );

  if (duplicate) {
    throw createError("This nav pill already exists", 400);
  }

  const [result] = await db.query(
    "UPDATE nav_pills SET name = ?, active_color = ?, ui_style = ? WHERE id = ?",
    [name, active_color, ui_style, id]
  );

  if (result.affectedRows === 0) {
    throw createError("Update operation failed...");
  }

  await clearCache("cache:/api/v1/users/home*");
  await clearCache(`cache:/api/v1/users/nav-pill/${id}*`);
  await clearCache("cache:/api/v1/users/section*");

  return sendSuccess(res, "", "Nav pill updated successfully");
});

export const nav_pills_delete = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { id } = req.params;
  const db = await dbConnectionPromise;

  const [result] = await db.query("DELETE FROM nav_pills WHERE id = ?", [id]);

  if (result.affectedRows === 0) {
    throw createError("Failed to delete. Try Again...");
  }

  await clearCache("cache:/api/v1/users/home*");
  await clearCache(`cache:/api/v1/users/nav-pill/${id}*`);
  await clearCache("cache:/api/v1/users/section*");

  return sendSuccess(res, "", "Nav pill deleted successfully");
});


// ------------- COLLECTIONS CRUD -----------------

export const collections_get = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { limit, cursor } = getCursorPaginationParams(req.query);
  const db = await dbConnectionPromise;

  let dataQuery;
  let queryParams;

  if (cursor) {
    dataQuery = 'SELECT id, name, layout_type FROM collections WHERE id > ? ORDER BY id ASC LIMIT ?';
    queryParams = [cursor, limit + 1];
  } else {
    dataQuery = 'SELECT id, name, layout_type FROM collections ORDER BY id ASC LIMIT ?';
    queryParams = [limit + 1];
  }

  const [rows] = await db.query(dataQuery, queryParams);

  if (rows.length === 0) {
    return sendCursorPaginatedResponse(res, [], { nextCursor: null, hasMore: false });
  }

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return sendCursorPaginatedResponse(res, data, { nextCursor, hasMore });
});

export const collections_post = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { name, layout_type } = req.body;

  const [[existing]] = await db.query(
    "SELECT 1 FROM collections WHERE name = ? LIMIT 1",
    [name]
  );

  if (existing) {
    throw createError("This collection already exists", 400);
  }

  const [result] = await db.query(
    "INSERT INTO collections (name, layout_type) VALUES (?, ?)",
    [name, layout_type || 'horizontal_scroll']
  );

  await clearCache("cache:/api/v1/users/home*");
  await clearCache("cache:/api/v1/users/nav-pill*");
  await clearCache("cache:/api/v1/users/section*");

  return sendSuccess(res, result.insertId, "Collection created successfully");
});

export const collections_update = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { id } = req.params;
  const { name, layout_type } = req.body;

  const [[duplicate]] = await db.query(
    "SELECT 1 FROM collections WHERE name = ? AND id != ? LIMIT 1",
    [name, id]
  );

  if (duplicate) {
    throw createError("This collection already exists", 400);
  }

  const [result] = await db.query(
    "UPDATE collections SET name = ?, layout_type = ? WHERE id = ?",
    [name, layout_type, id]
  );

  if (result.affectedRows === 0) {
    throw createError("Update operation failed...");
  }

  await clearCache("cache:/api/v1/users/home*");
  await clearCache("cache:/api/v1/users/nav-pill*");
  await clearCache(`cache:/api/v1/users/section/${id}*`);

  return sendSuccess(res, "", "Collection updated successfully");
});

export const collections_delete = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { id } = req.params;
  const db = await dbConnectionPromise;

  const [result] = await db.query("DELETE FROM collections WHERE id = ?", [id]);

  if (result.affectedRows === 0) {
    throw createError("Failed to delete. Try Again...");
  }

  await clearCache("cache:/api/v1/users/home*");
  await clearCache("cache:/api/v1/users/nav-pill*");
  await clearCache(`cache:/api/v1/users/section/${id}*`);

  return sendSuccess(res, "", "Collection deleted successfully");
});


// ------------- NAV PILL COLLECTIONS MAPPING CRUD -----------------

export const nav_pill_collections_get = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { nav_pill_id } = req.params;
  const db = await dbConnectionPromise;

  const [rows] = await db.query(`
    SELECT npc.id, npc.nav_pill_id, npc.collection_id, npc.position, c.name AS collection_name
    FROM nav_pill_collections AS npc
    LEFT JOIN collections AS c ON npc.collection_id = c.id
    WHERE npc.nav_pill_id = ?
    ORDER BY npc.position ASC
  `, [nav_pill_id]);

  return sendSuccess(res, rows);
});

export const nav_pill_collections_post = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { nav_pill_id, collection_ids } = req.body;

  // Verify Nav Pill exists
  const [[navPill]] = await db.query("SELECT 1 FROM nav_pills WHERE id = ? LIMIT 1", [nav_pill_id]);
  if (!navPill) {
    throw createError("Nav pill not found", 404);
  }

  // Verify all Collections exist
  const [validCollections] = await db.query(
    "SELECT id FROM collections WHERE id IN (?)",
    [collection_ids]
  );
  if (validCollections.length !== collection_ids.length) {
    throw createError("One or more Collection IDs are invalid", 400);
  }

  // Get current max position globally
  const [[maxRow]] = await db.query(
    "SELECT MAX(position) as maxPos FROM nav_pill_collections"
  );
  let currentPos = maxRow?.maxPos || 0;

  // Prepare values for batch insert
  const values = collection_ids.map(collectionId => {
    currentPos += 1000.0;
    return [nav_pill_id, collectionId, currentPos];
  });

  await db.query(
    `INSERT INTO nav_pill_collections (nav_pill_id, collection_id, position) 
     VALUES ? 
     ON DUPLICATE KEY UPDATE position = VALUES(position)`,
    [values]
  );

  await clearCache("cache:/api/v1/users/home*");
  await clearCache(`cache:/api/v1/users/nav-pill/${nav_pill_id}*`);
  await clearCache("cache:/api/v1/users/section*");

  return sendSuccess(res, null, "Collections added/updated to nav pill successfully");
});

export const nav_pill_collections_update = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { nav_pill_id } = req.params;
  const { collection_ids } = req.body;
  const db = await dbConnectionPromise;

  await withTransaction(db, async (connection) => {
    // 1. Verify Nav Pill exists
    const [[navPill]] = await connection.query("SELECT 1 FROM nav_pills WHERE id = ? LIMIT 1", [nav_pill_id]);
    if (!navPill) {
      throw createError("Nav pill not found", 404);
    }

    // 2. Verify all Collections exist
    const [validCollections] = await connection.query(
      "SELECT id FROM collections WHERE id IN (?)",
      [collection_ids]
    );
    if (validCollections.length !== collection_ids.length) {
      throw createError("One or more Collection IDs are invalid", 400);
    }

    // 3. Delete existing mappings for this nav pill
    await connection.query("DELETE FROM nav_pill_collections WHERE nav_pill_id = ?", [nav_pill_id]);

    // 4. Get current max position globally
    const [[maxRow]] = await connection.query("SELECT MAX(position) as maxPos FROM nav_pill_collections");
    let currentPos = maxRow?.maxPos || 0;

    // 5. Insert new mappings with incrementing positions
    const values = collection_ids.map(collectionId => {
      currentPos += 1000.0;
      return [nav_pill_id, collectionId, currentPos];
    });

    await connection.query(
      "INSERT INTO nav_pill_collections (nav_pill_id, collection_id, position) VALUES ?",
      [values]
    );
  });

  await clearCache("cache:/api/v1/users/home*");
  await clearCache(`cache:/api/v1/users/nav-pill/${nav_pill_id}*`);
  await clearCache("cache:/api/v1/users/section*");

  return sendSuccess(res, null, "Collection mappings updated successfully");
});

export const nav_pill_collections_reorder = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { id, new_position } = req.body;
  const db = await dbConnectionPromise;

  await withTransaction(db, async (connection) => {
    // 1. Find the pill ID
    const [[mapping]] = await connection.query(
      "SELECT nav_pill_id FROM nav_pill_collections WHERE id = ? FOR UPDATE",
      [id]
    );
    if (!mapping) throw createError("Mapping not found", 404);
    const nav_pill_id = mapping.nav_pill_id;

    // 2. Fetch all items in this pill
    const [rows] = await connection.query(
      "SELECT id, position FROM nav_pill_collections WHERE nav_pill_id = ? ORDER BY position ASC FOR UPDATE",
      [nav_pill_id]
    );

    const originalPositions = rows.map(r => r.position);

    // 3. Find and move item in memory
    const currentIndex = rows.findIndex(r => r.id === id);
    if (currentIndex === -1) throw createError("Item not found", 404);

    const [itemToMove] = rows.splice(currentIndex, 1);
    let targetRank = new_position >= 1000 ? Math.round(new_position / 1000) : new_position;
    targetRank = Math.min(Math.max(targetRank, 1), rows.length + 1);
    rows.splice(targetRank - 1, 0, itemToMove);

    // 4. Save all with clean positions
    await connection.query("UPDATE nav_pill_collections SET position = position + 1000000 WHERE nav_pill_id = ?", [nav_pill_id]);
    for (let i = 0; i < rows.length; i++) {
      await connection.query(
        "UPDATE nav_pill_collections SET position = ? WHERE id = ?",
        [originalPositions[i], rows[i].id]
      );
    }
  });

  await clearCache("cache:/api/v1/users/home*");
  await clearCache("cache:/api/v1/users/nav-pill*"); 
  await clearCache("cache:/api/v1/users/section*");

  return sendSuccess(res, { id, new_position }, "Collection position updated successfully");
});

export const nav_pill_collections_delete = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { id } = req.params;
  const db = await dbConnectionPromise;

  const [[mapping]] = await db.query("SELECT nav_pill_id FROM nav_pill_collections WHERE id = ? LIMIT 1", [id]);

  const [result] = await db.query("DELETE FROM nav_pill_collections WHERE id = ?", [id]);

  await clearCache("cache:/api/v1/users/home*");
  if (mapping) await clearCache(`cache:/api/v1/users/nav-pill/${mapping.nav_pill_id}*`);
  await clearCache("cache:/api/v1/users/section*");

  return sendSuccess(res, "", "Collection removed from nav pill successfully");
});


// ------------- COLLECTION MODULES MAPPING CRUD -----------------

export const collection_modules_get = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { collection_id } = req.params;
  const db = await dbConnectionPromise;

  const [rows] = await db.query(`
    SELECT cm.id, cm.collection_id, cm.module_id, cm.position, m.title AS module_title
    FROM collection_modules AS cm
    LEFT JOIN modules AS m ON cm.module_id = m.id
    WHERE cm.collection_id = ?
    ORDER BY cm.position ASC
  `, [collection_id]);

  return sendSuccess(res, rows);
});

export const collection_modules_post = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { collection_id, module_ids } = req.body;

  // Verify Collection exists
  const [[collection]] = await db.query("SELECT 1 FROM collections WHERE id = ? LIMIT 1", [collection_id]);
  if (!collection) {
    throw createError("Collection not found", 404);
  }

  // Verify all Modules exist
  const [validModules] = await db.query(
    "SELECT id FROM modules WHERE id IN (?)",
    [module_ids]
  );
  if (validModules.length !== module_ids.length) {
    throw createError("One or more Module IDs are invalid", 400);
  }

  // Get current max position for this collection
  const [[maxRow]] = await db.query(
    "SELECT MAX(position) as maxPos FROM collection_modules WHERE collection_id = ?",
    [collection_id]
  );
  let currentPos = Number(maxRow?.maxPos || 0);

  // Prepare values for batch insert
  const values = module_ids.map(moduleId => {
    currentPos += 1000.0;
    return [collection_id, moduleId, currentPos];
  });

  await db.query(
    `INSERT INTO collection_modules (collection_id, module_id, position) 
     VALUES ? 
     ON DUPLICATE KEY UPDATE position = VALUES(position)`,
    [values]
  );

  await clearCache("cache:/api/v1/users/home*");
  await clearCache("cache:/api/v1/users/nav-pill*");
  await clearCache(`cache:/api/v1/users/section/${collection_id}*`);

  return sendSuccess(res, null, "Modules added/updated to collection successfully");
});

export const collection_modules_update = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { collection_id } = req.params;
  const { module_ids } = req.body;
  const db = await dbConnectionPromise;

  await withTransaction(db, async (connection) => {
    // 1. Verify Collection exists
    const [[collection]] = await connection.query("SELECT 1 FROM collections WHERE id = ? LIMIT 1", [collection_id]);
    if (!collection) {
      throw createError("Collection not found", 404);
    }

    // 2. Verify all Modules exist
    const [validModules] = await connection.query(
      "SELECT id FROM modules WHERE id IN (?)",
      [module_ids]
    );
    if (validModules.length !== module_ids.length) {
      throw createError("One or more Module IDs are invalid", 400);
    }

    // 3. Delete existing mappings for this collection
    await connection.query("DELETE FROM collection_modules WHERE collection_id = ?", [collection_id]);

    // 4. Get current max position globally
    const [[maxRow]] = await connection.query("SELECT MAX(position) as maxPos FROM collection_modules");
    let currentPos = maxRow?.maxPos || 0;

    // 5. Insert new mappings with incrementing positions
    const values = module_ids.map(moduleId => {
      currentPos += 1000.0;
      return [collection_id, moduleId, currentPos];
    });

    await connection.query(
      "INSERT INTO collection_modules (collection_id, module_id, position) VALUES ?",
      [values]
    );
  });

  await clearCache("cache:/api/v1/users/home*");
  await clearCache("cache:/api/v1/users/nav-pill*");
  await clearCache(`cache:/api/v1/users/section/${collection_id}*`);

  return sendSuccess(res, null, "Collection modules updated successfully");
});

export const collection_modules_reorder = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { id, new_position } = req.body;
  const db = await dbConnectionPromise;

  await withTransaction(db, async (connection) => {
    // 1. Find the collection ID
    const [[mapping]] = await connection.query(
      "SELECT collection_id FROM collection_modules WHERE id = ? FOR UPDATE",
      [id]
    );
    if (!mapping) throw createError("Mapping not found", 404);
    const collection_id = mapping.collection_id;

    // 2. Fetch all items in this collection
    const [rows] = await connection.query(
      "SELECT id FROM collection_modules WHERE collection_id = ? ORDER BY position ASC FOR UPDATE",
      [collection_id]
    );

    // 3. Find and move item in memory
    const currentIndex = rows.findIndex(r => r.id === id);
    if (currentIndex === -1) throw createError("Item not found", 404);

    const [itemToMove] = rows.splice(currentIndex, 1);
    let targetRank = new_position >= 1000 ? Math.round(new_position / 1000) : new_position;
    targetRank = Math.min(Math.max(targetRank, 1), rows.length + 1);
    rows.splice(targetRank - 1, 0, itemToMove);

    // 4. Save all with clean positions
    await connection.query("UPDATE collection_modules SET position = position + 1000000 WHERE collection_id = ?", [collection_id]);
    for (let i = 0; i < rows.length; i++) {
      await connection.query(
        "UPDATE collection_modules SET position = ? WHERE id = ?",
        [(i + 1) * 1000, rows[i].id]
      );
    }
  });

  await clearCache("cache:/api/v1/users/home*");
  await clearCache("cache:/api/v1/users/nav-pill*");
  await clearCache("cache:/api/v1/users/section*");

  return sendSuccess(res, { id, new_position }, "Module position updated successfully");
});

export const collection_modules_delete = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { id } = req.params;
  const db = await dbConnectionPromise;

  const [[mapping]] = await db.query("SELECT collection_id FROM collection_modules WHERE id = ? LIMIT 1", [id]);

  const [result] = await db.query("DELETE FROM collection_modules WHERE id = ?", [id]);

  await clearCache("cache:/api/v1/users/home*");
  await clearCache("cache:/api/v1/users/nav-pill*");
  if (mapping) await clearCache(`cache:/api/v1/users/section/${mapping.collection_id}*`);

  return sendSuccess(res, "", "Module removed from collection successfully");
});


// ------------- HOME PAGE CONFIG CRUD -----------------

export const home_page_config_get = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;

  const [rows] = await db.query(`
    SELECT hpc.id, hpc.nav_pill_id, hpc.position, hpc.is_visible, np.name AS nav_pill_name
    FROM home_page_config AS hpc
    LEFT JOIN nav_pills AS np ON hpc.nav_pill_id = np.id
    ORDER BY hpc.position ASC
  `);

  return sendSuccess(res, rows);
});

export const home_page_config_post = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { nav_pill_id, is_visible } = req.body;

  const [[navPill]] = await db.query("SELECT 1 FROM nav_pills WHERE id = ? LIMIT 1", [nav_pill_id]);
  if (!navPill) {
    throw createError("Nav pill not found...");
  }

  // Get max position
  const [[{ maxPosition }]] = await db.query(
    'SELECT MAX(position) as maxPosition FROM home_page_config'
  );

  const newPosition = maxPosition ? maxPosition + 1000 : 1000;

  const [result] = await db.query(
    "INSERT INTO home_page_config (nav_pill_id, position, is_visible) VALUES (?, ?, ?)",
    [nav_pill_id, newPosition, is_visible !== undefined ? is_visible : true]
  );

  await clearCache("cache:/api/v1/users/home*");
  await clearCache("cache:/api/v1/users/nav-pill*");
  await clearCache("cache:/api/v1/users/section*");

  return sendSuccess(res, { id: result.insertId }, "Home page config added successfully");
});

export const home_page_config_update = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { id } = req.params;
  const { nav_pill_id, is_visible } = req.body;

  const [[configExists]] = await db.query("SELECT 1 FROM home_page_config WHERE id = ? LIMIT 1", [id]);
  if (!configExists) {
    throw createError("Home page config not found...", 404);
  }

  const [[navPill]] = await db.query("SELECT 1 FROM nav_pills WHERE id = ? LIMIT 1", [nav_pill_id]);
  if (!navPill) {
    throw createError("Nav pill not found...", 404);
  }

  await db.query(
    "UPDATE home_page_config SET nav_pill_id = ?, is_visible = ? WHERE id = ?",
    [nav_pill_id, is_visible, id]
  );

  await clearCache("cache:/api/v1/users/home*");
  await clearCache("cache:/api/v1/users/nav-pill*");
  await clearCache("cache:/api/v1/users/section*");

  return sendSuccess(res, null, "Home page config updated successfully");
});

export const home_page_config_reorder = asyncHandler(async (req, res) => {
  // console.log("Array-based Reorder Home Page Config:", req.body);
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { id, new_position } = req.body;

  await withTransaction(db, async (connection) => {
    // 1. Fetch all items in current order
    const [rows] = await connection.query(
      "SELECT id FROM home_page_config ORDER BY position ASC FOR UPDATE"
    );

    if (rows.length === 0) return;

    // 2. Find and move the item in the array
    const currentIndex = rows.findIndex(r => r.id === id);
    if (currentIndex === -1) {
      throw createError("Home page config not found", 404);
    }

    const [itemToMove] = rows.splice(currentIndex, 1);
    
    // Determine target rank (1-based index)
    let targetRank = new_position >= 1000 ? Math.round(new_position / 1000) : new_position;
    targetRank = Math.min(Math.max(targetRank, 1), rows.length + 1);
    
    // Re-insert at new rank
    rows.splice(targetRank - 1, 0, itemToMove);

    // 3. Save all with clean positions
    // First, move all to a safe temporary range to avoid unique collisions during the individual updates
    await connection.query("UPDATE home_page_config SET position = position + 1000000");

    for (let i = 0; i < rows.length; i++) {
      await connection.query(
        "UPDATE home_page_config SET position = ? WHERE id = ?",
        [(i + 1) * 1000, rows[i].id]
      );
    }
  });

  await clearCache("cache:/api/v1/users/home*");
  await clearCache("cache:/api/v1/users/nav-pill*");
  await clearCache("cache:/api/v1/users/section*");

  return sendSuccess(res, { id, new_position }, "Home page config reordered successfully");
});

export const home_page_config_delete = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { id } = req.params;
  const db = await dbConnectionPromise;

  const [result] = await db.query("DELETE FROM home_page_config WHERE id = ?", [id]);

  await clearCache("cache:/api/v1/users/home*");
  await clearCache("cache:/api/v1/users/nav-pill*");
  await clearCache("cache:/api/v1/users/section*");

  return sendSuccess(res, "", "Home page config deleted successfully");
});


// ---------------- MODULES CRUD -----------------

export const get_all_modules = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { limit, cursor } = getCursorPaginationParams(req.query);

  let dataQuery;
  let queryParams;

  if (cursor) {
    dataQuery = `
      SELECT id, title, is_active, is_free
      FROM modules
      WHERE id < ?
      ORDER BY id DESC
      LIMIT ?
    `;
    queryParams = [cursor, limit + 1];
  } else {
    dataQuery = `
      SELECT id, title, is_active, is_free
      FROM modules
      ORDER BY id DESC
      LIMIT ?
    `;
    queryParams = [limit + 1];
  }

  const [data] = await db.query(dataQuery, queryParams);

  if (data.length === 0) {
    return sendCursorPaginatedResponse(res, [], { nextCursor: null, hasMore: false });
  }

  const hasMore = data.length > limit;
  const modules = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore ? modules[modules.length - 1].id : null;

  return sendCursorPaginatedResponse(res, modules, { nextCursor, hasMore });
});

export const modules_filter = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const searchTerm = req.query.searchTerm?.trim() || null;
  const category = req.query.category ? parseInt(req.query.category) : null;
  const { limit, cursor } = getCursorPaginationParams(req.query);

  const db = await dbConnectionPromise;

  let whereConditions = [];
  let queryParams = [];

  if (searchTerm) {
    whereConditions.push("(m.title LIKE ? OR m.description LIKE ?)");
    queryParams.push(`%${searchTerm}%`, `%${searchTerm}%`);
  }

  if (category) {
    whereConditions.push("EXISTS (SELECT 1 FROM module_category_mapping AS mcm WHERE mcm.module_id = m.id AND mcm.category_id = ?)");
    queryParams.push(category);
  }

  if (cursor) {
    whereConditions.push("m.id < ?");
    queryParams.push(cursor);
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  const dataQuery = `
    SELECT m.id, m.title, m.description, m.thumbnail_url, m.is_active, m.is_free,
           (SELECT GROUP_CONCAT(c.name SEPARATOR ', ') FROM module_category_mapping mcm JOIN categories c ON mcm.category_id = c.id WHERE mcm.module_id = m.id) AS categories
    FROM modules AS m
    ${whereClause}
    ORDER BY m.id DESC
    LIMIT ?
  `;

  queryParams.push(limit + 1);

  const [data] = await db.query(dataQuery, queryParams);

  if (data.length === 0) {
    return sendSuccess(res, { modules: [], nextCursor: null, hasMore: false });
  }

  const hasMore = data.length > limit;
  const modules = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore ? modules[modules.length - 1].id : null;

  return sendSuccess(res, {
    modules,
    nextCursor,
    hasMore,
    filters: { searchTerm, category }
  });
});

export const modules_post = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { title, description, thumbnail_url, is_active = true, is_free = false, categories = [] } = req.body;

  const moduleId = await withTransaction(db, async (connection) => {
    const [[existingModule]] = await connection.query(
      "SELECT id FROM modules WHERE title = ? LIMIT 1",
      [title]
    );

    if (existingModule) {
      throw createError("This module already exists", 400);
    }

    if (categories.length > 0) {
      const [existingCats] = await connection.query(
        "SELECT id FROM categories WHERE id IN (?)",
        [categories]
      );

      if (existingCats.length !== categories.length) {
        throw createError("One or more category IDs are invalid", 400);
      }
    }

    const [response] = await connection.query(
      "INSERT INTO `modules`(`title`, `description`, `thumbnail_url`, `is_active`, `is_free`) VALUES(?,?,?,?,?)",
      [title, description, thumbnail_url, is_active, is_free]
    );

    const id = response.insertId;

    if (categories.length > 0) {
      const values = categories.map(catId => [id, catId]);
      await connection.query(
        "INSERT INTO module_category_mapping (module_id, category_id) VALUES ?",
        [values]
      );
    }

    return id;
  });

  // Invalidate caches AFTER transaction commit to eliminate race conditions
  await Promise.all([
    clearCache("cache:/api/v1/users/home*"),
    clearCache("cache:/api/v1/users/search*"),
    clearCache("cache:/api/v1/users/nav-pill*"),
    clearCache("cache:/api/v1/users/section*"),
    clearCache(`cache:/api/v1/users/modules/${moduleId}*`),
    clearCache(`cache:/api/v1/users/modules-lessons/${moduleId}*`)
  ]);

  return res.status(200).json({
    isSuccess: true,
    data: moduleId
  });
});

export const modules_edit = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { id } = req.params;

  const [[moduleResult]] = await db.query(
    "SELECT id, title, description, thumbnail_url, is_active, is_free FROM modules WHERE id = ? LIMIT 1",
    [id]
  );

  if (!moduleResult) {
    throw createError("Module not found...", 404);
  }

  const [categoryRows] = await db.query(
    "SELECT category_id as id FROM module_category_mapping WHERE module_id = ?",
    [id]
  );

  return sendSuccess(res, {
    ...moduleResult,
    categories: categoryRows || []
  });
});

export const modules_update = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const id = parseInt(req.params.id);
  const { title, description, thumbnail_url, is_active, is_free, categories = [] } = req.body;

  await withTransaction(db, async (connection) => {
    const [[exists]] = await connection.query(
      "SELECT 1 FROM modules WHERE id = ? LIMIT 1",
      [id]
    );

    if (!exists) {
      throw createError("Module not found...", 404);
    }

    const [[duplicateTitle]] = await connection.query(
      "SELECT id FROM modules WHERE title = ? AND id != ? LIMIT 1",
      [title, id]
    );

    if (duplicateTitle) {
      throw createError("This module already exists", 400);
    }

    if (categories.length > 0) {
      const [existingCats] = await connection.query(
        "SELECT id FROM categories WHERE id IN (?)",
        [categories]
      );

      if (existingCats.length !== categories.length) {
        throw createError("One or more category IDs are invalid", 400);
      }
    }

    await connection.query(
      "UPDATE `modules` SET `title`=?, `description`=?, `thumbnail_url`=?, `is_active`=?, `is_free`=? WHERE id=?",
      [title, description, thumbnail_url, is_active, is_free, id]
    );

    await connection.query("DELETE FROM module_category_mapping WHERE module_id = ?", [id]);

    if (categories.length > 0) {
      const values = categories.map(catId => [id, catId]);
      await connection.query(
        "INSERT INTO module_category_mapping (module_id, category_id) VALUES ?",
        [values]
      );
    }
  });

  // Invalidate caches AFTER transaction commit to eliminate race conditions
  await Promise.all([
    clearCache("cache:/api/v1/users/home*"),
    clearCache(`cache:/api/v1/users/modules/${id}*`),
    clearCache(`cache:/api/v1/users/modules-lessons/${id}*`),
    clearCache("cache:/api/v1/users/search*"),
    clearCache("cache:/api/v1/users/nav-pill*"),
    clearCache("cache:/api/v1/users/section*")
  ]);

  return res.status(200).json({
    isSuccess: true,
    data: ""
  });
});

export const modules_get_syllabus = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { id } = req.params;
  const db = await dbConnectionPromise;
  const { limit, cursor } = getCursorPaginationParams(req.query);

  const [[moduleExists]] = await db.query(
    "SELECT 1 FROM modules WHERE id = ? LIMIT 1",
    [id]
  );

  if (!moduleExists) {
    throw createError("Module not found...", 404);
  }

  let dataQuery;
  let queryParams;

  if (cursor) {
    dataQuery = `
      SELECT s.id, s.title, s.workout_instructions, s.position, (SELECT COUNT(l.id) FROM lessons l WHERE l.syllabus_id = s.id) AS lessons_count
      FROM syllabus AS s
      WHERE s.module_id = ? AND s.position > (SELECT position FROM syllabus WHERE id = ?)
      ORDER BY s.position ASC
      LIMIT ?
    `;
    queryParams = [id, cursor, limit + 1];
  } else {
    dataQuery = `
      SELECT s.id, s.title, s.workout_instructions, s.position, (SELECT COUNT(l.id) FROM lessons l WHERE l.syllabus_id = s.id) AS lessons_count
      FROM syllabus AS s
      WHERE s.module_id = ?
      ORDER BY s.position ASC
      LIMIT ?
    `;
    queryParams = [id, limit + 1];
  }

  const [data] = await db.query(dataQuery, queryParams);

  if (data.length === 0) {
    return sendCursorPaginatedResponse(res, [], { nextCursor: null, hasMore: false });
  }

  const hasMore = data.length > limit;
  const syllabus = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore ? syllabus[syllabus.length - 1].id : null;

  return sendCursorPaginatedResponse(res, syllabus, { nextCursor, hasMore });
});

export const syllabus_get_lessons = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { id } = req.params;
  const db = await dbConnectionPromise;
  const { limit, cursor } = getCursorPaginationParams(req.query);

  const [[syllabusExists]] = await db.query(
    "SELECT 1 FROM syllabus WHERE id = ? LIMIT 1",
    [id]
  );

  if (!syllabusExists) {
    throw createError("Syllabus not found...", 404);
  }

  let dataQuery;
  let queryParams;

  if (cursor) {
    dataQuery = `
      SELECT id, title, workout_instructions, position 
      FROM lessons 
      WHERE syllabus_id = ? AND position > (SELECT position FROM lessons WHERE id = ?)
      ORDER BY position ASC 
      LIMIT ?
    `;
    queryParams = [id, cursor, limit + 1];
  } else {
    dataQuery = 'SELECT id, title, workout_instructions, position FROM lessons WHERE syllabus_id = ? ORDER BY position ASC LIMIT ?';
    queryParams = [id, limit + 1];
  }

  const [data] = await db.query(dataQuery, queryParams);

  if (data.length === 0) {
    return sendCursorPaginatedResponse(res, [], { nextCursor: null, hasMore: false });
  }

  const hasMore = data.length > limit;
  const lessons = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore ? lessons[lessons.length - 1].id : null;

  return sendCursorPaginatedResponse(res, lessons, { nextCursor, hasMore });
});

export const modules_delete = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { id } = req.params;
  const db = await dbConnectionPromise;

  await withTransaction(db, async (connection) => {
    const [[exists]] = await connection.query(
      "SELECT 1 FROM `modules` WHERE id = ? LIMIT 1",
      [id]
    );

    if (!exists) {
      throw createError("Module not found...", 404);
    }

    await connection.query("DELETE FROM collection_modules WHERE module_id = ?", [id]);
    await connection.query("DELETE FROM module_category_mapping WHERE module_id = ?", [id]);
    await connection.query("DELETE FROM `modules` WHERE id = ?", [id]);
  });

  // Invalidate caches AFTER transaction commit to eliminate race conditions
  await Promise.all([
    clearCache("cache:/api/v1/users/home*"),
    clearCache(`cache:/api/v1/users/modules/${id}*`),
    clearCache(`cache:/api/v1/users/modules-lessons/${id}*`),
    clearCache("cache:/api/v1/users/search*"),
    clearCache("cache:/api/v1/users/nav-pill*"),
    clearCache("cache:/api/v1/users/section*")
  ]);

  return res.status(200).json({
    isSuccess: true,
    message: "Module deleted successfully",
  });
});


// ------------- SYLLABUS CRUD -----------------


export const syllabus_get = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { limit, cursor } = getCursorPaginationParams(req.query);
  const db = await dbConnectionPromise;

  let dataQuery;
  let queryParams;

  if (cursor) {
    dataQuery = `
      SELECT s.id, s.module_id, s.title, s.workout_instructions, s.position, (SELECT COUNT(l.id) FROM lessons l WHERE l.syllabus_id = s.id) AS lessons_count
      FROM syllabus AS s
      WHERE s.position > (SELECT position FROM syllabus WHERE id = ?)
      ORDER BY s.position ASC
      LIMIT ?
    `;
    queryParams = [cursor, limit + 1];
  } else {
    dataQuery = `
      SELECT s.id, s.module_id, s.title, s.workout_instructions, s.position, (SELECT COUNT(l.id) FROM lessons l WHERE l.syllabus_id = s.id) AS lessons_count
      FROM syllabus AS s
      ORDER BY s.position ASC
      LIMIT ?
    `;
    queryParams = [limit + 1];
  }

  const [data] = await db.query(dataQuery, queryParams);

  if (data.length === 0) {
    return sendCursorPaginatedResponse(res, [], { nextCursor: null, hasMore: false });
  }

  const hasMore = data.length > limit;
  const result = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore ? result[result.length - 1].id : null;

  return sendCursorPaginatedResponse(res, result, { nextCursor, hasMore });
});

export const syllabus_post = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { module_id, title, workout_instructions } = req.body;

  const [[moduleExists]] = await db.query(
    "SELECT 1 FROM modules WHERE id = ? LIMIT 1",
    [module_id]
  );

  if (!moduleExists) {
    throw createError("Module not found...", 404);
  }

  const [[maxRow]] = await db.query(
    "SELECT MAX(position) as maxPos FROM syllabus"
  );
  const position = (maxRow?.maxPos || 0) + 1000.0;

  const [result] = await db.query(
    "INSERT INTO syllabus (module_id, title, workout_instructions, position) VALUES (?, ?, ?, ?)",
    [module_id, title, workout_instructions ?? null, position]
  );

  await clearCache(`cache:/api/v1/users/modules-lessons/${module_id}*`);

  return sendSuccess(res, result.insertId, "Syllabus created successfully");
});

export const syllabus_edit = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { id } = req.params;

  const [[rows]] = await db.query(
    "SELECT id, module_id, title, workout_instructions, position FROM syllabus WHERE id = ? LIMIT 1",
    [id]
  );

  if (!rows) {
    throw createError("Syllabus not found...", 404);
  }

  return sendSuccess(res, rows);
});

export const syllabus_update = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { id } = req.params;
  const { title, workout_instructions } = req.body;

  const [[syllabus]] = await db.query("SELECT module_id FROM syllabus WHERE id = ? LIMIT 1", [id]);
  if (!syllabus) throw createError("Syllabus not found...", 404);

  const [result] = await db.query(
    "UPDATE syllabus SET title = ?, workout_instructions = ? WHERE id = ?",
    [title, workout_instructions ?? null, id]
  );

  if (result.affectedRows === 0) {
    throw createError("Update operation failed...", 500);
  }

  await clearCache(`cache:/api/v1/users/modules-lessons/${syllabus.module_id}*`);

  return sendSuccess(res, "", "Syllabus updated successfully");
});

export const syllabus_reorder = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { id, new_position } = req.body;
  const db = await dbConnectionPromise;

  await withTransaction(db, async (connection) => {
    // 1. Find the collection ID
    const [[mapping]] = await connection.query(
      "SELECT module_id FROM syllabus WHERE id = ? FOR UPDATE",
      [id]
    );

    if (!mapping) throw createError("Syllabus not found", 404);
    const module_id = mapping.module_id;

    // 2. Fetch all items in this collection
    const [rows] = await connection.query(
      "SELECT id FROM syllabus WHERE module_id = ? ORDER BY position ASC FOR UPDATE",
      [module_id]
    );

    // 3. Find and move item in memory
    const currentIndex = rows.findIndex(r => r.id === id);
    if (currentIndex === -1) throw createError("Item not found", 404);

    const [itemToMove] = rows.splice(currentIndex, 1);
    let targetRank = new_position >= 1000 ? Math.round(new_position / 1000) : new_position;
    targetRank = Math.min(Math.max(targetRank, 1), rows.length + 1);
    rows.splice(targetRank - 1, 0, itemToMove);

    // 4. Save all with clean positions
    await connection.query(
      "UPDATE syllabus SET position = position + 1000000 WHERE module_id = ?", 
      [module_id]
    );
    for (let i = 0; i < rows.length; i++) {
      await connection.query(
        "UPDATE syllabus SET position = ? WHERE id = ?",
        [(i + 1) * 1000, rows[i].id]
      );
    }
  });

  await clearCache("cache:/api/v1/users/modules-lessons/*");

  return sendSuccess(res, { id, new_position }, "Syllabus position updated successfully");
});

export const syllabus_delete = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { id } = req.params;
  const db = await dbConnectionPromise;

  const [[syllabus]] = await db.query("SELECT module_id FROM syllabus WHERE id = ? LIMIT 1", [id]);
  if (!syllabus) throw createError("Syllabus not found...", 404);

  const [result] = await db.query("DELETE FROM syllabus WHERE id = ?", [id]);

  if (result.affectedRows === 0) {
    throw createError("Failed to delete. Try Again...", 500);
  }

  await clearCache(`cache:/api/v1/users/modules-lessons/${syllabus.module_id}*`);

  return sendSuccess(res, "", "Syllabus deleted successfully");
});


// -------------- LESSONS CRUD ----------------------


export const lessons_post = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { syllabus_id, title, workout_instructions } = req.body;

  const [[syllabus]] = await db.query(
    "SELECT module_id FROM syllabus WHERE id = ? LIMIT 1",
    [syllabus_id]
  );

  if (!syllabus) {
    throw createError("Syllabus not found...", 404);
  }

  const [[maxRow]] = await db.query(
    "SELECT MAX(position) as maxPos FROM lessons"
  );
  const position = (maxRow?.maxPos || 0) + 1000.0;

  const [result] = await db.query(
    "INSERT INTO lessons (syllabus_id, title, workout_instructions, position) VALUES (?, ?, ?, ?)",
    [syllabus_id, title, workout_instructions ?? null, position]
  );

  await clearCache(`cache:/api/v1/users/modules-lessons/${syllabus.module_id}*`);

  return sendSuccess(res, result.insertId);
});

export const lessons_edit = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { id } = req.params;

  const [[rows]] = await db.query(
    "SELECT id, syllabus_id, title, workout_instructions, position FROM lessons WHERE id = ? LIMIT 1",
    [id]
  );

  if (!rows) {
    throw createError("Lesson not found...", 404);
  }

  return sendSuccess(res, rows);
});

export const lessons_update = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { id } = req.params;
  const { syllabus_id, title, workout_instructions } = req.body;

  const [[lessonInfo]] = await db.query(`
    SELECT s.module_id 
    FROM lessons l 
    JOIN syllabus s ON l.syllabus_id = s.id 
    WHERE l.id = ? LIMIT 1
  `, [id]);
  
  if (!lessonInfo) throw createError("Lesson not found...", 404);

  const [[syllabusRows]] = await db.query("SELECT 1 FROM syllabus WHERE id = ? LIMIT 1", [syllabus_id]);
  if (!syllabusRows) throw createError("Syllabus not found...", 404);

  const [result] = await db.query(
    "UPDATE lessons SET syllabus_id = ?, title = ?, workout_instructions = ? WHERE id = ?",
    [syllabus_id, title, workout_instructions ?? null, id]
  );

  if (result.affectedRows === 0) {
    throw createError("Update operation failed...", 500);
  }

  await clearCache(`cache:/api/v1/users/modules-lessons/${lessonInfo.module_id}*`);
  await clearCache(`cache:/api/v1/users/lesson/${id}*`);

  return sendSuccess(res, "", "Lesson updated successfully");
});

export const lessons_reorder = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { id, new_position } = req.body;
  const db = await dbConnectionPromise;

  await withTransaction(db, async (connection) => {
    // 1. Find the collection ID
    const [[mapping]] = await connection.query(
      "SELECT syllabus_id FROM lessons WHERE id = ? FOR UPDATE",
      [id]
    );

    if (!mapping) throw createError("Lesson not found", 404);
    const syllabus_id = mapping.syllabus_id;

    // 2. Fetch all items in this collection
    const [rows] = await connection.query(
      "SELECT id FROM lessons WHERE syllabus_id = ? ORDER BY position ASC FOR UPDATE",
      [syllabus_id]
    );

    // 3. Find and move item in memory
    const currentIndex = rows.findIndex(r => r.id === id);
    if (currentIndex === -1) throw createError("Item not found", 404);

    const [itemToMove] = rows.splice(currentIndex, 1);
    let targetRank = new_position >= 1000 ? Math.round(new_position / 1000) : new_position;
    targetRank = Math.min(Math.max(targetRank, 1), rows.length + 1);
    rows.splice(targetRank - 1, 0, itemToMove);

    // 4. Save all with clean positions
    await connection.query(
      "UPDATE lessons SET position = position + 1000000 WHERE syllabus_id = ?", 
      [syllabus_id]
    );
    for (let i = 0; i < rows.length; i++) {
      await connection.query(
        "UPDATE lessons SET position = ? WHERE id = ?",
        [(i + 1) * 1000, rows[i].id]
      );
    }
  });

  await clearCache("cache:/api/v1/users/modules-lessons/*");
  await clearCache(`cache:/api/v1/users/lesson/${id}*`);

  return sendSuccess(res, { id, new_position }, "Lesson position updated successfully");
});

export const lessons_delete = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { id } = req.params;
  const db = await dbConnectionPromise;

  const [[lessonInfo]] = await db.query(`
    SELECT s.module_id 
    FROM lessons l 
    JOIN syllabus s ON l.syllabus_id = s.id 
    WHERE l.id = ? LIMIT 1
  `, [id]);

  const [result] = await db.query("DELETE FROM lessons WHERE id = ?", [id]);

  if (result.affectedRows === 0) {
    throw createError("Failed to delete. Try Again...", 500);
  }

  if (lessonInfo) {
    await clearCache(`cache:/api/v1/users/modules-lessons/${lessonInfo.module_id}*`);
  }
  await clearCache(`cache:/api/v1/users/lesson/${id}*`);

  return sendSuccess(res, "", "Lesson deleted successfully");
});

export const lessons_search = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const searchTerm = req.query.searchTerm?.trim() || null;
  const syllabusId = req.query.syllabus_id ? parseInt(req.query.syllabus_id) : null;
  const { limit, cursor } = getCursorPaginationParams(req.query);

  const db = await dbConnectionPromise;

  let whereConditions = [];
  let queryParams = [];

  if (searchTerm) {
    whereConditions.push("l.title LIKE ?");
    queryParams.push(`%${searchTerm}%`);
  }

  if (syllabusId) {
    whereConditions.push("l.syllabus_id = ?");
    queryParams.push(syllabusId);
  }

  if (cursor) {
    whereConditions.push("l.id < ?");
    queryParams.push(cursor);
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  const dataQuery = `
    SELECT l.*, s.title AS syllabus_title
    FROM lessons AS l
    LEFT JOIN syllabus AS s ON l.syllabus_id = s.id
    ${whereClause}
    ORDER BY l.position ASC
    LIMIT ?
  `;

  queryParams.push(limit + 1);

  const [data] = await db.query(dataQuery, queryParams);

  if (data.length === 0) {
    return sendSuccess(res, { lessons: [], nextCursor: null, hasMore: false });
  }

  const hasMore = data.length > limit;
  const lessons = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore ? lessons[lessons.length - 1].id : null;

  return sendSuccess(res, {
    lessons,
    nextCursor,
    hasMore,
    filters: { searchTerm, syllabusId }
  });
});


// ------------ VIMEO VIDEO LINK CRUD ----------------


const fetchVimeoVideoData = async (videoId) => {
  return new Promise((resolve, reject) => {
    vimeoClient.request({
      method: 'GET',
      path: `/videos/${videoId}`,
      query: {
        fields: 'files, pictures'
      }
    }, function (error, body) {
      if (error) {
        logger.error('Error fetching video data from Vimeo:', error);
        return resolve({
          isSuccess: true,
          data: {
            video: "",
            thumbnail: ""
          }
        });
      }

      if (!body.files || body.files.length === 0) {
        return resolve({
          isSuccess: true,
          data: {
            video: "",
            thumbnail: ""
          }
        });
      }

      resolve({
        isSuccess: true,
        data: {
          video: videoId,
          thumbnail: body?.pictures?.base_link
        }
      });
    });
  });
};

export const getVideoByLessonID = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { lesson_id } = req.params;
  const db = await dbConnectionPromise;

  const [[videoRows]] = await db.query(
    "SELECT id, video_provider_id, ui_style FROM videos WHERE lesson_id = ? LIMIT 1",
    [lesson_id]
  );

  if (!videoRows) {
    return sendSuccess(res, null);
  }

  const result = await fetchVimeoVideoData(videoRows.video_provider_id);
  result.data.ui_style = videoRows.ui_style;
  result.data.id = videoRows.id;

  return res.status(200).json(result);
});

export const createVideo = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  let { lesson_id, video_provider_id, ui_style = 'horizontal' } = req.body;
  const db = await dbConnectionPromise;

  const [[lessonRows]] = await db.query("SELECT 1 FROM lessons WHERE id = ? LIMIT 1", [lesson_id]);

  if (!lessonRows) {
    throw createError(`Lesson not found...`, 404);
  }

  const videoResult = await fetchVimeoVideoData(video_provider_id);

  const [result] = await db.query(
    "INSERT INTO videos (lesson_id, video_provider_id, thumbnail_url, ui_style) VALUES (?, ?, ?, ?)",
    [lesson_id, videoResult?.data?.video, videoResult?.data?.thumbnail, ui_style]
  );

  // Invalidate caches
  await clearCache(`vimeo:${video_provider_id}`);
  
  // Also clear the module cache since the lesson changed
  const [[lesson]] = await db.query("SELECT syllabus_id FROM lessons WHERE id = ? LIMIT 1", [lesson_id]);
  if (lesson) {
    const [[syllabus]] = await db.query("SELECT module_id FROM syllabus WHERE id = ? LIMIT 1", [lesson.syllabus_id]);
    if (syllabus) await clearCache(`cache:/api/v1/users/modules-lessons/${syllabus.module_id}*`);
  }

  return sendSuccess(res, result.insertId, 'Video added successfully');
});

export const updateVideo = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const id = parseInt(req.params.id);

  let { lesson_id, video_provider_id, ui_style = 'horizontal' } = req.body;
  const db = await dbConnectionPromise;

  const [[lessonRows]] = await db.query("SELECT 1 FROM videos WHERE id = ? LIMIT 1", [id]);

  if (!lessonRows) {
    throw createError(`Lesson not found...`, 404);
  }

  const videoResult = await fetchVimeoVideoData(video_provider_id);

  const [result] = await db.query(
    "UPDATE videos SET video_provider_id=?, thumbnail_url=?, ui_style=? WHERE id=?",
    [videoResult?.data?.video, videoResult?.data?.thumbnail, ui_style, id]
  );

  // Invalidate caches
  await clearCache(`vimeo:${video_provider_id}`);
  
  // Also clear the module cache since the lesson changed
  const [[lesson]] = await db.query("SELECT syllabus_id FROM lessons WHERE id = ? LIMIT 1", [lesson_id]);
  if (lesson) {
    const [[syllabus]] = await db.query("SELECT module_id FROM syllabus WHERE id = ? LIMIT 1", [lesson.syllabus_id]);
    if (syllabus) await clearCache(`cache:/api/v1/users/modules-lessons/${syllabus.module_id}*`);
  }

  return sendSuccess(res, result.insertId, 'Video added successfully');
});

export const deleteVideo = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { video_provider_id, lesson_id } = req.params;
  const db = await dbConnectionPromise;

  return new Promise((resolve, reject) => {
    vimeoClient.request({
      method: 'DELETE',
      path: `/videos/${video_provider_id}`
    }, async (error, body, statusCode, headers) => {
      if (error) {
        logger.error("Error deleting video from Vimeo:", error);
      }

      await db.query("DELETE FROM videos WHERE lesson_id = ?", [lesson_id]);
      
      // Invalidate caches
      await clearCache(`vimeo:${video_provider_id}`);
      
      const [[lesson]] = await db.query("SELECT syllabus_id FROM lessons WHERE id = ? LIMIT 1", [lesson_id]);
      if (lesson) {
        const [[syllabus]] = await db.query("SELECT module_id FROM syllabus WHERE id = ? LIMIT 1", [lesson.syllabus_id]);
        if (syllabus) await clearCache(`cache:/api/v1/users/modules-lessons/${syllabus.module_id}*`);
      }

      resolve(sendSuccess(res, "", 'Video deleted successfully'));
    });
  });
});


// ------------ USERS ------------


export const getUsers = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const db = await dbConnectionPromise;
  const { limit, cursor } = getCursorPaginationParams(req.query);

  let dataQuery;
  let queryParams;

  if (cursor) {
    dataQuery = `
      SELECT
        u.id,
        u.email,
        (
          SELECT us.status AS subscription_status
          FROM user_subscriptions AS us
          WHERE us.user_id = u.id
          ORDER BY us.updated_at DESC, us.id DESC
          LIMIT 1
        ) AS subscription_status
      FROM users AS u
      WHERE u.id < ?
      ORDER BY u.id DESC
      LIMIT ?
    `;

    queryParams = [cursor, limit + 1];
  } else {
    dataQuery = `
      SELECT
        u.id,
        u.email,
        (
          SELECT us.status AS subscription_status
          FROM user_subscriptions AS us
          WHERE us.user_id = u.id
          ORDER BY us.updated_at DESC, us.id DESC
          LIMIT 1
        ) AS subscription_status
      FROM users AS u
      ORDER BY u.id DESC
      LIMIT ?
    `;

    queryParams = [limit + 1];
  }

  const [data] = await db.query(dataQuery, queryParams);

  // console.log(data);

  if (data.length === 0) {
    return sendCursorPaginatedResponse(res, [], {
      nextCursor: null,
      hasMore: false,
    });
  }

  const hasMore = data.length > limit;
  const users = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore
    ? users[users.length - 1].id
    : null;

  return sendCursorPaginatedResponse(res, users, {
    nextCursor,
    hasMore,
  });
});


// ------------ PLANS CRUD -----------


export const getPlans = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { limit, cursor } = getCursorPaginationParams(req.query);
  const db = await dbConnectionPromise;

  let dataQuery;
  let queryParams;

  if (cursor) {
    dataQuery = 'SELECT id, plan_name, stripe_price_id, monthly_price, max_screens, duration_value, duration_unit, is_active FROM plans WHERE id > ? ORDER BY id ASC LIMIT ?';
    queryParams = [cursor, limit + 1];
  } else {
    dataQuery = 'SELECT id, plan_name, stripe_price_id, monthly_price, max_screens, duration_value, duration_unit, is_active FROM plans ORDER BY id ASC LIMIT ?';
    queryParams = [limit + 1];
  }

  const [data] = await db.query(dataQuery, queryParams);

  if (data.length === 0) {
    return sendCursorPaginatedResponse(res, [], { nextCursor: null, hasMore: false });
  }

  const hasMore = data.length > limit;
  const plans = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore ? plans[plans.length - 1].id : null;

  return sendCursorPaginatedResponse(res, plans, { nextCursor, hasMore });
});

export const addPlan = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { plan_name, stripe_price_id, monthly_price, max_screens, duration_value, duration_unit, is_active = true } = req.body;
  const db = await dbConnectionPromise;

  const [[existing]] = await db.query(
    "SELECT 1 FROM plans WHERE plan_name = ? OR stripe_price_id = ? LIMIT 1",
    [plan_name, stripe_price_id]
  );

  if (existing) {
    throw createError("Plan name or Stripe Price ID already exists", 400);
  }

  const [result] = await db.query(
    "INSERT INTO plans (plan_name, stripe_price_id, monthly_price, max_screens, duration_value, duration_unit, is_active) VALUES (?, ?, ?, ?, ?,?,?)",
    [plan_name, stripe_price_id, monthly_price, max_screens, duration_value, duration_unit, is_active]
  );

  return sendSuccess(res, result.insertId, 'Plan added successfully');
});

export const updatePlan = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { id } = req.params;
  const { plan_name, stripe_price_id, monthly_price, max_screens, duration_value, duration_unit, is_active } = req.body;

  const db = await dbConnectionPromise;

  const [[duplicate]] = await db.query(
    "SELECT 1 FROM plans WHERE (plan_name = ? OR stripe_price_id = ?) AND id != ? LIMIT 1",
    [plan_name, stripe_price_id, id]
  );

  if (duplicate) {
    throw createError("Plan name or Stripe Price ID already exists", 400);
  }

  const [result] = await db.query(
    "UPDATE plans SET plan_name = ?, stripe_price_id = ?, monthly_price = ?, max_screens = ?, duration_value = ?, duration_unit = ?, is_active = ? WHERE id = ?",
    [plan_name, stripe_price_id, monthly_price, max_screens, duration_value, duration_unit, is_active, id]
  );

  if (result.affectedRows === 0) {
    throw createError('Failed to update plan. Please try again.', 500);
  }

  return sendSuccess(res, "", 'Plan updated successfully');
});

export const deletePlan = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { id } = req.params;
  const db = await dbConnectionPromise;

  const [result] = await db.query('DELETE FROM plans WHERE id = ?', [id]);

  if (result.affectedRows === 0) {
    throw createError('Plan not found or failed to delete.', 404);
  }

  return sendSuccess(res, "", 'Plan deleted successfully');
});
