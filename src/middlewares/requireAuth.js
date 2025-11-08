import jwt from "jsonwebtoken";


export function requireAuth(req, res, next) {
  try {
    const token =
      req.cookies?.sid ||
      (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) {
      return res.status(401).json({ error: "No auth token" });
    }

    const { uid } = jwt.verify(token, process.env.JWT_SECRET);
    req.auth = { userId: uid };
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}