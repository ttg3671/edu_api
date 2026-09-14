import { Router } from "express";

import authMiddleware from "../middleware/auth.middleware.js";

import { generateWebsiteToken } from "../controllers/website.link.controllers.js";

import { subscriptionValidators } from "../validators/payment.validators.js";

import { createEmailRateLimiter } from "../middleware/emailRateLimiter.middleware.js";

const webLinkRouter = Router();

const accessStepsRateLimiter = createEmailRateLimiter({
	action: 'access_steps',
	cooldownSeconds: 60,
	emailLimit: 10,
	emailWindowSeconds: 3600,
	ipLimit: 20,
	ipWindowSeconds: 900,
	checkCaptcha: false,
	validateEmailDomain: false,
	getEmail: (req) => req.user?.email
});

webLinkRouter.get(
	"/send-access-steps/:device_id/plans/:plan", 
	authMiddleware, 
	accessStepsRateLimiter,
	subscriptionValidators.websiteLink, 
	generateWebsiteToken
);

export default webLinkRouter;
