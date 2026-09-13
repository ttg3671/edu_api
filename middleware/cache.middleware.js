// middleware/cache.middleware.js
import redisClient from "../config/redis.js";
import logger from "../libs/logger.js";

/**
 * PROD READY: Caches JSON responses with status codes.
 */
export const cacheMiddleware = (duration) => async (req, res, next) => {
  // Key includes the full path + query strings for unique caching
  const key = `cache:${req.originalUrl}`;
  
  try {
    const cachedResponse = await redisClient.get(key);
    if (cachedResponse) {
      const { status, body } = JSON.parse(cachedResponse);
      return res.status(status).json(body);
    }

    // Capture the original json method
    const originalJson = res.json;

    // Override res.json
    res.json = function(body) {
      // Only cache successful or non-server-error responses (optional optimization)
      if (res.statusCode >= 200 && res.statusCode < 400) {
        const cacheData = JSON.stringify({
          status: res.statusCode,
          body: body
        });
        
        redisClient.setex(key, duration, cacheData).catch(err => 
          logger.error("Redis Set Error:", err)
        );
      }

      return originalJson.call(this, body);
    };

    next();
  } catch (error) {
    logger.error("Cache Middleware Error:", error);
    next(); // Fallback to DB if Redis fails
  }
};
