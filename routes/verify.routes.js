import { Router } from "express";

import { verifyOTP } from "../controllers/verify.controllers.js";
import { verifyEmailController, sendVerificationEmailController } from "../controllers/auth.controllers.js";
import { otpValidator, emailVerificationValidator } from "../validators/verify.validators.js";
import verifyEmailMiddleware from "../middleware/verifyEmail.middleware.js";

import { createEmailRateLimiter } from "../middleware/emailRateLimiter.middleware.js";

const verifyRouter = Router();

const verificationEmailRateLimiter = createEmailRateLimiter({
	action: 'verification',
	cooldownSeconds: 60,
	emailLimit: 5,
	emailWindowSeconds: 3600,
	ipLimit: 10,
	ipWindowSeconds: 900,
	checkCaptcha: true,
	validateEmailDomain: true
});

verifyRouter.post("/verify", otpValidator.verifyOTP, verifyOTP);
verifyRouter.get("/verify-email", verifyEmailMiddleware, verifyEmailController);
verifyRouter.post("/verify-email", verifyEmailMiddleware, verifyEmailController);
verifyRouter.post(
	"/send-verification", 
	verificationEmailRateLimiter,
	emailVerificationValidator.sendVerification, 
	sendVerificationEmailController
);

export default verifyRouter;