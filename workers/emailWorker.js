import { Worker, UnrecoverableError } from 'bullmq';
import redisClient from '../config/redis.js';
import logger from '../libs/logger.js';
import { sendEmail } from '../services/service.js';
import {
  isPermanentFailure,
  isValidEmailFormat,
  recordEmailDelivered,
  recordEmailFailed,
  maskEmail
} from '../services/emailSecurity.service.js';

const emailWorker = new Worker('email-tasks', async (job) => {
  const { to, subject, html, text, from, action } = job.data;
  const masked = maskEmail(to);

  logger.info(`Processing email job [Job ID: ${job.id}] to: ${masked} (Subject: "${subject}", Action: "${action || 'general'}")`);

  // 1. Permanent Check: Recipient existence and RFC 5322 format
  if (!to || !isValidEmailFormat(to)) {
    const errorMsg = `Invalid or missing recipient email address: "${to}"`;
    await recordEmailFailed({
      error: errorMsg,
      to,
      action,
      subject,
      isPermanent: true,
      attempt: job.attemptsMade + 1
    });
    logger.error(`[PERMANENT_EMAIL_FAILURE] Job ${job.id} rejected: ${errorMsg}. Retries permanently stopped.`);
    throw new UnrecoverableError(errorMsg);
  }

  const startTime = Date.now();

  // 2. Dispatch email via SMTP service
  const result = await sendEmail({ to, subject, html, text, from });
  const durationMs = Date.now() - startTime;

  // 3. Handle delivery outcome
  if (!result.isSuccess) {
    const errorMsg = result.error || 'Failed to send email via SMTP';
    const isPermanent = isPermanentFailure(errorMsg);

    await recordEmailFailed({
      error: errorMsg,
      to,
      action,
      subject,
      isPermanent,
      attempt: job.attemptsMade + 1
    });

    if (isPermanent) {
      logger.error(`[PERMANENT_EMAIL_FAILURE] Job ${job.id} for ${masked} encountered permanent error: "${errorMsg}". Discarding retries.`);
      // BullMQ will NOT retry jobs that throw UnrecoverableError
      throw new UnrecoverableError(errorMsg);
    } else {
      logger.warn(`[TRANSIENT_EMAIL_FAILURE] Job ${job.id} for ${masked} encountered transient error: "${errorMsg}". Attempt ${job.attemptsMade + 1}. Retrying...`);
      throw new Error(errorMsg);
    }
  }

  // 4. Record successful delivery in monitoring
  await recordEmailDelivered({
    messageId: result.messageId,
    to,
    action,
    subject,
    durationMs
  });

  return result;
}, {
  connection: redisClient,
  concurrency: 5,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 }
});

emailWorker.on('completed', (job) => {
  logger.info(`Email job ${job.id} completed successfully for recipient ${maskEmail(job.data?.to)}`);
});

emailWorker.on('failed', (job, err) => {
  const isUnrecoverable = err instanceof UnrecoverableError || err.name === 'UnrecoverableError';
  logger.error(`Email job ${job.id} failed for recipient ${maskEmail(job.data?.to)} (Unrecoverable: ${isUnrecoverable}): ${err.message}`);
});

export default emailWorker;

