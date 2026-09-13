import { Router } from "express";

import {
  connected_devices,
  remove_device
} from "../controllers/devices.controllers.js";

import { deviceValidator } from "../validators/devices.validators.js";

import authMiddleware from "../middleware/auth.middleware.js";

const devicesRouter = Router();

devicesRouter.post("/connected-device", authMiddleware, deviceValidator.get, connected_devices);

devicesRouter.post("/remove-device", authMiddleware, deviceValidator.delete, remove_device);

export default devicesRouter;
