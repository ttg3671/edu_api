import { Router } from "express";

const logoutRouter = Router();

import { signOut, signOutAdmin } from "../controllers/logout.controllers.js";

import { body } from "express-validator";

logoutRouter.get("/admin", signOutAdmin);

logoutRouter.post("/",
	[
		body('device_id')
	      .trim()
	      .notEmpty()
	      .withMessage('Oops, something went wrong')
	      .isLength({ min: 9, max: 12 })
	      .withMessage('Oops, something went wrong')
	      .matches(/^[A-Za-z0-9-]+$/)
	      .withMessage('Oops, something went wrong'),
	], 
	signOut
);

export default logoutRouter;
