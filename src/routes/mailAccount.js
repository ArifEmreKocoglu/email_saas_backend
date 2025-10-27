import express from "express";
import { listByUser } from "../controllers/mailAccountController.js";
const router = express.Router();

router.get("/", listByUser);

export default router;