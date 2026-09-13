import admin from "firebase-admin";
import { readFileSync } from "fs";
import logger from "../libs/logger.js";
import { FIREBASE_CREDENTIALS } from "./env.js";

const serviceAccount = JSON.parse(Buffer.from(FIREBASE_CREDENTIALS, 'base64').toString('utf8'));

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  logger.info("Firebase Admin initialized successfully");
}
catch(error) {
  console.log(error);
  logger.error("Firebase Admin initialization failed:", error);
}

export default admin;