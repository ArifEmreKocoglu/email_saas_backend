// src/middlewares/requireAuth.js
import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const token =
    req.cookies?.sid || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "No session" });

  try {
    const { uid } = jwt.verify(token, process.env.JWT_SECRET);
    req.auth = { userId: uid };
    next();
  } catch {
    return res.status(401).json({ error: "Unauthenticated" });
  }
}