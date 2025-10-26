import express from "express";
import { getAccounts, addAccount, deactivateAccount } from "../controllers/mailAccountController.js";

const router = express.Router();

router.get("/", getAccounts);
router.post("/add", addAccount);
router.put("/:accountId/deactivate", deactivateAccount);

export default router;