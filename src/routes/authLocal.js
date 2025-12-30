import express from "express";
import {
  register,
  login,
  me,
  logout,
  forgotPassword,
  resetPassword,
} from "../controllers/authLocalController.js";

const router = express.Router();

// mevcutlar
router.post("/register", register);
router.post("/login", login);
router.get("/me", me);
router.post("/logout", logout);

// ✅ YENİ – mail sistemi
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

export default router;
