import crypto from 'node:crypto';
import axios from 'axios';
import redisClient from '../config/redis.js';
import logger from '../libs/logger.js';
import {
  NODE_ENV,
  CAPTCHA_SECRET_KEY,
  CAPTCHA_PROVIDER
} from '../config/env.js';

// Configuration thresholds
const MAX_IP_STRIKES = 5;
const SUSPICIOUS_IP_STRIKES_THRESHOLD = 2;
const IP_STRIKE_WINDOW_SECONDS = 900; // 15 minutes
const IP_BLOCK_DURATION_SECONDS = 1800; // 30 minutes
const MAX_TARGETED_EMAILS_PER_IP = 8; // Spraying threshold
const MAX_SOURCE_IPS_PER_EMAIL = 5; // Account bombing threshold
const SPRAY_WINDOW_SECONDS = 600; // 10 minutes
const MAX_ABUSE_LOGS = 200;

/**
 * Normalizes client IP address, stripping IPv6 prefix if mapped IPv4
 * @param {string} rawIp
 * @returns {string}
 */
export const normalizeIp = (rawIp) => {
  if (!rawIp || typeof rawIp !== 'string') return '127.0.0.1';
  let ip = rawIp.trim();
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  return ip;
};

/**
 * Hashes email for privacy-safe Redis keys and logs
 * @param {string} email
 * @returns {string}
 */
export const hashEmail = (email) => {
  if (!email || typeof email !== 'string') return 'unknown';
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex').substring(0, 16);
};

/**
 * Checks if an IP is temporarily blocked due to repeated abuse
 * @param {string} ip
 * @returns {Promise<{blocked: boolean, remainingSeconds: number}>}
 */
export const isIpBlocked = async (ip) => {
  const cleanIp = normalizeIp(ip);
  const blockKey = `abuse:blocked:ip:${cleanIp}`;

  try {
    const isBlocked = await redisClient.get(blockKey);
    if (isBlocked) {
      const ttl = await redisClient.ttl(blockKey);
      return { blocked: true, remainingSeconds: Math.max(ttl, 1) };
    }
  } catch (err) {
    logger.error('Error checking IP block status:', err);
  }

  return { blocked: false, remainingSeconds: 0 };
};

/**
 * Records an abuse strike against an IP and automatically blocks it if strikes exceed limit
 * @param {string} ip
 * @param {string} [email]
 * @param {string} [reason='policy_violation']
 * @returns {Promise<{strikes: number, isBlocked: boolean, remainingSeconds: number}>}
 */
export const recordStrike = async (ip, email, reason = 'policy_violation') => {
  const cleanIp = normalizeIp(ip);
  const strikesKey = `abuse:strikes:ip:${cleanIp}`;
  const blockKey = `abuse:blocked:ip:${cleanIp}`;

  try {
    const strikes = await redisClient.incr(strikesKey);
    if (strikes === 1) {
      await redisClient.expire(strikesKey, IP_STRIKE_WINDOW_SECONDS);
    }

    if (strikes >= MAX_IP_STRIKES) {
      await redisClient.setex(blockKey, IP_BLOCK_DURATION_SECONDS, '1');
      await redisClient.del(strikesKey);

      logger.warn(`[SECURITY_ABUSE_BLOCKED] IP ${cleanIp} blocked for ${IP_BLOCK_DURATION_SECONDS}s. Reason: ${reason}`);

      // Record incident in audit log
      const incident = JSON.stringify({
        ip: cleanIp,
        emailHash: email ? hashEmail(email) : null,
        reason,
        timestamp: new Date().toISOString(),
        action: 'IP_BLOCKED',
        durationSeconds: IP_BLOCK_DURATION_SECONDS
      });

      await redisClient.lpush('abuse:incidents:log', incident);
      await redisClient.ltrim('abuse:incidents:log', 0, MAX_ABUSE_LOGS - 1);

      return { strikes, isBlocked: true, remainingSeconds: IP_BLOCK_DURATION_SECONDS };
    }

    return { strikes, isBlocked: false, remainingSeconds: 0 };
  } catch (err) {
    logger.error('Error recording abuse strike:', err);
    return { strikes: 1, isBlocked: false, remainingSeconds: 0 };
  }
};

/**
 * Tracks email targeting to detect email spraying across multiple accounts
 * @param {string} ip
 * @param {string} email
 * @returns {Promise<{isSpraying: boolean, targetCount: number}>}
 */
