import { Router } from "express";

const refreshRouter = Router();

import { handleAdminRefreshToken, handleRefreshToken } from "../controllers/refresh.controllers.js";

refreshRouter.get("/", handleRefreshToken);

refreshRouter.get("/admin", handleAdminRefreshToken);

export default refreshRouter;