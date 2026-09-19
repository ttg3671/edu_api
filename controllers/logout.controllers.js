import dbConnectionPromise from "../config/db.js";
import {
  handleValidationErrors,
  createError
} from "../utils/validationHelper.js";
import {
  asyncHandler
} from '../utils/paginationHelper.js';
import { generateDeviceFingerprint } from "../utils/authHelper.js";
import { clearCache } from "../utils/cache.js";
import logger from "../libs/logger.js";

export const signOutAdmin = asyncHandler(async (req, res) => {
  const cookies = req.cookies;

  if (!cookies?.XXAFIT) {
    return res.sendStatus(204);
  }

  const refreshToken = cookies.XXAFIT;
  const db = await dbConnectionPromise; 

  await db.query(
    "UPDATE admin SET rem_token = NULL WHERE rem_token = ?", 
    [refreshToken]
  );

  res.clearCookie("XXAFIT", {
    sameSite: "None",
    httpOnly: true,
    secure: true
  });
      
  return res.sendStatus(204);
});

export const signOut = asyncHandler(async (req, res) => {
  handleValidationErrors(req);

  const user_id = req.user?.id;
  const cookies = req.cookies;

  logger.info("cookies: ", req.cookies);

  if (!cookies?.XXAFIT) {
    return res.sendStatus(204);
  }

  const refreshToken = cookies.XXAFIT;

  logger.info("device_id: ", req.body.device_id);

  const deviceFp = generateDeviceFingerprint(req.body.device_id);
  logger.info("deviceFp: ", deviceFp)

  const db = await dbConnectionPromise; 

    await db.query(
      "UPDATE user_devices SET rem_token = NULL WHERE device_fingerprint = ? AND user_id = ?", 
      [deviceFp, user_id]
    );
    await clearCache(`user_session:${user_id}:${deviceFp}`);

  await Promise.all([
    clearCache(`user_devices:${user_id}`),
    clearCache(`user_profile:${user_id}`),
    clearCache(`user_profiles:${user_id}`),
    clearCache(`continue_watching:${user_id}`),
  ]);

  res.clearCookie("XXAFIT", {
    sameSite: "None",
    httpOnly: true,
    secure: true
  });
      
  return res.sendStatus(204);
});
