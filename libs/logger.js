import winston from 'winston';
import { LoggingWinston } from '@google-cloud/logging-winston';

import { NODE_ENV, FIREBASE_CREDENTIALS, GCP_LOGGING_ENABLED, GCP_LOG_NAME } from "../config/env.js";

const isProduction = NODE_ENV === 'production';

// Reuse the Firebase service account (base64 JSON) to authenticate against Cloud Logging.
// The service account needs the "Logs Writer" role and the Cloud Logging API enabled.
const getServiceAccount = () => {
  if (!FIREBASE_CREDENTIALS) return null;
  try {
    return JSON.parse(Buffer.from(FIREBASE_CREDENTIALS, 'base64').toString('utf8'));
  } catch {
    return null;
  }
};

const consoleFormat = isProduction
  ? winston.format.json()
  : winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} ${level}: ${stack || message}${extra}`;
      }),
    );

const transports = [new winston.transports.Console({ format: consoleFormat })];

// Cloud Logging is on by default in production; set GCP_LOGGING_ENABLED=true/false to override.
const cloudLoggingEnabled = GCP_LOGGING_ENABLED ? GCP_LOGGING_ENABLED === 'true' : isProduction;
let cloudTransportSkipped = false;

if (cloudLoggingEnabled) {
  const serviceAccount = getServiceAccount();
  if (serviceAccount) {
    transports.push(
      new LoggingWinston({
        projectId: serviceAccount.project_id,
        credentials: {
          client_email: serviceAccount.client_email,
          private_key: serviceAccount.private_key,
        },
        logName: GCP_LOG_NAME || 'edu-api',
        serviceContext: { service: 'edu-api' },
        defaultCallback: (err) => {
          if (err) console.error('Cloud Logging write failed:', err.message);
        },
      }),
    );
  } else {
    cloudTransportSkipped = true;
  }
}

const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: winston.format.combine(winston.format.errors({ stack: true }), winston.format.splat()),
  transports,
});

if (cloudTransportSkipped) {
  logger.warn('Cloud Logging enabled but FIREBASE_CREDENTIALS is missing or invalid. Using console logging only.');
}

// Flush buffered entries before the process exits (Cloud Logging batches writes).
export const flushLogger = (timeoutMs = 3000) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    logger.on('finish', () => {
      clearTimeout(timer);
      resolve();
    });
    logger.end();
  });

export default logger;
