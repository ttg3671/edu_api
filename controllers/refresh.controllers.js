import dbConnectionPromise from "../config/db.js";
import { REFRESH_TOKEN_SECRET } from "../config/env.js";
import { asyncHandler } from '../utils/paginationHelper.js';
import { verifyToken, generateTokens } from '../utils/authHelper.js';
import {
  createError
} from "../utils/validationHelper.js";

export const handleAdminRefreshToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.XXAFIT;

  if (!refreshToken) {
    throw createError("Access Denied / Unauthorized request", 401);
  }

  const db = await dbConnectionPromise;

  const [[foundUser]] = await db.query(
    "SELECT id FROM admin WHERE rem_token = ? LIMIT 1",
    [refreshToken]
  );

  if (!foundUser) {
    throw createError("Access Denied / Unauthorized user", 401);
  }

  try {
    const verifiedUser = await verifyToken(refreshToken, REFRESH_TOKEN_SECRET);

    if (Number(verifiedUser.id) !== Number(foundUser.id)) {
      throw createError("Access Denied / Unauthorized user", 401);
    }

    const { accessToken } = generateTokens(foundUser.id, 'ADMIN');

    return res.json({
      isSuccess: true,
      message: "successful!",
      token: accessToken
    });
  } catch (error) {
    throw createError("Invalid Token", 401);
  }
});

export const handleRefreshToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.XXAFIT;

  // console.log(refreshToken);

  if (!refreshToken) {
    throw createError("Access Denied / Unauthorized request", 401);
  }

  const db = await dbConnectionPromise;

  const [[foundUser]] = await db.query(
    "SELECT u.id FROM users u INNER JOIN user_devices ud ON ud.user_id = u.id WHERE ud.rem_token = ? LIMIT 1",
    [refreshToken]
  );

  if (!foundUser) {
    throw createError("Access Denied / Unauthorized user", 401);
  }

  try {
    const verifiedUser = await verifyToken(refreshToken, REFRESH_TOKEN_SECRET);

    if (Number(verifiedUser.id) !== Number(foundUser.id)) {
      throw createError("Access Denied / Unauthorized user", 401);
    }

    const { accessToken } = generateTokens(foundUser.id, 'USER');

    return res.json({
      isSuccess: true,
      message: "successful!",
      token: accessToken
    });
  } catch (error) {
    throw createError("Invalid Token", 401);
  }
});
