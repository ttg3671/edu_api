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

  // console.log(req.cookies);

  if (!cookies?.XXAFIT) {
    return res.sendStatus(204);
  }

  const refreshToken = cookies.XXAFIT;

  const { device_id } = req.body;
  const db = await dbConnectionPromise; 

  if (device_id) {
    const deviceFp = /^[a-f0-9]{64}$/i.test(device_id) ? device_id : generateDeviceFingerprint(device_id);
    await db.query(
      "UPDATE user_devices SET rem_token = NULL WHERE device_fingerprint = ? AND user_id = ?",
      [deviceFp, user_id]
    );
    await clearCache(`user_session:${user_id}:${deviceFp}`);
  } else {
    await db.query(
      "UPDATE user_devices SET rem_token = NULL WHERE rem_token = ?", 
      [refreshToken]
    );
  }

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
