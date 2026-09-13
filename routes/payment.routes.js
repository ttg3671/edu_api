import { Router } from "express";

import {
  get_token_verified,
  get_subscription_plan,
  get_checkout_options,
  post_subscription,
  get_user_subscriptions,
  cancel_subscription,
  get_subscription_status,
  stripe_webhook
} from "../controllers/payment.controllers.js";

import { subscriptionValidators } from "../validators/payment.validators.js";

import authMiddleware from "../middleware/auth.middleware.js";
import requireVerifiedEmail from "../middleware/emailVerified.middleware.js";

const paymentRouter = Router();

paymentRouter.post("/index",
  subscriptionValidators.getIndex, 
  get_token_verified
);

paymentRouter.post("/webhook", stripe_webhook);

paymentRouter.get("/plans", 
  authMiddleware,
  get_subscription_plan
);

paymentRouter.post("/checkout-options",
  authMiddleware,
  requireVerifiedEmail,
  subscriptionValidators.checkoutOptions,
  get_checkout_options
);

paymentRouter.post("/subscribe", 
  authMiddleware,
  requireVerifiedEmail,
  subscriptionValidators.subscribe,
  post_subscription
);

paymentRouter.get("/subscriptions",
  authMiddleware,
  subscriptionValidators.all,
  get_user_subscriptions
);

paymentRouter.post("/subscription-cancel",
  authMiddleware,
  subscriptionValidators.cancelSubscription, 
  cancel_subscription
);

paymentRouter.post("/subscriptions-status",
  authMiddleware,
  subscriptionValidators.subscriptionStatus, 
  get_subscription_status
);

export default paymentRouter;
