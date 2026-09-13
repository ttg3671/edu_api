import dbConnectionPromise from "../config/db.js";
import {
  OTP_TOKEN_SECRET,
  SHORT_TOKEN_SECRET,
  SHORT_EXPIRES_IN
} from "../config/env.js";
import { asyncHandler } from '../utils/paginationHelper.js';
import { verifyToken, generateSpecificToken } from '../utils/authHelper.js';
import { handleValidationErrors, createError } from "../utils/validationHelper.js";

// validate otp
export const verifyOTP = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const { token, otp } = req.body;
  const db = await dbConnectionPromise;

  let verifiedUser;
  try {
    verifiedUser = await verifyToken(token, OTP_TOKEN_SECRET);
  } catch (err) {
    throw createError("Unauthorized / Invalid OTP Token", 401);
  }

  if (verifiedUser.number.toString() !== otp.toString()) {
    throw createError("OTP does not match. Try again...", 401);
  }

  const [[user]] = await db.query(
    "SELECT 1 FROM users WHERE id = ? LIMIT 1",
    [verifiedUser.id]
  );

  if (!user) {
    throw createError("User not found. Please log in again...", 404);
  }

  const resetToken = generateSpecificToken(
    { id: verifiedUser.id, type: true },
    SHORT_TOKEN_SECRET,
    SHORT_EXPIRES_IN
  );

  return res.status(200).json({
    isSuccess: true,
    token: resetToken
  });
});

// export { sendEmailVerificationHandler } from "./mail.controllers.js";
