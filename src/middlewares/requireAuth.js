import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const token =
    req.cookies?.sid || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "No session" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Auth OK:", decoded);
    req.user = { _id: decoded.uid }; // backend ile tam uyumlu
    next();
  } catch (err) {
    console.error("❌ JWT verify failed:", err.message);
    return res.status(401).json({ error: "Unauthenticated" });
  }
}