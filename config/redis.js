import Redis from "ioredis";
import logger from "../libs/logger.js";
import { RPASSWORD, HOST } from "./env.js";

// BullMQ and ioredis setup
const redisConfig = {
    host: HOST,
    port: 6379,
    password: RPASSWORD,
    maxRetriesPerRequest: null, // REQUIRED for BullMQ
    reconnectStrategy: (times) => {
        if (times > 10) {
            logger.error("Redis max retries reached.");
            return null; // stop retrying
        }
        return Math.min(times * 100, 3000);
    },
};

const redisClient = new Redis(redisConfig);

redisClient.on('error', (err) => logger.error('Redis Client Error', err));
redisClient.on('connect', () => logger.info('Redis Client Connecting...'));
redisClient.on('ready', () => logger.info('Redis Client Connected and Ready'));
redisClient.on('reconnecting', () => logger.warn('Redis Client Reconnecting...'));

export default redisClient;