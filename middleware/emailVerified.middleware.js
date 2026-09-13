import dbConnectionPromise from "../config/db.js";
import logger from "../libs/logger.js";
import {   
  isReviewer
} from "../utils/authHelper.js";

/**
 * Middleware to check whether the authenticated user's email is verified
 * before allowing access to checkout payment and video streaming/fetching.
 */
const requireVerifiedEmail = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      const error = new Error("Access Denied / Unauthorized request");
      error.statusCode = 401;
      return next(error);
    }

    const db = await dbConnectionPromise;
    const [[user]] = await db.query(
      "SELECT email, email_verified FROM users WHERE id = ? LIMIT 1",
      [userId]
    );

    if (!user) {
      const error = new Error("User account not found");
      error.statusCode = 404;
      return next(error);
    }

    const isUserReviewer = isReviewer(user?.email);

    if (!user?.email_verified && !isUserReviewer) {
      const error = new Error("Email verification required. Please verify your email address to access this feature.");
      error.statusCode = 403;
      return next(error);
    }

    req.user.email_verified = 1;
    req.user.email = user?.email;
    next();
  } catch (error) {
    logger.error("Error in requireVerifiedEmail middleware", { error: error.message });
    next(error);
  }
};

export default requireVerifiedEmail;
