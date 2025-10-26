// routes/gmailPush.js
import express from "express";
import { handleGmailPush } from "../controllers/n8nController.js";

const router = express.Router();

router.post("/push", handleGmailPush);

export default router;
