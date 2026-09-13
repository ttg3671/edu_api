import { getOrSetCache, clearCache } from "../utils/cache.js";
import redisClient from "../config/redis.js";
import Stripe from "stripe";
import jwt from "jsonwebtoken";
import dbConnectionPromise from "../config/db.js";
import {
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  BASE_URL1,
  WEB_TOKEN_SECRET,
  CHECKSUM_SECRET
} from "../config/env.js";

import {
  handleValidationErrors,
  createError
} from "../utils/validationHelper.js";

import {
  sendSuccess,
  asyncHandler,
  getCursorPaginationParams,
  getCursorResults,
  sendCursorPaginatedResponse
} from '../utils/paginationHelper.js';

import logger from "../libs/logger.js";
import { webhookQueue } from "../libs/queue.js";
import { 
  generateTokens, 
  setTokenCookie, 
  isReviewer, 
  generateDeviceFingerprint 
} from "../utils/authHelper.js";

const stripe = new Stripe(STRIPE_SECRET_KEY);

import crypto from 'crypto';

// Helper function to create a checksum
const generateChecksum = (dataString) => {
  return crypto
    .createHmac('sha256', CHECKSUM_SECRET) // Secret key known only to backend
    .update(dataString)
    .digest('hex');
};

// ========== HELPER FUNCTIONS ==========

async function getCustomerByUserId(user_id) {
  const db = await dbConnectionPromise;
  const [[user]] = await db.query(
    "SELECT email, stripe_customer_id FROM users WHERE id = ?",
    [user_id]
  );

  if (!user) {
    throw createError("Account not found. Please log in again.", 404);
  }

  // If user already has a stripe_customer_id, return it
  if (user.stripe_customer_id) {
    return user.stripe_customer_id;
  }

  // Otherwise, check Stripe by email to avoid duplicates
  const customers = await stripe.customers.list({ email: user.email, limit: 1 });
  
  let customerId;
  if (customers.data.length > 0) {
    customerId = customers.data[0].id;
  } else {
    // Create customer if not exists
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user_id.toString() }
    });
    customerId = customer.id;
  }

  // Save the customer ID to the users table
  await db.query(
    "UPDATE users SET stripe_customer_id = ? WHERE id = ?",
    [customerId, user_id]
  );
  
  return customerId;
}

// ========== CONTROLLERS ==========

export const get_token_verified = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { token } = req.body;
  if (!token) throw createError("Verification token is required. Please log in again.", 400);

  let verifiedUser;
  try {
    verifiedUser = jwt.verify(token, WEB_TOKEN_SECRET);
  } catch (err) {
    throw createError("Your session link has expired or is invalid. Please log in again.", 401);
  }

  if (!verifiedUser?.id) throw createError("Your session link has expired. Please log in again.", 401);

  const userId = verifiedUser?.id;
  const device_id = verifiedUser?.device_id;
  const device = verifiedUser?.device;
  const db = await dbConnectionPromise;
  const [[user]] = await db.query("SELECT id, email, email_verified FROM users WHERE id = ?", [userId]);
  if (!user) throw createError("Account not found. Please sign up or log in.", 404);

  const email = user.email;
  const isUserReviewer = isReviewer(email);

  const deviceFingerprint = generateDeviceFingerprint(device_id, req);

  const [subscriptions] = await db.execute(
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

  const { accessToken, refreshToken } = generateTokens(userId, 'USER');
  setTokenCookie(res, refreshToken);

  return sendSuccess(res, {
    user: userData,
    accessToken,
    reasonCode: 1,
    device_id,
    device
  });
});

export const get_subscription_plan = asyncHandler(async (req, res) => {
  const plans = await getOrSetCache("active_plans", async () => {
    const db = await dbConnectionPromise;
    const [rows] = await db.query("SELECT * FROM plans WHERE is_active = TRUE");
    return rows;
  }, 3600); // Cache for 1 hour
  return sendSuccess(res, { plans });
});

