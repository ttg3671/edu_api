import { Queue } from 'bullmq';
import redisClient from '../config/redis.js';

// This queue will hold your Stripe webhook tasks
export const webhookQueue = new Queue('stripe-webhooks', {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 }
  }
});

import logger from './logger.js';
import {
  getEmailDedupKey,
  checkGlobalEmailRateLimit,
  incrementGlobalEmailCount,
  recordEmailQueued,
  recordEmailDeduplicated,
  maskEmail
} from '../services/emailSecurity.service.js';

// This queue will hold your background email tasks
export const emailQueue = new Queue('email-tasks', {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 }
  }
});

/**
 * Helper to enqueue an email task with deduplication, global rate protection, and delivery monitoring
 * @param {Object} emailData - { to, subject, html, text, from }
 * @param {Object} [options] - Optional BullMQ job options
 * @param {string} [options.action] - Action identifier (e.g. 'otp', 'verification', 'welcome')
 * @param {number} [options.dedupWindowSeconds=300] - Deduplication window for job IDs
 * @returns {Promise<Job>}
 */
export const enqueueEmail = async (emailData, options = {}) => {
  const { to, subject } = emailData;
  const action = options.action || 'general';
  const dedupWindow = options.dedupWindowSeconds || 300;

  // 1. Generate deterministic Job ID for BullMQ deduplication
  const jobId = options.jobId || getEmailDedupKey(to, action, dedupWindow);

  // 2. Check if identical job is already queued/running in BullMQ
  try {
    const existingJob = await emailQueue.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (['waiting', 'active', 'delayed'].includes(state)) {
        logger.info(`[BULLMQ_DEDUP] Duplicate job suppressed for ${maskEmail(to)} [Job ID: ${jobId}, State: ${state}]`);
        await recordEmailDeduplicated({ to, action, subject });
        return existingJob;
      }
    }
  } catch (err) {
    logger.debug(`Existing job check bypassed for ${jobId}: ${err.message}`);
  }

  // 3. Global Email Rate Limiting: Calculate delay if approaching limit
  let calculatedDelay = options.delay || 0;
  try {
    const globalRate = await checkGlobalEmailRateLimit();
    if (!globalRate.allowed && globalRate.delaySeconds > 0) {
      logger.warn(`[GLOBAL_RATE_LIMIT] Global email limit reached (${globalRate.currentMinute}/${globalRate.minuteLimit} per min). Delaying email to ${maskEmail(to)} by ${globalRate.delaySeconds}s`);
      calculatedDelay = Math.max(calculatedDelay, globalRate.delaySeconds * 1000);
    }
  } catch (err) {
    logger.error('Error checking global rate limit before enqueue:', err);
  }

  // 4. Enqueue the email job in BullMQ
  const jobOptions = {
    jobId,
    ...options,
    ...(calculatedDelay > 0 ? { delay: calculatedDelay } : {})
  };

  const job = await emailQueue.add(
    'send-email',
    {
      ...emailData,
      action
    },
    jobOptions
  );

  // 5. Track global counts and record in safe delivery monitoring
  await incrementGlobalEmailCount();
  await recordEmailQueued({
    jobId: job.id,
    to,
    action,
    subject
  });

  return job;
};

