import pino from 'pino';

import { NODE_ENV } from "../config/env.js";

// console.log(NODE_ENV);

const logger = pino({
  level: NODE_ENV === 'production' ? 'info' : 'debug',
  transport: NODE_ENV !== 'production'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname,req',
        },
      }
    : undefined,
});

export default logger;