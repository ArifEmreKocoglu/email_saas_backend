// src/routes/outlookPush.js
import express from "express";
import { handleOutlookNotification } from "../controllers/outlookController.js";

const router = express.Router();

// Microsoft Graph subscription notification endpoint
router.post("/notify", handleOutlookNotification);

export default router;
