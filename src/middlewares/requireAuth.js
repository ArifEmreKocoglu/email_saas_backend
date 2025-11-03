export function requireAuth(req, res, next) {
  const token =
    req.cookies?.sid || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "No session" });

  try {
    const { uid } = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { _id: uid }; // ✅ controllers ile uyumlu
    console.log("[MAIL ROUTE HIT]", req.method, req.originalUrl, "user:", uid);
    next();
  } catch {
    return res.status(401).json({ error: "Unauthenticated" });
  }
}