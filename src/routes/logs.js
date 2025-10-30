import express from "express";
import { createLog, listLogs } from "../controllers/logsController.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = express.Router();

router.post("/", createLog);
router.get("/", requireAuth, listLogs);   // ← burada kimlik doğrula

export default router;