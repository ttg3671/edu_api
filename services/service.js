import nodemailer from "nodemailer";
import {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASSWORD,
  SMTP_FROM,
  SMTP_SECURE
} from "../config/env.js";
import logger from "../libs/logger.js";

const port = Number(SMTP_PORT) || 587;
const secure = SMTP_SECURE === "true" || port === 465;

export const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port,
  secure,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Verify connection configuration on startup if credentials exist
if (SMTP_HOST && SMTP_USER) {
  transporter.verify((error) => {
    if (error) {
      logger.warn(`SMTP transporter verification failed: ${error.message}`);
    } else {
      logger.info(`SMTP transporter is configured and ready (${SMTP_HOST}:${port})`);
    }
  });
}

/**
 * Send an email directly via Nodemailer SMTP
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject line
 * @param {string} options.html - HTML body
 * @param {string} [options.text] - Plain text body fallback
 * @param {string} [options.from] - Sender address override
 * @returns {Promise<{isSuccess: boolean, messageId?: string, data?: Object, error?: string}>}
 */
export const sendEmail = async ({ to, subject, html, text, from }) => {
  try {
    const defaultSenderEmail = SMTP_USER ? (SMTP_USER.includes('@') ? SMTP_USER : `info@${SMTP_USER}`) : 'info@edumovimiento.com';
    const sender = from || SMTP_FROM || `Edu Garcia Movimiento <${defaultSenderEmail}>`;

    const info = await transporter.sendMail({
      from: sender,
      to,
      subject,
      text: text || (html ? html.replace(/<[^>]*>?/gm, "") : ""),
      html,
    });

    logger.info(`Email sent successfully to ${to} [Message ID: ${info.messageId}]`);
    return {
      isSuccess: true,
      messageId: info.messageId,
      data: info
    };
  } catch (error) {
    logger.error(`Failed to send email to ${to}: ${error.message}`);
    return {
      isSuccess: false,
      error: error.message
    };
  }
};

export default {
  transporter,
  sendEmail
};
