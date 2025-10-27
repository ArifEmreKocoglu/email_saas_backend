import express from "express";
import { startGoogleConnect, googleCallback } from "../controllers/oauthController.js";
const router = express.Router();

router.get("/google", startGoogleConnect);        // /auth/google?userId=...
router.get("/google/callback", googleCallback);   // redirect URI

export default router;