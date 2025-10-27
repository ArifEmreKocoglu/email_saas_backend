import express from "express";
import { createLog, listLogs } from "../controllers/logsController.js";

const router = express.Router();

// POST /api/logs  → n8n buraya yazar
router.post("/", createLog);

// GET /api/logs?userId=...&page=1&limit=50  → frontend listeler
router.get("/", listLogs);

export default router;