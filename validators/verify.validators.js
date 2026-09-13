import { body } from 'express-validator';

export const otpValidator = {
	verifyOTP: [
		body("token")
			.trim()
			.notEmpty()
			.withMessage("OTP required")
			.bail()
			.matches(/^[^<>]*$/)
			.withMessage("Invalid OTP"),
		body("otp")
			.trim()
			.notEmpty()
			.withMessage("OTP required")
			.bail()
			.matches(/^[^<>]*$/)
			.withMessage("Invalid OTP"),
	]
};

export const emailVerificationValidator = {
	sendVerification: [
		body("email")
			.optional()
			.trim()
			.isEmail()
			.withMessage("Invalid email")
			.normalizeEmail(),
	]
};