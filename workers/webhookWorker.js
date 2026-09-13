import { Worker } from 'bullmq';
import redisClient from '../config/redis.js';
import dbConnectionPromise from '../config/db.js';
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from '../config/env.js';
import logger from '../libs/logger.js';
import { clearCache } from '../utils/cache.js';
import socketIO from '../config/socket.js';

const stripe = new Stripe(STRIPE_SECRET_KEY);

const notifyUser = (userId, deviceId, event, data) => {
  try {
    // Use the new notify method which handles both direct emit and Redis broadcast
    if (userId) {
      socketIO.notify(`user_${userId}`, event, data);
      logger.info(`Socket notification sent to all devices of user ${userId}: ${event}`);
    } else if (deviceId) {
      socketIO.notify(`device_${deviceId}`, event, data);
      logger.info(`Socket notification sent to specific device ${deviceId}: ${event}`);
    }
  } catch (err) {
    logger.error(`Socket notification failed: ${err.message}`);
  }
};

const invalidateUserCache = async (userId) => {
  if (!userId) return;
    try {
      await Promise.all([
        clearCache(`user_profile:${userId}`),
        clearCache(`user_profiles:${userId}`),
        clearCache(`user_subscriptions_list:${userId}:*`),
        clearCache("cache:/api/v1/users/home*")
      ]);
       
      logger.info(`Invalidated profile and subscription caches for user: ${userId}`);
    } catch (err) {     
      logger.error(`Cache invalidation failed for user ${userId}: ${err.message}`);
    }
};

const getUserIdByStripeSubId = async (db, stripeSubId) => {
  const [[sub]] = await db.query(
    "SELECT user_id FROM user_subscriptions WHERE stripe_sub_id = ?",
    [stripeSubId]
  );
  return sub?.user_id;
};

const worker = new Worker('stripe-webhooks', async (job) => {
  const { event } = job.data;
  const db = await dbConnectionPromise;

  logger.info(`Processing Stripe event: ${event.type} [Job ID: ${job.id}]`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription') {
          const userId = session.metadata.user_id;
          const planId = session.metadata.plan_id;
          const stripeSubId = session.subscription;
          
          if (!userId || !planId || !stripeSubId) {
            logger.warn(`Missing metadata in checkout session: ${session.id}`);
            break;
          }

          const subscription = await stripe.subscriptions.retrieve(stripeSubId);
          let periodEnd = subscription.items?.data[0]?.current_period_end || null;
          
          await db.query(
            `INSERT INTO user_subscriptions 
            (user_id, plan_id, stripe_sub_id, status, current_period_end) 
            VALUES (?, ?, ?, ?, FROM_UNIXTIME(?))
            ON DUPLICATE KEY UPDATE 
            status = VALUES(status), 
            current_period_end = VALUES(current_period_end),
            plan_id = VALUES(plan_id)`,
            [userId, planId, stripeSubId, subscription.status, periodEnd]
          );

          logger.info(`Inserted/Updated subscription for user ${userId}`);
          await invalidateUserCache(userId);
          notifyUser(userId, session.metadata?.device_id, 'payment_success', {
            message: 'Your payment was successful!',
            status: subscription.status,
            plan_id: planId
          });
        }
        break;
      }

      case 'customer.subscription.created': {
        const subscription = event.data.object;
        let userId = subscription.metadata?.user_id;
        let planId = subscription.metadata?.plan_id;

        if (!userId && subscription.customer) {
          // Fallback to searching by email if possible, or stripe_customer_id if it exists
          const customer = await stripe.customers.retrieve(subscription.customer);
          const [[user]] = await db.query(
            "SELECT id FROM users WHERE email = ?",
            [customer.email]
          );
          if (user) userId = user.id;
        }

        if (!userId) {
          logger.warn(`customer.subscription.created: No userId found for subscription ${subscription.id}`);
          break;
        }

        if (!planId) {
          const stripePriceId = subscription.items.data[0].price.id;
          const [[plan]] = await db.query("SELECT id FROM plans WHERE stripe_price_id = ?", [stripePriceId]);
          planId = plan?.id;
        }

        await db.query(
          `INSERT INTO user_subscriptions 
          (user_id, plan_id, stripe_sub_id, status, current_period_end) 
          VALUES (?, ?, ?, ?, FROM_UNIXTIME(?))
          ON DUPLICATE KEY UPDATE 
          status = VALUES(status), 
          current_period_end = VALUES(current_period_end),
          plan_id = VALUES(plan_id)`,
          [userId, planId, subscription.id, subscription.status, subscription.items?.data[0]?.current_period_end || null]
        );

        logger.info(`Created subscription for user ${userId}`);
        await invalidateUserCache(userId);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        
        await db.query(
          `UPDATE user_subscriptions SET 
          status = ?, 
          current_period_end = FROM_UNIXTIME(?),
          cancel_at_period_end = ?
          WHERE stripe_sub_id = ?`,
          [
            subscription.status, 
            subscription.items?.data[0]?.current_period_end || null, 
            subscription.cancel_at_period_end ? 1 : 0,
            subscription.id
          ]
        );

        const userId = await getUserIdByStripeSubId(db, subscription.id);
        await invalidateUserCache(userId);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = await getUserIdByStripeSubId(db, subscription.id);
        
        await db.query(
          "UPDATE user_subscriptions SET status = 'canceled' WHERE stripe_sub_id = ?",
          [subscription.id]
        );
        
        await invalidateUserCache(userId);
        notifyUser(userId, subscription.metadata?.device_id, 'subscription_canceled', {
          message: 'Your subscription was canceled!',
           status: subscription.status
        });
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          
          await db.query(
            `UPDATE user_subscriptions SET 
            status = ?, 
            current_period_end = FROM_UNIXTIME(?) 
            WHERE stripe_sub_id = ?`,
            [subscription.status, subscription.items?.data[0]?.current_period_end || null, invoice.subscription]
          );
          
          const userId = await getUserIdByStripeSubId(db, invoice.subscription);
          await invalidateUserCache(userId);
          notifyUser(userId, subscription.metadata?.device_id, 'payment_success', {
            message: 'Your subscription payment was successful!',
            status: subscription.status
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          await db.query(
            "UPDATE user_subscriptions SET status = 'past_due' WHERE stripe_sub_id = ?",
            [invoice.subscription]
          );
          
          const userId = await getUserIdByStripeSubId(db, invoice.subscription);
          await invalidateUserCache(userId);

          // Retrieve subscription to get metadata (device_id)
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          
          notifyUser(userId, subscription.metadata?.device_id, 'payment_failed', {
            message: 'Your payment failed. Please update your payment method.',
            status: 'past_due'
          });
        }
        break;
      }
      
      default:
        logger.info(`Unhandled event type in worker: ${event.type}`);
    }
  } catch (error) {
    logger.error(`Error processing job ${job.id} (${event.type}):`, error);
    throw error;
  }
}, { 
  connection: redisClient,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 }
});

worker.on('completed', (job) => logger.info(`Stripe webhook job ${job.id} completed successfully`));
worker.on('failed', (job, err) => {
  logger.error(`Stripe webhook job ${job.id} failed: ${err.message}`);
});

export default worker;
