import http from 'http';
import io from './config/socket.js';
import app from './app.js';
import db from './config/db.js';
import logger, { flushLogger } from './libs/logger.js';
import './workers/webhookWorker.js';
import './workers/emailWorker.js';
import {
  PORT,
  BASE_URL,
  NODE_ENV
} from './config/env.js';

let server;

try {
  server = http.createServer(app);

  // Initialize Socket.IO with the server
  io.init(server);

  // Start server
  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server running on ${BASE_URL || 'http://localhost'}:${PORT} [${NODE_ENV}]`);
  });

} catch (error) {
  logger.error("Error starting server:", error);
  process.exit(1);
}

// Graceful shutdown
const shutdown = (signal) => {
  logger.info(`${signal} signal received. Closing server...`);
  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');
      try {
        if (db.end) await db.end();
        logger.info('MySQL pool closed');
      } catch (err) {
        logger.error('Error closing DB:', err);
      }
      if (io.close) io.close();
      await flushLogger();
      process.exit(0);
    });
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', async (err) => {
  logger.error('Uncaught Exception:', err);
  await flushLogger();
  process.exit(1);
});
