import admin from "../config/firebase.js";
import logger from "../libs/logger.js";

import {
  handleValidationErrors,
  createError
} from "../utils/validationHelper.js";

import {
  sendSuccess,
  asyncHandler,
} from '../utils/paginationHelper.js';

/**
 * Controller for sending push notification to all users (broadcast) or to a specific device token
 */
export const sendNotification = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { title, message } = req.body;

  const msgBody = {
    notification: {
      // Use provided title, or fallback to a default app title if missing
      title: title || "Edu Garcia Movimiento 💪",
      body: message,
    },
    topic: 'all', 
  };

  try {
    const messageId = await admin.messaging().send(msgBody);
    logger.info(`Notification sent successfully. Message ID: ${messageId}`);

    return sendSuccess(res, "Notification sent successfully.");
  } catch (error) {
    logger.error("Error sending push notification:", error);
    throw createError(error.message || "Failed to send notification", 500);
  }
});