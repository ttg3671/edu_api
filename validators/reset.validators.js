import { body, param } from 'express-validator';

export const passwordValidator = {
	resetPassword: [
		body("password")
	      .trim()
	      .notEmpty()
	      .withMessage("Password required")
	      .bail()
	      .matches(/^[^<>]*$/)
	      .withMessage("Invalid password"),
	    body("cpassword")
	      .notEmpty()
	      .withMessage("Confirm password is required")
	      .bail()
	      .custom((value, { req }) => {
	        if (value !== req.body.password) {
	          throw new Error("Passwords do not match");
	        }
	        return true;
	    }),
	    body('device_id')
	      .trim()
		  .notEmpty()
		  .withMessage("Device required")
		  .bail()
		  .isLength({ min: 8, max: 255 })
		  .withMessage('Invalid Device value')
		  .bail()
		  .matches(/^[^<>]*$/)
		  .withMessage('Invalid Device value')
		  .bail()
		  .matches(/^[A-Za-z0-9-:_]+$/)
		  .withMessage('Invalid Device value')
	]
}