import express from "express";
import { gmailWatch } from "../controllers/gmailController.js";

const router = express.Router();

router.post("/watch/:googleId", gmailWatch);

export default router;
