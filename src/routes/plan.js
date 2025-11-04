import express from "express";
import { getPlans } from "../controllers/planController.js";
import { createCheckoutSession } from "../controllers/planController.js";


const router = express.Router();

router.get("/", getPlans);

router.post("/checkout", createCheckoutSession);
export default router;
