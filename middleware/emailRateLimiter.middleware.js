import redisClient from '../config/redis.js';
import logger from '../libs/logger.js';
import {
  validateEmailAddress,
  acquireEmailDedupLock,
  releaseEmailDedupLock
} from '../services/emailSecurity.service.js';
import {
  normalizeIp,
  hashEmail,
  isIpBlocked,
  recordStrike,
  trackEmailTargeting,
  isSuspiciousActivity,
  clearSuspicion,
  verifyCaptchaToken
} from '../services/abuseDetection.service.js';

/**
 * Express middleware factory that creates bulletproof rate-limiting, cooldown,
 * anti-abuse, and CAPTCHA challenge protection for email-triggering endpoints.
 *
 * @param {Object} options
 * @param {string} options.action - Unique action name e.g. 'otp', 'verification', 'access_steps', 'welcome', 'signup'
 * @param {number} [options.ipLimit=10] - Maximum requests allowed per IP in the window
 * @param {number} [options.ipWindowSeconds=900] - IP rate limit window in seconds (default: 15 mins)
 * @param {number} [options.cooldownSeconds=60] - Mandatory cooldown between consecutive emails to same address
 * @param {number} [options.emailLimit=5] - Maximum requests allowed per email in the window
 * @param {number} [options.emailWindowSeconds=3600] - Email rate limit window in seconds (default: 1 hour)
 * @param {boolean} [options.checkCaptcha=true] - Whether to require CAPTCHA when suspicious activity is detected
 * @param {boolean} [options.validateEmailDomain=true] - Whether to validate email RFC syntax and domain MX records
 * @param {Function} [options.getEmail] - Custom function to extract email from request
 * @returns {Function} Express middleware function
 */
