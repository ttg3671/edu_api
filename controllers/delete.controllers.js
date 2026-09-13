import dbConnectionPromise from "../config/db.js";
import {
  handleValidationErrors,
  createError
} from "../utils/validationHelper.js";
import {
  asyncHandler,
  sendSuccess,
  withTransaction
} from '../utils/paginationHelper.js';

// remove user account
export const userAccount = asyncHandler(async (req, res) => {
  const user_id = req.user?.id;

  if (!user_id) {
    throw createError("Unauthorized / User ID missing", 401);
  }

  const db = await dbConnectionPromise;

  await withTransaction(db, async (connection) => {
    const [[user]] = await connection.query(
      "SELECT id FROM users WHERE id = ? LIMIT 1",
      [user_id]
    );

    if (!user) {
      throw createError("User not found. Please log in again...", 404);
    }

    // Explicitly delete user_devices first
    await connection.query("DELETE FROM user_devices WHERE user_id = ?", [user_id]);

    // Delete user (this should cascade to user_profiles, user_subscriptions)
    const [result] = await connection.query("DELETE FROM users WHERE id = ?", [user_id]);

    if (result.affectedRows === 0) {
      throw createError("Failed to delete account. Try again...", 500);
    }
  });

  return sendSuccess(res, null, "User account deleted successfully");
});
