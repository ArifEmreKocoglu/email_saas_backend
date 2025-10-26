import express from "express";
import { handleGmailPush } from "../controllers/n8nController.js";

const router = express.Router();

// Pub/Sub push endpoint
router.post("/gmail/push", handleGmailPush);

export default router;