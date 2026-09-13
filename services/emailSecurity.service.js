import dns from 'node:dns';
import crypto from 'node:crypto';
import redisClient from '../config/redis.js';
import logger from '../libs/logger.js';
import {
  GLOBAL_EMAIL_RATE_LIMIT_PER_MINUTE,
  GLOBAL_EMAIL_RATE_LIMIT_PER_HOUR,
  NODE_ENV
} from '../config/env.js';

// Configuration defaults
const DEFAULT_GLOBAL_PER_MINUTE = Number(GLOBAL_EMAIL_RATE_LIMIT_PER_MINUTE) || 120;
const DEFAULT_GLOBAL_PER_HOUR = Number(GLOBAL_EMAIL_RATE_LIMIT_PER_HOUR) || 2500;
const DNS_CACHE_TTL_SECONDS = 86400; // 24 hours
const MAX_AUDIT_LOG_ENTRIES = 500;

// Legitimate privacy relay and temporary forwarding domains
// Users should never be blocked for utilizing these privacy protection services
export const KNOWN_PRIVACY_RELAYS = new Set([
  'privaterelay.appleid.com',
  'duck.com',
  'mozmail.com',
  'simplelogin.com',
  'simplelogin.co',
  'simplelogin.io',
  'aleeas.com',
  'passmail.net',
  'passfwd.com',
  'passinbox.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'anonaddy.me',
  'relay.firefox.com',
  'fastmail.com'
]);

// In-memory DNS cache fallback if Redis is unavailable
const memoryDnsCache = new Map();

/**
 * Masks an email address for privacy-safe logging and delivery monitoring
 * e.g., 'john.doe@example.com' -> 'j***e@example.com'
 * @param {string} email
 * @returns {string}
 */