export const trackEmailTargeting = async (ip, email) => {
  if (!email || typeof email !== 'string') return { isSpraying: false, targetCount: 0 };

  const cleanIp = normalizeIp(ip);
  const emailH = hashEmail(email);
  const ipTargetsKey = `abuse:ip_targets:${cleanIp}`;
  const emailSourcesKey = `abuse:email_sources:${emailH}`;

  try {
    const pipeline = redisClient.pipeline();
    pipeline.sadd(ipTargetsKey, emailH);
    pipeline.expire(ipTargetsKey, SPRAY_WINDOW_SECONDS);
    pipeline.scard(ipTargetsKey);

    pipeline.sadd(emailSourcesKey, cleanIp);
    pipeline.expire(emailSourcesKey, SPRAY_WINDOW_SECONDS);
    pipeline.scard(emailSourcesKey);

    const results = await pipeline.exec();
    const targetCount = results[2][1] || 1;
    const sourceCount = results[5][1] || 1;

    const isSpraying = targetCount > MAX_TARGETED_EMAILS_PER_IP;
    const isTargetedBombing = sourceCount > MAX_SOURCE_IPS_PER_EMAIL;

    if (isSpraying) {
      await recordStrike(cleanIp, email, 'email_spray_pattern');
    }

    return { isSpraying, isTargetedBombing, targetCount, sourceCount };
  } catch (err) {
    logger.error('Error tracking email targeting:', err);
    return { isSpraying: false, isTargetedBombing: false, targetCount: 0, sourceCount: 0 };
  }
};

/**
 * Checks if the current request indicates suspicious activity requiring a CAPTCHA challenge
 * @param {string} ip
 * @param {string} [email]
 * @returns {Promise<boolean>}
 */
export const isSuspiciousActivity = async (ip, email) => {
  const cleanIp = normalizeIp(ip);

  try {
    const strikesKey = `abuse:strikes:ip:${cleanIp}`;
    const strikesCount = Number(await redisClient.get(strikesKey)) || 0;

    if (strikesCount >= SUSPICIOUS_IP_STRIKES_THRESHOLD) {
      return true;
    }

    if (email) {
      const emailH = hashEmail(email);
      const emailSourcesKey = `abuse:email_sources:${emailH}`;
      const distinctIps = await redisClient.scard(emailSourcesKey);
      if (distinctIps >= 3) {
        return true;
      }
    }

    const ipTargetsKey = `abuse:ip_targets:${cleanIp}`;
    const distinctTargets = await redisClient.scard(ipTargetsKey);
    if (distinctTargets >= 4) {
      return true;
    }
  } catch (err) {
    logger.error('Error checking suspicious activity:', err);
  }

  return false;
};

/**
 * Clears or reduces suspicion strikes for an IP after verified legit activity or CAPTCHA solve
 * @param {string} ip
 */
export const clearSuspicion = async (ip) => {
  const cleanIp = normalizeIp(ip);
  try {
    await redisClient.del(`abuse:strikes:ip:${cleanIp}`);
  } catch (err) {
    logger.error('Failed to clear suspicion for IP:', err);
  }
};

/**
 * Verifies a CAPTCHA response token against Turnstile, Google reCAPTCHA, or hCaptcha
 * @param {string} token
 * @param {string} [clientIp]
 * @returns {Promise<{isValid: boolean, error?: string}>}
 */
export const verifyCaptchaToken = async (token, clientIp) => {
  // 1. Allow bypass for test environment or special testing token
  if (
    NODE_ENV === 'test' ||
    token === 'TEST_CAPTCHA_PASS' ||
    (!CAPTCHA_SECRET_KEY && NODE_ENV !== 'production')
  ) {
    return { isValid: true };
  }

  if (!token || typeof token !== 'string' || !token.trim()) {
    return { isValid: false, error: 'CAPTCHA token is required' };
  }

  if (!CAPTCHA_SECRET_KEY) {
    logger.warn('CAPTCHA_SECRET_KEY is not configured in environment. Allowing request in non-production.');
    return { isValid: true };
  }

  const provider = (CAPTCHA_PROVIDER || 'turnstile').toLowerCase();

  try {
    let verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    if (provider === 'recaptcha') {
      verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
    } else if (provider === 'hcaptcha') {
      verifyUrl = 'https://api.hcaptcha.com/siteverify';
    }

    const params = new URLSearchParams();
    params.append('secret', CAPTCHA_SECRET_KEY);
    params.append('response', token.trim());
    if (clientIp) {
      params.append('remoteip', normalizeIp(clientIp));
    }

    const response = await axios.post(verifyUrl, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 5000
    });

    const data = response.data;
    if (data && data.success === true) {
      return { isValid: true };
    }

    logger.warn(`CAPTCHA verification failed with provider ${provider}:`, data?.['error-codes'] || data);
    return {
      isValid: false,
      error: 'CAPTCHA verification failed. Please complete the challenge again.'
    };
  } catch (error) {
    logger.error(`Error connecting to CAPTCHA verification service (${provider}):`, error.message);
    // On unexpected network timeout to CAPTCHA provider, fail gracefully if configured
    return {
      isValid: false,
      error: 'Unable to verify CAPTCHA at this time. Please try again.'
    };
  }
};

export default {
  normalizeIp,
  hashEmail,
  isIpBlocked,
  recordStrike,
  trackEmailTargeting,
  isSuspiciousActivity,
  clearSuspicion,
  verifyCaptchaToken
};
