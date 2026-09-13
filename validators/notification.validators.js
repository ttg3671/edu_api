import { body } from "express-validator";

export const notificationValidators = {
  send: [
    body("title")
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .matches(/^[^<>]*$/)
      .withMessage("Please add some meaningful title")
      .bail()
      .isLength({ min: 2 })
      .withMessage("Please add at least 2 words"),

    body("message")
      .trim()
      .notEmpty()
      .withMessage("Please add a message")
      .bail()
      .matches(/^[^<>]*$/)
      .withMessage("Please add some meaningful messag")
      .bail()
      .isLength({ min: 2 })
      .withMessage("Please add at least 2 words")
  ]
};