export const get_checkout_options = asyncHandler(async (req, res) => {
  handleValidationErrors(req);
  
  const { plan, device } = req.body; 
  const deviceId = generateDeviceFingerprint(req.body.device_id);
  
  // Create a strict data pattern string
  const rawData = `${req.user.id}:${plan}:${deviceId}:${device}`;
  const checksum = generateChecksum(rawData);

  // console.log(req.body, deviceId, req.user.id, checksum);

  return sendSuccess(res, {
    checksum // Send this to UI
  });
});

export const post_subscription = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { plan, device, checksum } = req.body; 
  const user_id = req.user.id;
  const deviceId = generateDeviceFingerprint(req.body.device_id);

  // console.log(req.body, user_id, deviceId);

  if (!checksum) {
    throw createError("We couldn't verify your checkout request. Please refresh the page and try again.", 400);
  }

  // 1. Re-create the checksum using the exact same pattern
  const rawData = `${user_id}:${plan}:${deviceId}:${device}`;
  const expectedChecksum = crypto
    .createHmac('sha256', CHECKSUM_SECRET)
    .update(rawData)
    .digest('hex');

  // 2. Safely compare checksums (handling timing attack protection & buffer length match)
  let isValid = false;
  try {
    const checksumBuf = Buffer.from(checksum, 'hex');
    const expectedBuf = Buffer.from(expectedChecksum, 'hex');
    if (checksumBuf.length === expectedBuf.length) {
      isValid = crypto.timingSafeEqual(checksumBuf, expectedBuf);
    }
  } catch (err) {
    isValid = false;
  }

  if (!isValid) {
    throw createError("Sorry we are unable to complete checkout. Please refresh the page and try again.", 403);
  }

  const db = await dbConnectionPromise;
  
  const [[planData]] = await db.query(
    "SELECT id, stripe_price_id FROM plans WHERE plan_name = ? AND is_active = 1", 
    [plan]
  );

  if (!planData) {
    throw createError("The selected subscription plan is currently unavailable. Please choose another plan.", 400);
  }

  // Verify device ownership
  // const deviceFp = device_id ? (/^[a-f0-9]{64}$/i.test(device_id) ? device_id : generateDeviceFingerprint(device_id)) : null;
  const [[deviceFound]] = await db.query(
    "SELECT 1 FROM user_devices WHERE user_id = ? AND device_fingerprint = ? LIMIT 1",
    [user_id, deviceId]
  );
  if (!deviceFound) {
    throw createError("Your device could not be verified. Please log in again to continue.", 403);
  }

  const customerId = await getCustomerByUserId(user_id);

  // Check if user already has an active subscription
  const [[existingSub]] = await db.query(
    "SELECT 1 FROM user_subscriptions WHERE user_id = ? AND status IN ('active', 'trialing')",
    [user_id]
  );

  if (existingSub) {
    throw createError("You already have an active subscription on your account.", 400);
  }

    // const success_url = device === 'app'
    //   ? `edugarciamovimiento://callback?screen=payment-success&session_id={CHECKOUT_SESSION_ID}`
    //   : `${BASE_URL1}/payment-success?session_id={CHECKOUT_SESSION_ID}`;

    // const cancel_url = device === 'app'
    //   ? `edugarciamovimiento://callback?screen=payment-canceled`
    //   : `${BASE_URL1}/payment-cancelled`;

  const success_url = `${BASE_URL1}/payment-success?session_id={CHECKOUT_SESSION_ID}`;
  const cancel_url = `${BASE_URL1}/payment-cancelled`;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    // payment_method_types: ["card", "sepa_debit"], 
    payment_method_types: ["card"], 
    customer: customerId,
    line_items: [{
      price: planData.stripe_price_id,
      quantity: 1
    }],
    metadata: {
      user_id: user_id.toString(),
      plan_id: planData.id.toString(),
      device_id: req.body.device_id
    },
    subscription_data: {
      metadata: {
        user_id: user_id.toString(),
        plan_id: planData.id.toString(),
        device_id: req.body.device_id
      }
    },
    success_url,
    cancel_url
  });

  return sendSuccess(res, { url: session.url });
});

