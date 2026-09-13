import dbConnectionPromise from "../config/db.js";
import bcrypt from "bcryptjs";
import logger from "../libs/logger.js";
import redisClient from "../config/redis.js";
import { clearCache } from "../utils/cache.js";
import { ReasonCode } from "../utils/reasonCode.js";

import {
  handleValidationErrors,
  createError
} from "../utils/validationHelper.js";

import {
  asyncHandler,
  withTransaction
} from '../utils/paginationHelper.js';

import { 
  generateTokens, 
  setTokenCookie, 
  generateDeviceFingerprint, 
  getDeviceTypeFromUserAgent, 
  isReviewer 
} from '../utils/authHelper.js';

// reset password
export const resetPassword = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { password, device_id } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    throw createError("Unauthorized / User ID missing", 401);
  }

  const type = getDeviceTypeFromUserAgent(req.headers['user-agent']);
  const deviceFingerprint = generateDeviceFingerprint(device_id, req);

  const db = await dbConnectionPromise;

  try {
    const result = await withTransaction(db, async (connection) => {
      const [[user]] = await connection.query(
        "SELECT id, email, email_verified FROM users WHERE id = ? LIMIT 1",
        [userId]
      );

      if (!user) {
        return { error: "Account not found. Please sign up or log in.", status: 404 };
      }

      const email = user.email;
      const hashedPassword = await bcrypt.hash(password, 10);

      const [updateResult] = await connection.query(
        "UPDATE users SET password = ? WHERE id = ?",
        [hashedPassword, userId]
      );

      if (updateResult.affectedRows === 0) {
        return { error: "Failed to update password. Try again...", status: 500 };
      }

      // Generate JWT tokens and set refresh token cookie
      const { accessToken, refreshToken } = generateTokens(userId, 'USER');
      setTokenCookie(res, refreshToken);

      // Check if device already exists for this user in user_devices
      const [[existingDevice]] = await connection.execute(
        "SELECT 1 FROM user_devices WHERE user_id = ? AND device_fingerprint = ? LIMIT 1",
        [userId, deviceFingerprint]
      );

      if (!existingDevice) {
        // Device does not exist for this user, insert new device
        await connection.execute(
          `INSERT INTO user_devices (user_id, device_fingerprint, device_type, rem_token, seen_at) 
           VALUES (?, ?, ?, ?, NOW())`,
          [userId, deviceFingerprint, type, refreshToken]
        );
      } else {
        // Device already exists for this user, update refresh token, device_type and seen_at
        await connection.execute(
          `UPDATE user_devices 
           SET rem_token = ?, device_type = ?, seen_at = NOW() 
           WHERE user_id = ? AND device_fingerprint = ?`,
          [refreshToken, type, userId, deviceFingerprint]
        );
      }

      await Promise.all([
        clearCache(`user_session:${userId}:${deviceFingerprint}`),
        clearCache(`user_devices:${userId}`),
        clearCache(`user_profile:${userId}`),
        clearCache(`user_profiles:${userId}`)
      ]);

      const [[existingProfile]] = await connection.execute(
        "SELECT 1 FROM user_profiles WHERE user_id = ? AND device_fingerprint = ? LIMIT 1",
        [userId, deviceFingerprint]
      );

      if (!existingProfile) {
        await connection.execute(
          `INSERT INTO user_profiles (user_id, device_fingerprint, name) 
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE name = name`,
          [userId, deviceFingerprint, 'Member']
        );
      }

      const isUserReviewer = isReviewer(email);
      let authReasonCode = null;

      const [subscriptions] = await connection.execute(
        `SELECT up.name as profile_name, up.bio as profile_bio, s.status, s.current_period_end, s.stripe_sub_id, 
          p.plan_name, p.monthly_price, p.max_screens, p.duration_value, p.duration_unit
          FROM user_subscriptions s
          JOIN plans p ON s.plan_id = p.id
          LEFT JOIN user_profiles up ON up.user_id = s.user_id AND up.device_fingerprint = ?
          WHERE s.user_id = ? 
          ORDER BY s.id DESC LIMIT 1`,
        [deviceFingerprint, userId]
      );

      const sub = subscriptions[0];
      const nowTime = new Date();
      const isValidStatus = sub && ['active', 'trialing'].includes(sub.status);
      const isNotExpired = sub && new Date(sub.current_period_end) > nowTime;
      const hasActiveSub = (isValidStatus && isNotExpired) || isUserReviewer;
      const maxScreens = sub?.max_screens || 1;

      // Fetch all devices for this user ordered by seen_at
      const [allDevices] = await connection.execute(
        "SELECT device_fingerprint, device_type, seen_at FROM user_devices WHERE user_id = ? ORDER BY seen_at ASC",
        [userId]
      );

      // Web devices do NOT count towards the device limit
      const nonWebDevices = allDevices.filter(d => d.device_type !== 'web');
      const currentDeviceCount = nonWebDevices.length;

      // If device limit exceeds, auto remove web devices according to seen_at
      if (hasActiveSub && !isUserReviewer) {
        const webDevices = allDevices.filter(d => d.device_type === 'web');

        if (allDevices.length > maxScreens && webDevices.length > 0) {
          for (const webDev of webDevices) {
            await connection.execute(
              "DELETE FROM user_devices WHERE user_id = ? AND device_fingerprint = ?",
              [userId, webDev.device_fingerprint]
            );
            await connection.execute(
              "DELETE FROM user_profiles WHERE user_id = ? AND device_fingerprint = ?",
              [userId, webDev.device_fingerprint]
            );
          }
        }

        if (currentDeviceCount > maxScreens) {
          authReasonCode = 2; // Device limit reached
        }
      }

      const userData = {
        email: email,
        email_verified: isUserReviewer ? true : Boolean(user?.email_verified),
        profile_name: sub?.profile_name || 'Member', 
        profile_bio: sub?.profile_bio || null,
        is_subscribed: hasActiveSub ? 1 : 0,
        is_reviewer: isUserReviewer ? 1 : 0,
        subscription_details: sub ? {
            sub_id: sub.stripe_sub_id,
            plan: sub.plan_name,
            plan_duration_value: sub.duration_value,
            plan_duration_type: sub.duration_unit,
            max_devices: (isValidStatus && isNotExpired) ? sub.max_screens : 1,
            expiry: sub.current_period_end,
            status: (isValidStatus && isNotExpired) ? sub.status : 'expired',
            amount: sub.monthly_price
        } : null
      };

      await redisClient.setex(`user_profile:${userId}`, 3600, JSON.stringify(userData));

      return {
        user: userData,
        accessToken,
        reasonCode: authReasonCode || 1
      };
    });

    if (result && result.error) {
      return res.status(result.status || 400).json({
        isSuccess: false,
        message: result.error,
        ...(result.reasonCode && { reasonCode: result.reasonCode })
      });
    }

    return res.status(200).json({
      isSuccess: true,
      message: ReasonCode[result.reasonCode || 1],
      data: result
    });

  } catch (error) {
    logger.error("Reset Password Failed", { userId, error: error.message });
    return res.status(500).json({
      isSuccess: false,
      message: "Internal server error during password reset."
    });
  }
});
