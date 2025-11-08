import express from "express";
import { gmailWatchByAccount } from "../controllers/gmailController.js";

const router = express.Router();

router.post("/watch-account/:accountId", gmailWatchByAccount);
// router.post("/watch/:googleId", gmailWatch);

export default router;