export const maskEmail = (email) => {
  if (!email || typeof email !== 'string') return 'unknown';
  const parts = email.trim().toLowerCase().split('@');
  if (parts.length !== 2) return 'invalid-email';
  const [local, domain] = parts;
  if (local.length <= 2) {
    return `${local[0] || '*'}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
};

/**
 * Validates email format according to RFC 5322 regex
 * @param {string} email
 * @returns {boolean}
 */
export const isValidEmailFormat = (email) => {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 254) return false;

  // RFC 5322 compliant email regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(trimmed);
};

/**
 * Checks DNS MX records for domain to confirm email deliverability.
 * Legit temporary emails and privacy relays are fully allowed as long as
 * their domain has valid mail exchange records.
 * @param {string} domain
 * @returns {Promise<boolean>}
 */
export const verifyDomainMxRecords = async (domain) => {
  if (!domain || typeof domain !== 'string') return false;
  const cleanDomain = domain.trim().toLowerCase();

  // 1. Bypass check for development, test, and localhost environments
  if (
    NODE_ENV === 'test' ||
    cleanDomain === 'localhost' ||
    cleanDomain.endsWith('.local') ||
    cleanDomain.endsWith('.test') ||
    cleanDomain.endsWith('.example') ||
    cleanDomain === 'example.com'
  ) {
    return true;
  }

  // 2. Known privacy relays are always permitted
  if (KNOWN_PRIVACY_RELAYS.has(cleanDomain)) {
    return true;
  }

  // 3. Check Redis cache first
  const cacheKey = `dns:mx:${cleanDomain}`;
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached !== null) {
      return cached === '1';
    }
  } catch (err) {
    // Fallback to memory cache
    const mem = memoryDnsCache.get(cleanDomain);
    if (mem && mem.expires > Date.now()) {
      return mem.valid;
    }
  }

  // 4. Perform actual DNS lookup
  let isValid = false;
  try {
    const mxRecords = await dns.promises.resolveMx(cleanDomain);
    if (Array.isArray(mxRecords) && mxRecords.length > 0) {
      isValid = true;
    }
  } catch (mxError) {
    // Some domains handle mail via A / AAAA fallback
    if (mxError.code === 'ENODATA' || mxError.code === 'ENOTFOUND') {
      try {
        const aRecords = await dns.promises.resolve4(cleanDomain);
        if (Array.isArray(aRecords) && aRecords.length > 0) {
          isValid = true;
        }
      } catch {
        isValid = false;
      }
    } else {
      // Temporary DNS resolution error, do not permanently block legitimate users
      logger.warn(`DNS lookup warning for domain ${cleanDomain}: ${mxError.message}`);
      isValid = true; // Fail open on transient DNS lookup failures
    }
  }

  // 5. Store in Redis and in-memory cache
  try {
    await redisClient.setex(cacheKey, DNS_CACHE_TTL_SECONDS, isValid ? '1' : '0');
  } catch {
    memoryDnsCache.set(cleanDomain, {
      valid: isValid,
      expires: Date.now() + DNS_CACHE_TTL_SECONDS * 1000
    });
  }

  return isValid;
};

/**
 * Complete email validation: validates format, domain, and ensures
 * legitimate temporary emails are allowed while blocking unresolvable domains.
 * @param {string} email
 * @returns {Promise<{isValid: boolean, error?: string, domain?: string, isTemporaryOrRelay?: boolean}>}
 */
export const validateEmailAddress = async (email) => {
  if (!email || typeof email !== 'string' || !email.trim()) {
    return { isValid: false, error: 'Email address is required' };
  }

  const normalized = email.trim().toLowerCase();

  if (!isValidEmailFormat(normalized)) {
    return { isValid: false, error: 'Invalid email address format' };
  }

  const parts = normalized.split('@');
  const domain = parts[1];

  const isTemporaryOrRelay = KNOWN_PRIVACY_RELAYS.has(domain);

  // Check if domain can accept emails
  const hasMx = await verifyDomainMxRecords(domain);
  if (!hasMx) {
    return {
      isValid: false,
      error: `The email domain '@${domain}' does not accept emails or does not exist.`,
      domain
    };
  }

  return {
    isValid: true,
    domain,
    isTemporaryOrRelay
  };
};

/**
 * Classifies whether an SMTP failure or delivery error is permanent
 * Permanent failures should NEVER be retried in BullMQ.
 * @param {Error|string|Object} error
 * @returns {boolean}
 */
export const isPermanentFailure = (error) => {
  if (!error) return false;

  const msg = typeof error === 'string' ? error : (error.message || String(error));
  const responseCode = error.responseCode || error.code || error.status;

  // 1. Transient network/connection errors are NEVER permanent (must be retried)
  const transientPatterns = [
    /ECONNREFUSED/i,
    /ETIMEDOUT/i,
    /EHOSTUNREACH/i,
    /ENETUNREACH/i,
    /ECONNRESET/i,
    /socket\s+hang\s+up/i,
    /network\s+socket\s+timeout/i,
    /connection\s+timed\s+out/i,
    /try\s+again\s+later/i,
    /too\s+many\s+connections/i
  ];
  if (transientPatterns.some((regex) => regex.test(msg))) {
    return false;
  }

  // 2. SMTP 4xx codes are transient (RFC 5321)
  if (typeof responseCode === 'number' && responseCode >= 400 && responseCode < 500) {
    return false;
  }

  // 3. SMTP 5xx codes are permanent errors (RFC 5321)
  if (typeof responseCode === 'number' && responseCode >= 500 && responseCode < 600) {
    return true;
  }

  // 4. Enhanced status codes 5.X.X (RFC 3463)
  if (/5\.[0-9]\.[0-9]/.test(msg)) {
    return true;
  }

  // 5. Common permanent bounce and recipient rejection patterns
  // Note: Match SMTP codes 500-559 specifically to avoid collision with port numbers (e.g. 587)
  const permanentPatterns = [
    /(?:^|[^\d])5[0-5]\d(?:[^\d]|$)/,     // SMTP status codes 500-559
    /user\s+(?:unknown|does\s+not\s+exist|not\s+found)/i,
    /mailbox\s+(?:unavailable|not\s+found|does\s+not\s+exist)/i,
    /no\s+such\s+user/i,
    /recipient\s+(?:address\s+)?rejected/i,
    /address\s+rejected/i,
    /invalid\s+(?:recipient|mailbox|address)/i,
    /domain\s+(?:not\s+found|does\s+not\s+exist)/i,
    /no\s+mx\s+records/i,
    /unresolvable\s+domain/i,
    /relay\s+access\s+denied/i,
    /syntax\s+error\s+in/i,
    /account\s+(?:has\s+been\s+)?disabled/i,
    /storage\s+allocation\s+exceeded/i,
    /unrecoverable/i,
    /undeliverable/i
  ];

  return permanentPatterns.some((regex) => regex.test(msg));
};

/**
 * Generates deterministic deduplication key for email jobs
 * @param {string} to
 * @param {string} actionOrSubject
 * @param {number} [windowSeconds=300] - Deduplication time-window
 * @returns {string}
 */
export const getEmailDedupKey = (to, actionOrSubject, windowSeconds = 300) => {
  const normalizedTo = (to || '').trim().toLowerCase();
  const normalizedAction = (actionOrSubject || 'general').trim().toLowerCase();
  
  // Create bucket based on windowSeconds
  const timeBucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const hash = crypto
    .createHash('sha256')
    .update(`${normalizedTo}:${normalizedAction}:${timeBucket}`)
    .digest('hex')
    .substring(0, 24);

  return `email_dedup_${hash}`;
};

/**
 * Attempts to acquire an atomic Redis deduplication lock
 * Prevents identical emails from being enqueued or sent concurrently
 * @param {string} to
 * @param {string} action
 * @param {number} [ttlSeconds=30]
 * @returns {Promise<boolean>} - True if acquired, false if duplicate
 */
export const acquireEmailDedupLock = async (to, action, ttlSeconds = 30) => {
  const key = `email:lock:${getEmailDedupKey(to, action, ttlSeconds)}`;
  try {
    const result = await redisClient.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  } catch (err) {
    logger.error('Redis dedup lock error:', err);
    return true; // Fail open so emails aren't lost if Redis errors
  }
};

/**
 * Releases deduplication lock manually if an error occurs
 * @param {string} to
 * @param {string} action
 * @param {number} [ttlSeconds=30]
 */
export const releaseEmailDedupLock = async (to, action, ttlSeconds = 30) => {
  const key = `email:lock:${getEmailDedupKey(to, action, ttlSeconds)}`;
  try {
    await redisClient.del(key);
  } catch (err) {
    logger.error('Failed to release dedup lock:', err);
  }
};

/**
 * Checks global email sending rate limits across the entire platform
 * Prevents sending spikes that degrade SMTP reputation.
 * @returns {Promise<{allowed: boolean, delaySeconds: number, currentMinute: number, minuteLimit: number, currentHour: number, hourLimit: number}>}
 */
export const checkGlobalEmailRateLimit = async () => {
  const now = Math.floor(Date.now() / 1000);
  const currentMinuteBucket = Math.floor(now / 60);
  const currentHourBucket = Math.floor(now / 3600);

  const minuteKey = `email:global:rate:min:${currentMinuteBucket}`;
  const hourKey = `email:global:rate:hour:${currentHourBucket}`;

  try {
    const [minuteCountRaw, hourCountRaw] = await Promise.all([
      redisClient.get(minuteKey),
      redisClient.get(hourKey)
    ]);

    const currentMinute = Number(minuteCountRaw) || 0;
    const currentHour = Number(hourCountRaw) || 0;

    if (currentMinute >= DEFAULT_GLOBAL_PER_MINUTE) {
      // Calculate delay in seconds to next minute
      const delaySeconds = 60 - (now % 60) + 1;
      return {
        allowed: false,
        delaySeconds,
        currentMinute,
        minuteLimit: DEFAULT_GLOBAL_PER_MINUTE,
        currentHour,
        hourLimit: DEFAULT_GLOBAL_PER_HOUR
      };
    }

    if (currentHour >= DEFAULT_GLOBAL_PER_HOUR) {
      const delaySeconds = 3600 - (now % 3600) + 5;
      return {
        allowed: false,
        delaySeconds,
        currentMinute,
        minuteLimit: DEFAULT_GLOBAL_PER_MINUTE,
        currentHour,
        hourLimit: DEFAULT_GLOBAL_PER_HOUR
      };
    }

    return {
      allowed: true,
      delaySeconds: 0,
      currentMinute,
      minuteLimit: DEFAULT_GLOBAL_PER_MINUTE,
      currentHour,
      hourLimit: DEFAULT_GLOBAL_PER_HOUR
    };
  } catch (err) {
    logger.error('Failed to check global email rate limit:', err);
    return {
      allowed: true,
      delaySeconds: 0,
      currentMinute: 0,
      minuteLimit: DEFAULT_GLOBAL_PER_MINUTE,
      currentHour: 0,
      hourLimit: DEFAULT_GLOBAL_PER_HOUR
    };
  }
};

/**
 * Atomically increments global email counters
 */
export const incrementGlobalEmailCount = async () => {
  const now = Math.floor(Date.now() / 1000);
  const currentMinuteBucket = Math.floor(now / 60);
  const currentHourBucket = Math.floor(now / 3600);

  const minuteKey = `email:global:rate:min:${currentMinuteBucket}`;
  const hourKey = `email:global:rate:hour:${currentHourBucket}`;

  try {
    const pipeline = redisClient.pipeline();
    pipeline.incr(minuteKey);
    pipeline.expire(minuteKey, 120);
    pipeline.incr(hourKey);
    pipeline.expire(hourKey, 7200);
    await pipeline.exec();
  } catch (err) {
    logger.error('Failed to increment global email count:', err);
  }
};

// ==========================================
// SAFE DELIVERY MONITORING & AUDIT METRICS
// ==========================================

/**
 * Records an email queued event in monitoring metrics
 */
export const recordEmailQueued = async ({ jobId, to, action, subject }) => {
  const today = new Date().toISOString().split('T')[0];
  const masked = maskEmail(to);

  try {
    const pipeline = redisClient.pipeline();
    pipeline.incr('emails:stats:total_queued');
    pipeline.incr(`emails:stats:daily:${today}:queued`);

    const auditEntry = JSON.stringify({
      id: jobId || `job_${Date.now()}`,
      to: masked,
      action: action || 'unknown',
      subject: subject || '',
      status: 'queued',
      timestamp: new Date().toISOString()
    });

    pipeline.lpush('emails:audit:log', auditEntry);
    pipeline.ltrim('emails:audit:log', 0, MAX_AUDIT_LOG_ENTRIES - 1);
    await pipeline.exec();
  } catch (err) {
    logger.error('Failed to record queued email in monitoring:', err);
  }
};

/**
 * Records a successful email delivery event
 */
export const recordEmailDelivered = async ({ messageId, to, action, subject, durationMs = 0 }) => {
  const today = new Date().toISOString().split('T')[0];
  const masked = maskEmail(to);

  try {
    const pipeline = redisClient.pipeline();
    pipeline.incr('emails:stats:total_sent');
    pipeline.incr(`emails:stats:daily:${today}:sent`);

    const auditEntry = JSON.stringify({
      id: messageId || `msg_${Date.now()}`,
      to: masked,
      action: action || 'sent',
      subject: subject || '',
      status: 'sent',
      durationMs,
      timestamp: new Date().toISOString()
    });

    pipeline.lpush('emails:audit:log', auditEntry);
    pipeline.ltrim('emails:audit:log', 0, MAX_AUDIT_LOG_ENTRIES - 1);
    await pipeline.exec();
  } catch (err) {
    logger.error('Failed to record delivered email in monitoring:', err);
  }
};

/**
 * Records an email failure in monitoring metrics
 */
export const recordEmailFailed = async ({ error, to, action, subject, isPermanent = false, attempt = 1 }) => {
  const today = new Date().toISOString().split('T')[0];
  const masked = maskEmail(to);
  const errMsg = typeof error === 'string' ? error : (error?.message || 'Unknown error');

  try {
    const pipeline = redisClient.pipeline();
    if (isPermanent) {
      pipeline.incr('emails:stats:total_failed_permanent');
      pipeline.incr(`emails:stats:daily:${today}:failed_permanent`);
    } else {
      pipeline.incr('emails:stats:total_failed_transient');
      pipeline.incr(`emails:stats:daily:${today}:failed_transient`);
    }

    const auditEntry = JSON.stringify({
      id: `err_${Date.now()}`,
      to: masked,
      action: action || 'failed',
      subject: subject || '',
      status: isPermanent ? 'permanent_failure' : 'transient_failure',
      isPermanent,
      attempt,
      error: errMsg,
      timestamp: new Date().toISOString()
    });

    pipeline.lpush('emails:audit:log', auditEntry);
    pipeline.ltrim('emails:audit:log', 0, MAX_AUDIT_LOG_ENTRIES - 1);
    await pipeline.exec();
  } catch (err) {
    logger.error('Failed to record email failure in monitoring:', err);
  }
};

/**
 * Records a deduplicated email suppression event
 */
export const recordEmailDeduplicated = async ({ to, action, subject }) => {
  const masked = maskEmail(to);
  try {
    const pipeline = redisClient.pipeline();
    pipeline.incr('emails:stats:total_deduplicated');

    const auditEntry = JSON.stringify({
      id: `dedup_${Date.now()}`,
      to: masked,
      action: action || 'deduplicated',
      subject: subject || '',
      status: 'deduplicated',
      timestamp: new Date().toISOString()
    });

    pipeline.lpush('emails:audit:log', auditEntry);
    pipeline.ltrim('emails:audit:log', 0, MAX_AUDIT_LOG_ENTRIES - 1);
    await pipeline.exec();
  } catch (err) {
    logger.error('Failed to record deduplicated email in monitoring:', err);
  }
};

/**
 * Fetches real-time delivery monitoring statistics and health assessment
 * @returns {Promise<Object>}
 */
export const getDeliveryStats = async () => {
  const today = new Date().toISOString().split('T')[0];

  try {
    const [
      totalSent,
      totalQueued,
      totalPermanentFailed,
      totalTransientFailed,
      totalDeduplicated,
      todaySent,
      todayPermanentFailed,
      todayTransientFailed,
      recentLogsRaw
    ] = await Promise.all([
      redisClient.get('emails:stats:total_sent'),
      redisClient.get('emails:stats:total_queued'),
      redisClient.get('emails:stats:total_failed_permanent'),
      redisClient.get('emails:stats:total_failed_transient'),
      redisClient.get('emails:stats:total_deduplicated'),
      redisClient.get(`emails:stats:daily:${today}:sent`),
      redisClient.get(`emails:stats:daily:${today}:failed_permanent`),
      redisClient.get(`emails:stats:daily:${today}:failed_transient`),
      redisClient.lrange('emails:audit:log', 0, 49) // last 50 entries
    ]);

    const sent = Number(totalSent) || 0;
    const queued = Number(totalQueued) || 0;
    const failedPerm = Number(totalPermanentFailed) || 0;
    const failedTrans = Number(totalTransientFailed) || 0;
    const deduped = Number(totalDeduplicated) || 0;

    const totalProcessed = sent + failedPerm;
    const bounceRatePercent = totalProcessed > 0
      ? ((failedPerm / totalProcessed) * 100).toFixed(2)
      : '0.00';

    // Safe delivery health status
    let healthStatus = 'HEALTHY';
    if (Number(bounceRatePercent) > 5 && totalProcessed >= 20) {
      healthStatus = 'WARNING_HIGH_BOUNCE_RATE';
    } else if (Number(bounceRatePercent) > 10 && totalProcessed >= 20) {
      healthStatus = 'CRITICAL_HIGH_BOUNCE_RATE';
    }

    const recentAuditLogs = (recentLogsRaw || []).map((raw) => {
      try {
        return JSON.parse(raw);
      } catch {
        return { raw };
      }
    });

    return {
      healthStatus,
      bounceRatePercent: Number(bounceRatePercent),
      totals: {
        sent,
        queued,
        failedPermanent: failedPerm,
        failedTransient: failedTrans,
        deduplicated: deduped
      },
      today: {
        date: today,
        sent: Number(todaySent) || 0,
        failedPermanent: Number(todayPermanentFailed) || 0,
        failedTransient: Number(todayTransientFailed) || 0
      },
      recentLogs: recentAuditLogs
    };
  } catch (err) {
    logger.error('Failed to get email delivery stats:', err);
    return {
      healthStatus: 'UNKNOWN',
      error: err.message
    };
  }
};

export default {
  validateEmailAddress,
  isValidEmailFormat,
  verifyDomainMxRecords,
  isPermanentFailure,
  getEmailDedupKey,
  acquireEmailDedupLock,
  releaseEmailDedupLock,
  checkGlobalEmailRateLimit,
  incrementGlobalEmailCount,
  maskEmail,
  recordEmailQueued,
  recordEmailDelivered,
  recordEmailFailed,
  recordEmailDeduplicated,
  getDeliveryStats,
  KNOWN_PRIVACY_RELAYS
};
