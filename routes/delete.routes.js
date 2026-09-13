import { Router } from "express";

import { userAccount } from "../controllers/delete.controllers.js";
import authMiddleware from "../middleware/auth.middleware.js";

const deleteRouter = Router();

deleteRouter.delete("/user", authMiddleware, userAccount);

export default deleteRouter;