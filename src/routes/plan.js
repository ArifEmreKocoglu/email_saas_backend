import express from "express";
import {
  getPlans,
  createCheckoutSession,
  verifyCheckoutSession, // ✅ yeni fonksiyonu da içeri al
} from "../controllers/planController.js";

const router = express.Router();

router.get("/", getPlans);
router.post("/checkout", createCheckoutSession);

// ✅ yeni endpoint: success sayfasında çağrılacak
router.get("/verify/:sessionId", verifyCheckoutSession);

export default router;