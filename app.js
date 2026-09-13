import express from "express";

import cookieParser from "cookie-parser";

import cors from "cors";

import compression from 'compression';

import helmet from 'helmet';

import authRouter from "./routes/auth.routes.js";
import refreshRouter from "./routes/refresh.routes.js";
import logoutRouter from "./routes/logout.routes.js";
import userRouter from "./routes/user.routes.js";
import devicesRouter from "./routes/devices.routes.js";
import profileRouter from "./routes/profile.routes.js";
import adminRouter from "./routes/admin.routes.js";
import verifyRouter from "./routes/verify.routes.js";
import forgetRouter from "./routes/forget.routes.js";
import webLinkRouter from "./routes/website.link.routes.js";
import paymentRouter from "./routes/payment.routes.js";
import deleteRouter from "./routes/delete.routes.js";
import notificationRouter from "./routes/notification.routes.js";
import cloudinaryRouter from "./routes/cloudinary.routes.js";

import errorMiddleware from "./middleware/error.middleware.js";

import { corsOptions } from "./config/corsOptions.js";

import logger from 'pino-http';

const app = express();

app.set('trust proxy', true);

app.use(helmet());

app.use(compression());

app.use(cors(corsOptions));

app.use(cookieParser());

// Stripe webhook needs raw body for signature verification
// Must be BEFORE express.json()
app.use("/api/v1/payments/webhook", express.raw({ type: 'application/json' }));

app.use(express.json());

app.use(express.urlencoded({ extended: false }));

app.use(logger());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/refresh", refreshRouter);
app.use("/api/v1/mail", verifyRouter);
app.use("/api/v1/forget", forgetRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/devices", devicesRouter);
app.use("/api/v1/profile", profileRouter);
app.use("/api/v1/cloudinary", cloudinaryRouter);

app.use("/api/v1/payments", paymentRouter);
app.use("/api/v1/logout", logoutRouter);

app.use("/api/v1/remove-session", deleteRouter);

app.use("/api/v1/weblink", webLinkRouter);

app.use("/api/v1/notifications", notificationRouter);

app.use("/api/v1/admin", adminRouter);

app.use((_req, res) => {
  return res.sendStatus(404);
});

app.use(errorMiddleware);

export default app;
