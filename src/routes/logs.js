import express from "express";
import { listLogs } from "../controllers/logsController.js";
const router = express.Router();

// GET /api/logs?userId=...&page=1&limit=50
router.get("/", listLogs);

export default router;