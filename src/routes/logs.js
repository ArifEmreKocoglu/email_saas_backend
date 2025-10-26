import express from "express";
import { createLog, getLogs } from "../controllers/logController.js";

const router = express.Router();

// n8n backend’e log POST eder → DB’ye kaydedilir
router.post("/", createLog);

// frontend Logs Page → kullanıcı loglarını GET eder
router.get("/", getLogs);

export default router;
