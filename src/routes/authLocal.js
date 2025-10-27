import express from "express";
import { register, login, me, logout } from "../controllers/authLocalController.js";
const router = express.Router();

router.post("/register", register); // POST /api/auth/register
router.post("/login", login);       // POST /api/auth/login
router.get("/me", me);              // GET  /api/auth/me
router.post("/logout", logout);     // POST /api/auth/logout

export default router;