import dbConnectionPromise from "../config/db.js";
import {
  handleValidationErrors,
  createError
} from "../utils/validationHelper.js";
import {
  asyncHandler,
  sendSuccess,
} from '../utils/paginationHelper.js';
import { generateDeviceFingerprint } from "../utils/authHelper.js";
import { clearCache } from "../utils/cache.js";

// ---------- USER DETAILS CRUD ----------

export const getUserDetails = asyncHandler(async (req, res) => {
  const user_id = req.user?.id;
  const rawDeviceId = req.query.device_id;
  if (!user_id) throw createError("Unauthorized", 401);

  const deviceFingerprint = /^[a-f0-9]{64}$/i.test(rawDeviceId)
    ? rawDeviceId
    : generateDeviceFingerprint(rawDeviceId);

  const db = await dbConnectionPromise;

  // Verify device ownership
  const [[device]] = await db.query(
    "SELECT 1 FROM user_devices WHERE user_id = ? AND device_fingerprint = ? LIMIT 1",
    [user_id, deviceFingerprint]
  );
  if (!device) throw createError("Device not found or not registered to this user.", 403);

  const [rows] = await db.query(
    "SELECT name, bio, avatar_url FROM user_profiles WHERE user_id = ? AND device_fingerprint = ? LIMIT 1",
    [user_id, deviceFingerprint]
  );

  return sendSuccess(res, rows[0] || {});
});

export const updateUserDetails = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const user_id = req.user?.id;
  if (!user_id) throw createError("Unauthorized", 401);

  const { device_id, name, bio, avatar_url } = req.body;

  const deviceFingerprintVal = /^[a-f0-9]{64}$/i.test(device_id)
    ? device_id
    : generateDeviceFingerprint(device_id);

  const db = await dbConnectionPromise;

  // Verify device ownership
  const [[device]] = await db.query(
    "SELECT 1 FROM user_devices WHERE user_id = ? AND device_fingerprint = ? LIMIT 1",
    [user_id, deviceFingerprintVal]
  );
  if (!device) throw createError("Device not found or not registered to this user.", 403);

  await db.query(
    `INSERT INTO user_profiles (user_id, device_fingerprint, name, bio, avatar_url)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE 
     name = VALUES(name), 
     bio = VALUES(bio), 
     avatar_url = VALUES(avatar_url)`,
    [user_id, deviceFingerprintVal, name, bio || null, avatar_url || null]
  );

  await Promise.all([
    clearCache(`user_profile:${user_id}`),
    clearCache(`user_profiles:${user_id}`)
  ]);

  return sendSuccess(res, { message: 'Profile updated successfully' });
});
