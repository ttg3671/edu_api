// utils/cache.js
import redisClient from "../config/redis.js"; 
import logger from "../libs/logger.js";

export const getOrSetCache = async (key, cb, ttl = 3600) => {
  try {
    const cachedData = await redisClient.get(key);
    if (cachedData) return JSON.parse(cachedData);

    const freshData = await cb();
    if (freshData) {
      await redisClient.setex(key, ttl, JSON.stringify(freshData));
    }
    return freshData;
  } catch (error) {
    logger.error("Cache Get/Set Error:", error);
    return await cb(); // Fallback to DB
  }
};

/**
 * PROD READY: Deletes keys matching a pattern using SCAN instead of KEYS.
 * This prevents blocking the Redis event loop.
 */
export const clearCache = async (pattern) => {
  try {
    let count = 0;
    const stream = redisClient.scanStream({
      match: pattern,
      count: 100
    });

    for await (const keys of stream) {
      if (keys.length > 0) {
        await redisClient.del(keys);
        count += keys.length;
      }
    }
    if (count > 0) logger.info(`[Cache] Invalidated ${count} key(s) matching pattern: ${pattern}`);
  } catch (error) {
    logger.error("Cache Invalidation Error:", error);
  }
};
