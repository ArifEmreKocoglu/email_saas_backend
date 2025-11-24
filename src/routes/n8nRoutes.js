import express from "express";
import {
  handleGmailPush,
  handleClassificationResult, 
} from "../controllers/n8nController.js";

const router = express.Router();

// Pub/Sub push endpoint
router.post("/gmail/push", handleGmailPush);

// 🆕 n8n LLM sonucu buraya POST atacak
router.post("/n8n/classification-result", handleClassificationResult);

export default router;