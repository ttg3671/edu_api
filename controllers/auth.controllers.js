import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ReasonCode } from "../utils/reasonCode.js";
import dbConnectionPromise from "../config/db.js";
import crypto from "crypto";
import {
  OTP_TOKEN_SECRET,
  OTP_EXPIRES_IN,
  STRIPE_SECRET_KEY,
  SHORT_TOKEN_SECRET,
  BASE_URL1,
} from "../config/env.js";
import logger from "../libs/logger.js";
import stripe from "stripe";
const stripeInstance = new stripe(STRIPE_SECRET_KEY);

import {
  handleValidationErrors,
  createError
} from "../utils/validationHelper.js";

import {
  asyncHandler,
  withTransaction,
  sendSuccess
} from '../utils/paginationHelper.js';

import { 
  generateTokens, 
  setTokenCookie, 
  generateNameFromEmail, 
  isReviewer,
  generateDeviceFingerprint,
  getDeviceTypeFromUserAgent,
  generateSpecificToken,
  isDateToday
} from '../utils/authHelper.js';
import redisClient from "../config/redis.js";
import { clearCache } from "../utils/cache.js";
import { sendOtpEmail, sendWelcomeEmail, sendVerificationEmail } from "./mail.controllers.js";

function generateSecureOTP() {
  const otp = crypto.randomInt(100000, 1000000); 
  return otp.toString();
}

/**
 * Core Auth Sync Logic (Used by login/register flows)
 */
