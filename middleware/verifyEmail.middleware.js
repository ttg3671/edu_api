import jwt from "jsonwebtoken";
import { SHORT_TOKEN_SECRET, BASE_URL1 } from "../config/env.js";
import logger from "../libs/logger.js";
import { createError } from "../utils/validationHelper.js";

/**
 * Middleware to check whether the email verification token is valid and not expired (10-minute validity)
 */
const verifyEmailMiddleware = async (req, res, next) => {
  try {
    let token = req.query.q || req.query.token || req.body?.token || req.body?.q;
    if (typeof token === "string") {
      token = token.trim();
      // Handle trailing closing brace in case link was generated with extra '}'
      if (token.endsWith("}")) {
        token = token.slice(0, -1).trim();
      }
    }

    // console.log(token);

    if (!token) {
      return res.redirect(
        `${BASE_URL1}/email-verified?status=missing`
      );
    }

    try {
      const verifiedUser = jwt.verify(token, SHORT_TOKEN_SECRET);
      req.user = verifiedUser;
      next();
    } catch (err) {
      logger.error("Email verification token expired or invalid", { error: err.message });
      return res.redirect(
        `${BASE_URL1}/email-verified?status=expired`
      );
    }
  } catch (error) {
    next(error);
  }
};

export default verifyEmailMiddleware;
