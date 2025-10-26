import express from "express";
import { googleLogin, googleCallback } from "../controllers/oauthController.js";

const router = express.Router();

router.get("/google", googleLogin);
router.get("/google/callback", googleCallback);

export default router;