export const get_subscription_status = asyncHandler(async (req, res) => {
  handleValidationErrors(req);
  const { session_id } = req.query;
  const user_id = req.user.id;
  const db = await dbConnectionPromise;

  // 1. Try to find it in our Database first
  let [[subscription]] = await db.query(
    `SELECT us.*, p.monthly_price, p.plan_name, p.duration_value, p.duration_unit, p.max_screens 
     FROM user_subscriptions us
     JOIN plans p ON us.plan_id = p.id
     WHERE us.user_id = ? ORDER BY us.id DESC LIMIT 1`,
    [user_id]
  );

  // 2. If NOT in DB, check Stripe Checkout Session directly
  if (!subscription) {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    // If Stripe says it's paid, but our DB is empty, the webhook is likely still processing
    if (session.payment_status === 'paid') {
      return sendSuccess(res, {
        isActive: true,
        sub_id: null,
        amount: null,
        status: 'processing', // Tell frontend to show "Setting up your account..."
        message: "We're finalizing your subscription. This will take a moment.",
        plan: "Loading...",
        expiry: null, 
        max_devices: 1
      });
    }
    throw createError("We couldn't find any subscription records for your account.", 404);
  }

  return sendSuccess(res, {
    isActive: ['active', 'trialing'].includes(subscription.status),
    sub_id: subscription?.stripe_subscription_id,
    status: subscription.status,
    plan: subscription.plan_name,
    amount: subscription.monthly_price,
    expiry: subscription.current_period_end,
    max_devices: subscription.max_screens
  });
});

export const get_user_subscriptions = asyncHandler(async (req, res) => {
  const user_id = req.user.id;
  const db = await dbConnectionPromise;

  // 1. Delete cancelled subscriptions older than 2 days for this user
  await db.query(
    `DELETE FROM user_subscriptions 
     WHERE user_id = ? 
       AND status IN ('canceled', 'cancelled') 
       AND updated_at < NOW() - INTERVAL 2 DAY`,
    [user_id]
  );

  // 2. Fetch active subscriptions first, followed by recent cancelled subscriptions (within 2 days)
  const [subscriptions] = await db.query(
    `SELECT us.stripe_sub_id, us.status, us.current_period_end, us.updated_at, 
      p.plan_name, p.monthly_price, p.duration_value, p.duration_unit, p.max_screens as max_devices
     FROM user_subscriptions us
     JOIN plans p ON us.plan_id = p.id
     WHERE us.user_id = ? ORDER BY us.id DESC`,
    [user_id]
  );

  return sendCursorPaginatedResponse(res, subscriptions, { nextCursor: null, hasMore: false });
});

export const cancel_subscription = asyncHandler(async (req, res) => {
  handleValidationErrors(req);
  const { subs_id } = req.body;
  const user_id = req.user.id;

  const db = await dbConnectionPromise;

  const [[subscription]] = await db.query(
    "SELECT 1 FROM user_subscriptions WHERE stripe_sub_id = ? AND user_id = ?",
    [subs_id, user_id]
  );

  if (!subscription) {
    throw createError("We couldn't find an active subscription to cancel.", 404);
  }

  // Delete immediately in Stripe
  await stripe.subscriptions.cancel(subs_id);

  await db.query(
    "UPDATE user_subscriptions SET status = 'canceled' WHERE stripe_sub_id = ?",
    [subs_id]
  );

  // Clear relevant caches
  await Promise.all([
    clearCache(`user_subscriptions_list:${user_id}:*`),
    clearCache(`user_profile:${user_id}`),
    clearCache(`user_profiles:${user_id}`)
  ]);

  return sendSuccess(res, { message: "Your subscription has been cancelled successfully." });
});

export const stripe_webhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Add job to BullMQ queue
    await webhookQueue.add(event.type, { event });

    res.json({ received: true });
  } catch (error) {
    logger.error(`Error adding webhook to queue (${event.type}): ${error.message}`);
    res.status(500).json({ error: 'Failed to enqueue webhook' });
  }
};

