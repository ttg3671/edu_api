import { Router } from "express";

import {
  getUserDetails,
  updateUserDetails
} from "../controllers/profile.controllers.js";

import { profileValidator } from "../validators/profile.validators.js";

import authMiddleware from "../middleware/auth.middleware.js";

const profileRouter = Router();

profileRouter.get("/details", authMiddleware, profileValidator.getDetails, getUserDetails);
profileRouter.put("/details", authMiddleware, profileValidator.updateDetails, updateUserDetails);

export default profileRouter;
