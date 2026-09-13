import { Router } from "express";

import { 
  signIn, 
  signUp, 
  sendOTP, 
  signInAdmin,
  sendVerificationEmailController,
  verifyEmailController
} from "../controllers/auth.controllers.js";

import { registerValidator, loginValidator, otpValidator } from '../validators/auth.validators.js';
import { emailVerificationValidator } from '../validators/verify.validators.js';
import verifyEmailMiddleware from "../middleware/verifyEmail.middleware.js";

import { createEmailRateLimiter } from "../middleware/emailRateLimiter.middleware.js";

const authRouter = Router();

// Rate limiters for email-triggering endpoints
const otpRateLimiter = createEmailRateLimiter({
	action: 'otp',
	cooldownSeconds: 60,
	emailLimit: 5,
	emailWindowSeconds: 3600,
	ipLimit: 10,
	ipWindowSeconds: 900,
	checkCaptcha: true,
	validateEmailDomain: true
});

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

const signUpRateLimiter = createEmailRateLimiter({
	action: 'signup',
	cooldownSeconds: 0,
	emailLimit: 0,
	ipLimit: 15,
	ipWindowSeconds: 900,
	checkCaptcha: true,
	validateEmailDomain: true
});

authRouter.post(
	"/sign-in", 
	loginValidator.create,
    signIn
);

authRouter.post(
	"/sign-up",
	signUpRateLimiter,
	registerValidator.create,
	signUp
);

authRouter.post(
	"/send", 
	otpRateLimiter,
	otpValidator.sendOTP,
	sendOTP
);

authRouter.post(
	"/send-verification-email", 
	verificationEmailRateLimiter,
	emailVerificationValidator.sendVerification, 
	sendVerificationEmailController
);

// authRouter.post(
// 	"/send-verification", 
// 	emailVerificationValidator.sendVerification, 
// 	sendVerificationEmailController
// );

authRouter.get(
	"/verify-email", 
	verifyEmailMiddleware, 
	verifyEmailController
);

// authRouter.post(
// 	"/verify-email", 
// 	verifyEmailMiddleware, 
// 	verifyEmailController
// );

authRouter.post(
	"/admin/signin", 
	loginValidator.admin,
	signInAdmin
);

export default authRouter;