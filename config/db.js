import mysql from 'mysql2/promise';
import { 
  HOST,
  USER,
  PASSWORD,
  DATABASE,
  NODE_ENV 
} from './env.js';
import logger from "../libs/logger.js";

const pool = mysql.createPool({
  host: HOST,
  user: USER,
  password: PASSWORD,
  database: DATABASE,
  port: 3306, // Default MySQL port
  timezone: 'local',
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: NODE_ENV === 'production' ? 50 : 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

pool.on('error', (err) => {
  logger.error('MySQL Pool Error', { message: err.message, stack: err.stack });
});

async function testConnection(retries = 5) {
  while (retries) {
    try {
      const conn = await pool.getConnection();
      logger.info('MySQL DB connected successfully');
      conn.release();
      return;
    } catch (err) {
      retries -= 1;
      logger.info(`MySQL connection failed. Retries left: ${retries}`, err.message);
      if (!retries) process.exit(1);
      await new Promise(res => setTimeout(res, 5000));
    }
  }
}

testConnection();

export default pool;
