import express from "express";
import {
  startGoogleConnect,
  googleCallback,
  startMicrosoftConnect,
  microsoftCallback,
} from "../controllers/oauthController.js";

const router = express.Router();

router.get("/google", startGoogleConnect);
router.get("/google/callback", googleCallback);

// ✅ Outlook / Microsoft
router.get("/microsoft", startMicrosoftConnect);          // /auth/microsoft?userId=...
router.get("/microsoft/callback", microsoftCallback);     // redirect URI

export default router;