export const createEmailRateLimiter = ({
  action = 'general',
  ipLimit = 10,
  ipWindowSeconds = 900,
  cooldownSeconds = 60,
  emailLimit = 5,
  emailWindowSeconds = 3600,
  checkCaptcha = true,
  validateEmailDomain = true,
  getEmail = null
}) => {
  return async (req, res, next) => {
    // 1. Resolve and normalize client IP
    const rawIp =
      req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      req.ip ||
      req.socket?.remoteAddress;
    const clientIp = normalizeIp(rawIp);

    // 2. Check if IP is blocked for abuse
    const { blocked, remainingSeconds } = await isIpBlocked(clientIp);
    if (blocked) {
      res.setHeader('Retry-After', remainingSeconds);
      return res.status(403).json({
        isSuccess: false,
        message: `Access temporarily blocked due to repeated violations. Please try again in ${Math.ceil(remainingSeconds / 60)} minutes.`,
        retryAfter: remainingSeconds
      });
    }

    // 3. Extract target email address
    let email = null;
    if (typeof getEmail === 'function') {
      email = getEmail(req);
    } else {
      email = req.body?.email || req.query?.email || req.params?.email || req.user?.email;
    }

    if (email && typeof email === 'string') {
      email = email.trim().toLowerCase();
    } else {
      email = null;
    }

    // 4. Track email targeting (spraying and account bombing detection)
    if (email) {
      const { isSpraying, isTargetedBombing } = await trackEmailTargeting(clientIp, email);
      if (isSpraying) {
        return res.status(429).json({
          isSuccess: false,
          message: 'Unusual activity detected from this network. Requests have been throttled.'
        });
      }
    }

    // 5. Check for suspicious activity and require CAPTCHA verification
    if (checkCaptcha) {
      const isSuspicious = await isSuspiciousActivity(clientIp, email);
      if (isSuspicious) {
        const captchaToken =
          req.headers['x-captcha-token'] ||
          req.body?.captcha_token ||
          req.query?.captcha_token;

        if (!captchaToken) {
          await recordStrike(clientIp, email, 'missing_captcha');
          return res.status(428).json({
            isSuccess: false,
            requireCaptcha: true,
            message: 'Suspicious activity detected. CAPTCHA verification required.'
          });
        }

        const verification = await verifyCaptchaToken(captchaToken, clientIp);
        if (!verification.isValid) {
          await recordStrike(clientIp, email, 'invalid_captcha');
          return res.status(403).json({
            isSuccess: false,
            requireCaptcha: true,
            message: verification.error || 'CAPTCHA verification failed. Please try again.'
          });
        }

        // CAPTCHA solved successfully, clear suspicion strikes
        await clearSuspicion(clientIp);
      }
    }

    // 6. Validate email syntax and DNS MX deliverability (allowing legitimate temporary emails)
    if (email && validateEmailDomain) {
      const validation = await validateEmailAddress(email);
      if (!validation.isValid) {
        await recordStrike(clientIp, email, 'invalid_email_address');
        return res.status(400).json({
          isSuccess: false,
          message: validation.error || 'Invalid email address or domain does not accept emails.'
        });
      }
    }

    const emailH = email ? hashEmail(email) : null;
    const cooldownKey = emailH ? `cooldown:email:${action}:${emailH}` : null;
    const emailLimitKey = emailH ? `ratelimit:email:${action}:${emailH}` : null;
    const ipLimitKey = `ratelimit:ip:${action}:${clientIp}`;

    try {
      // 7. Check Cooldown (mandatory waiting period between consecutive emails)
      if (cooldownKey && cooldownSeconds > 0) {
        const inCooldown = await redisClient.get(cooldownKey);
        if (inCooldown) {
          const ttl = Math.max(await redisClient.ttl(cooldownKey), 1);
          res.setHeader('Retry-After', ttl);
          return res.status(429).json({
            isSuccess: false,
            message: `Please wait ${ttl} seconds before requesting another email.`,
            cooldownRemaining: ttl,
            retryAfter: ttl
          });
        }
      }

      // 8. Check Per-Email Rate Limit
      if (emailLimitKey && emailLimit > 0) {
        const emailReqCount = Number(await redisClient.get(emailLimitKey)) || 0;
        if (emailReqCount >= emailLimit) {
          await recordStrike(clientIp, email, 'email_rate_limit_exceeded');
          const ttl = Math.max(await redisClient.ttl(emailLimitKey), 60);
          res.setHeader('Retry-After', ttl);
          return res.status(429).json({
            isSuccess: false,
            message: 'Too many email requests for this account. Please try again later.',
            retryAfter: ttl
          });
        }
      }

      // 9. Check Per-IP Rate Limit
      if (ipLimitKey && ipLimit > 0) {
        const ipReqCount = Number(await redisClient.get(ipLimitKey)) || 0;
        if (ipReqCount >= ipLimit) {
          await recordStrike(clientIp, email, 'ip_rate_limit_exceeded');
          const ttl = Math.max(await redisClient.ttl(ipLimitKey), 60);
          res.setHeader('Retry-After', ttl);
          return res.status(429).json({
            isSuccess: false,
            message: 'Too many requests from this IP address. Please slow down.',
            retryAfter: ttl
          });
        }
      }

      // 10. Prevent concurrent duplicate requests (double-click lock)
      if (email) {
        const lockAcquired = await acquireEmailDedupLock(email, action, 15);
        if (!lockAcquired) {
          return res.status(429).json({
            isSuccess: false,
            message: 'A request is already being processed for this email. Please wait a moment.'
          });
        }
      }

      // 11. Apply cooldown and increment rate limit counters
      const pipeline = redisClient.pipeline();

      if (cooldownKey && cooldownSeconds > 0) {
        pipeline.setex(cooldownKey, cooldownSeconds, '1');
      }

      if (emailLimitKey && emailLimit > 0) {
        pipeline.incr(emailLimitKey);
        pipeline.expire(emailLimitKey, emailWindowSeconds);
      }

      if (ipLimitKey && ipLimit > 0) {
        pipeline.incr(ipLimitKey);
        pipeline.expire(ipLimitKey, ipWindowSeconds);
      }

      await pipeline.exec();

      // Continue to handler
      next();
    } catch (error) {
      logger.error('Error in email rate limiter middleware:', error);
      // Release dedup lock on failure
      if (email) {
        await releaseEmailDedupLock(email, action, 15);
      }
      next(); // Fail open on internal middleware error
    }
  };
};

export default {
  createEmailRateLimiter
};
