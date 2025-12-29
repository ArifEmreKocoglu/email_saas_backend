// routes/oauthAuth.js
import express from "express";
import {
  startGoogleLogin,
  googleLoginCallback,
  startMicrosoftLogin,
  microsoftLoginCallback,
} from "../controllers/oauthAuthController.js";

const router = express.Router();

/* -------------------------------------------------
   SaaS LOGIN / SIGNUP (MAIL CONNECT'TEN AYRI)
------------------------------------------------- */

// Google
router.get("/login/google", startGoogleLogin);
router.get("/login/google/callback", googleLoginCallback);

// Microsoft
router.get("/login/microsoft", startMicrosoftLogin);
router.get("/login/microsoft/callback", microsoftLoginCallback);

export default router;
