import redisClient from '../config/redis.js';
import logger from '../libs/logger.js';

async function clearRedisCache() {
  try {
    logger.info('Connecting to Redis to clear cache...');
    
    // flushall deletes all keys from all databases
    // flushdb would delete keys from the current database only
    const result = await redisClient.flushall();
    
    if (result === 'OK') {
      logger.info('🚀 Redis cache cleared successfully.');
    } else {
      logger.warn('Redis responded with:', result);
    }
    
    // Close connection so the script can exit
    await redisClient.quit();
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error clearing Redis cache:', error);
    process.exit(1);
  }
}

// Handle script termination
process.on('SIGINT', async () => {
  await redisClient.quit();
  process.exit(0);
});

clearRedisCache();