const syncAuthBackend = async (req, res, emailInput, rawFingerprint, password, isRegistration = false) => {
  const email = (emailInput || "").toLowerCase();

  const deviceType = req.headers['x-device-type'];

  const type = ['android', 'ios', 'web'].includes(deviceType)
    ? deviceType
    : getDeviceTypeFromUserAgent(req.headers['user-agent']);
    
  const deviceFingerprint = generateDeviceFingerprint(rawFingerprint, req);

  logger.info("auth device", { device_id: rawFingerprint, device_fingerprint: deviceFingerprint });

  try {
    const result = await withTransaction(dbConnectionPromise, async (connection) => {
      
      // 1. Initial Check based on Email
      const [users] = await connection.execute("SELECT * FROM users WHERE email = ? LIMIT 1", [email]);
      
      if (isRegistration && users.length > 0) {
        return { error: "Account already exists. Please try again later.", status: 400 };
      }

      if (!isRegistration && users.length === 0) {
        return { error: "Account not found. Please sign-up first.", status: 404 };
      }

      let user;
      let userId;
      let stripeCustomerId = users.length > 0 ? users[0].stripe_customer_id : null;

      if (isRegistration) {
        // Handle Registration
        if (!password) {
          return { error: "Password is required for registration", status: 400 };
        }
        const hashedPassword = await bcrypt.hash(password, 10);

        try {
          const customers = await stripeInstance.customers.list({ email, limit: 1 });
          if (customers.data.length > 0) {
            stripeCustomerId = customers.data[0].id;
          } else {
            const customer = await stripeInstance.customers.create({
              email,
              name: generateNameFromEmail(email)
            });
            stripeCustomerId = customer.id;
          }
        } catch (stripeErr) {
          logger.error("Stripe customer operation failed", { error: stripeErr.message });
          return { error: `Payment setup failed: ${stripeErr.message}`, status: 400 };
        }

        const [insertResult] = await connection.execute(
          `INSERT INTO users (email, password, stripe_customer_id) VALUES (?, ?, ?)`,
          [email, hashedPassword, stripeCustomerId]
        );
        userId = insertResult.insertId;
        user = { id: userId, email, stripe_customer_id: stripeCustomerId };
      } else {
        // Handle Login
        user = users[0];
        userId = user.id;

        if (password) {
          const isMatch = await bcrypt.compare(password, user.password);
          if (!isMatch) {
            return { error: "Incorrect email or password. Please try again.", status: 401 };
          }
        }

        if (!stripeCustomerId) {
          try {
            const customers = await stripeInstance.customers.list({ email, limit: 1 });
            if (customers.data.length > 0) {
              stripeCustomerId = customers.data[0].id;
            } else {
              const customer = await stripeInstance.customers.create({
                email,
                name: generateNameFromEmail(email)
              });
              stripeCustomerId = customer.id;
            }
            await connection.execute("UPDATE users SET stripe_customer_id = ? WHERE id = ?", [stripeCustomerId, userId]);
          } catch (stripeErr) {
            logger.error("Stripe sync failed during login", { error: stripeErr.message });
          }
        }
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

        // If total devices exceed maxScreens, auto remove oldest web devices (do not delete if seen today)
        if (allDevices.length > maxScreens && webDevices.length > 0) {
          let hasDeletedWebDev = false;
          for (const webDev of webDevices) {
            if (isDateToday(webDev.seen_at)) {
              continue;
            }
            await connection.execute(
              "DELETE FROM user_devices WHERE user_id = ? AND device_fingerprint = ?",
              [userId, webDev.device_fingerprint]
            );
            await connection.execute(
              "DELETE FROM user_profiles WHERE user_id = ? AND device_fingerprint = ?",
              [userId, webDev.device_fingerprint]
            );
            hasDeletedWebDev = true;
          }
          if (hasDeletedWebDev) {
            await clearCache(`user_devices:${userId}`);
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

    // ONLY send welcome email during registration (signUp), NEVER during login (signIn)
    if (isRegistration) {
      sendWelcomeEmail(email, result.user?.profile_name).catch((err) => {
        logger.error("Welcome email delivery failed on registration", { email, error: err.message });
      });
    }

    // Send email verification link on new registration (10-minute expiry)
    // if (isRegistration && result.userId) {
    //   const verificationToken = generateSpecificToken(
    //     { id: result.userId, email, type },
    //     SHORT_TOKEN_SECRET,
    //     '1m'
    //   );
    //   sendVerificationEmail(email, verificationToken, type, result.user?.profile_name).catch((err) => {
    //     logger.error("Verification email delivery failed on registration", { email, error: err.message });
    //   });
    // }

    return res.status(200).json({
      isSuccess: true,
      message: ReasonCode[result.reasonCode || 1],
      data: result
    });

  } catch (error) {
    logger.error("Auth Sync Failed", { email, error: error.message });
    return res.status(500).json({
      isSuccess: false,
      message: "Opps! It seems to be a error. Please try again..."
    });
  }
};

export const signUp = asyncHandler(async (req, res) => {
  handleValidationErrors(req);
  const { email, password, device_id } = req.body;
  return await syncAuthBackend(req, res, email, device_id, password, true);
});

export const signIn = asyncHandler(async (req, res) => {
  handleValidationErrors(req);
  const { email, password, device_id } = req.body;
  return await syncAuthBackend(req, res, email, device_id, password, false);
});

export const sendOTP = asyncHandler(async (req, res) => {
  handleValidationErrors(req);
  const {email} = req.body;
  const db = await dbConnectionPromise;
  const [[user]] = await db.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
  if (!user) throw createError("User not found", 404);

  const otp = generateSecureOTP();
  const otpToken = jwt.sign({ id: user.id, number: otp }, OTP_TOKEN_SECRET, { expiresIn: OTP_EXPIRES_IN });

  // Send OTP via mail
  try {
    await sendOtpEmail(email, otp);
  } catch (mailErr) {
    logger.error("Failed to send OTP email", { email, error: mailErr.message });
  }

  return res.status(200).json({ isSuccess: true, token: otpToken });
});

export const signInAdmin = asyncHandler(async (req, res) => {
  handleValidationErrors(req);
  const email = req.body.email?.toLowerCase();
  const { password } = req.body;
  const db = await dbConnectionPromise;

  const [[admin]] = await db.query("SELECT id, password FROM admin WHERE email = ? LIMIT 1", [email]);
  if (!admin || !(await bcrypt.compare(password, admin.password))) {
    throw createError("Invalid email or password", 401);
  }

  const { accessToken, refreshToken } = generateTokens(admin.id, 'ADMIN');
  await db.query("UPDATE admin SET rem_token = ? WHERE id = ?", [refreshToken, admin.id]);
  setTokenCookie(res, refreshToken);

  return sendSuccess(res, { token: accessToken }, "successfully logged in");
});

/**
 * Controller to send or resend email verification link with a 10-minute token
 */
export const sendVerificationEmailController = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const deviceType = req.headers['x-device-type'];

  const type = ['android', 'ios', 'web'].includes(deviceType)
    ? deviceType
    : getDeviceTypeFromUserAgent(req.headers['user-agent']);

  const { email } = req.body;
  if (!email) {
    throw createError("Email address is required", 400);
  }

  const db = await dbConnectionPromise;
  const [[user]] = await db.query(
    "SELECT id, email_verified FROM users WHERE email = ? LIMIT 1",
    [email]
  );

  if (!user) {
    throw createError("User account not found", 404);
  }

  if (user.email_verified) {
    return sendSuccess(res, { email_verified: true }, "Email is already verified.");
  }

  const verificationToken = generateSpecificToken(
    { id: user.id, email, type },
    SHORT_TOKEN_SECRET,
    '10m'
  );

  const result = await sendVerificationEmail(
    email,
    verificationToken,
    type
  );

  if (!result.isSuccess) {
    throw createError("Failed to send verification email. Please try again later.", 500);
  }

  return sendSuccess(res, { message: "Verification email sent successfully." });
});

/**
 * Controller to verify email after verifyEmailMiddleware checks token expiration/validity
 */
export const verifyEmailController = asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  const type = req.user?.type;

  if (!userId) {
    throw createError("Unauthorized / User ID missing from token", 401);
  }

  const db = await dbConnectionPromise;

  const [[user]] = await db.query(
    "SELECT email, email_verified FROM users WHERE id = ? LIMIT 1",
    [userId]
  );

  if (!user) {
    throw createError("User account not found.", 404);
  }

  if (user.email_verified) {
    return res.redirect(
      `${BASE_URL1}/email-verified?status=success`
    );
  }

  await db.query(
    "UPDATE users SET email_verified = 1 WHERE id = ?",
    [userId]
  );

  await Promise.all([
    clearCache(`user_profile:${userId}`),
    clearCache(`user_profiles:${userId}`)
  ]);

    return res.redirect(
      `${BASE_URL1}/email-verified?status=success`
    );
});