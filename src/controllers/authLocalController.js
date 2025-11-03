import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import validator from "validator";
import User from "../models/User.js";

function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
    domain: ".entrfy.com",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 gün
  };
}

// env'i çağrı ANINDA oku (import anında değil)
function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET missing");
  return s;
}
function sign(uid) {
  return jwt.sign({ uid: String(uid) }, getSecret(), { expiresIn: "30d" });
}

export async function register(req, res) {
  try {
    const { email, password, name } = req.body || {};
    if (!validator.isEmail(String(email || ""))) return res.status(400).json({ error: "Invalid email" });
    if ((password || "").length < 6) return res.status(400).json({ error: "Password min 6 chars" });

    const exists = await User.findOne({ email: String(email).toLowerCase() });
    if (exists) return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: String(email).toLowerCase(),
      passwordHash,
      name: name || "",
    });

    const token = sign(user._id);
    res.cookie("sid", token, cookieOptions());
    return res.json({ user: { id: user._id, email: user.email, name: user.name, plan: user.plan } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!validator.isEmail(String(email || ""))) return res.status(400).json({ error: "Invalid email" });

    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user || !user.passwordHash) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = sign(user._id);
    res.cookie("sid", token, cookieOptions());
    return res.json({ user: { id: user._id, email: user.email, name: user.name, plan: user.plan } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

export async function me(req, res) {
  try {
    const token = req.cookies?.sid || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "No session" });

    const { uid } = jwt.verify(token, getSecret());
    const user = await User.findById(uid).lean();
    if (!user) return res.status(401).json({ error: "Invalid session" });

    return res.json({ user: { id: user._id, email: user.email, name: user.name, plan: user.plan } });
  } catch (e) {
    return res.status(401).json({ error: "Session expired" });
  }
}

export async function logout(req, res) {
  try {
    const isProd = process.env.NODE_ENV === "production";
    res.clearCookie("sid", { path: "/", sameSite: isProd ? "none" : "lax", secure: isProd });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}