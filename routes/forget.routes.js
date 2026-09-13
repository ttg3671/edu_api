import { Router } from "express";

import { resetPassword } from "../controllers/forget.controllers.js";

import { passwordValidator } from "../validators/reset.validators.js";

import resetMiddleware from "../middleware/reset.middleware.js";

const forgetRouter = Router();

forgetRouter.post(
	"/reset", 
	resetMiddleware, 
	passwordValidator.resetPassword, 
	resetPassword
);

export default forgetRouter;