import { Router } from "express";

import { sendNotification } from "../controllers/notification.controllers.js";
import { notificationValidators } from "../validators/notification.validators.js";
import authMiddleware from "../middleware/auth.middleware.js";

const notificationRouter = Router();

notificationRouter.post(
  "/send",
  authMiddleware,
  notificationValidators.send,
  sendNotification
);

export default notificationRouter;
