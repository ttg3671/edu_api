import dbConnectionPromise from "../config/db.js";
import {
  ACCESS_TOKEN_SECRET,
  WEB_TOKEN_SECRET,
  WEB_EXPIRES_IN
} from "../config/env.js";
import logger from "../libs/logger.js";
import { asyncHandler } from '../utils/paginationHelper.js';
import { verifyToken, generateSpecificToken, generateNameFromEmail } from '../utils/authHelper.js';
import { handleValidationErrors, createError } from "../utils/validationHelper.js";
import { sendAccessStepsEmail } from "./mail.controllers.js";

export const generateWebsiteToken = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const {device_id} = req.params;
  const user_id = req.user?.id;

  if (!user_id) {
    throw createError("Unauthorized / User ID missing", 401);
  }

  const db = await dbConnectionPromise;

  const [[user]] = await db.query(
    "SELECT email FROM users WHERE id = ? LIMIT 1",
    [user_id]
  );

  if (!user) {
    throw createError("User not found. Please log in again.", 404);
  }

  const email = user?.email || req.user?.email;
  if (!email) {
    throw createError("User email not found", 400);
  }

  const webToken = generateSpecificToken(
    { id: user_id, device_id, device: "app" },
    WEB_TOKEN_SECRET,
    WEB_EXPIRES_IN
  );

  const link = `https://www.edumovimiento.com/?src=iosApp&nftoken=${webToken}`;

  const displayName = generateNameFromEmail(email);
  const emailResult = await sendAccessStepsEmail(email, link, displayName);

  if (!emailResult?.isSuccess) {
    logger.error("Failed to send access steps email", { email, error: emailResult?.error });
    throw createError("Failed to send access steps email. Please try again later.", 500);
  }

  return res.status(200).json({
    isSuccess: true,
    message: "Email sent successfully..."
  });
});

export default {
  generateWebsiteToken
};

