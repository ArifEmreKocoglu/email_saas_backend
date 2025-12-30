import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import validator from "validator";
import crypto from "crypto";
import User from "../models/User.js";
import { sendEmailVerification, sendPasswordReset} from "../utils/mailer.js";

function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
    domain: ".entrfy.com",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
}

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
    if (!validator.isEmail(String(email || "")))
      return res.status(400).json({ error: "Invalid email" });
    if ((password || "").length < 6)
      return res.status(400).json({ error: "Password min 6 chars" });

    const exists = await User.findOne({ email: String(email).toLowerCase() });
    if (exists) return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 10);

    // ✅ EMAIL VERIFY TOKEN
    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyTokenHash = crypto.createHash("sha256").update(verifyToken).digest("hex");

    const user = await User.create({
      email: String(email).toLowerCase(),
      passwordHash,
      name: name || "",
      emailVerified: false,
      emailVerify: {
        tokenHash: verifyTokenHash,
        expiresAt: Date.now() + 1000 * 60 * 60 * 24, // 24 saat
      },
    });


    // ✅ VERIFY MAIL
    const verifyUrl = `${process.env.FRONTEND_URL}/auth/verify-email?token=${verifyToken}`;

 await sendEmailVerification({
   email: user.email,
   verifyUrl,
 });

    const token = sign(user._id);
    res.cookie("sid", token, cookieOptions());

    return res.json({
      user: { id: user._id, email: user.email, name: user.name, plan: user.plan },
      verifyRequired: true,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

/* DİĞERLERİ AYNI */
export async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!validator.isEmail(String(email || "")))
      return res.status(400).json({ error: "Invalid email" });

    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user || !user.passwordHash)
      return res.status(401).json({ error: "Invalid credentials" });

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

    return res.json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        limits: user.limits,
        emailVerified: user.emailVerified,
      },
    });
  } catch {
    return res.status(401).json({ error: "Session expired" });
  }
}

export async function logout(req, res) {
  const isProd = process.env.NODE_ENV === "production";
  res.clearCookie("sid", { path: "/", sameSite: isProd ? "none" : "lax", secure: isProd });
  return res.json({ ok: true });
}



export async function forgotPassword(req, res) {
  const { email } = req.body || {};

  if (!validator.isEmail(String(email || ""))) {
    return res.json({ ok: true }); // security
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return res.json({ ok: true }); // security

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  user.passwordReset = {
    tokenHash,
    expiresAt: Date.now() + 1000 * 60 * 30, // 30 dk
  };

  await user.save();

  const resetUrl = `${process.env.FRONTEND_URL}/auth/reset-password?token=${token}`;

  await sendPasswordReset({
    email: user.email,
    resetUrl,
  });


  return res.json({ ok: true });
}



export async function resetPassword(req, res) {
  const { token, password } = req.body || {};

  if (!token || (password || "").length < 6) {
    return res.status(400).json({ error: "Invalid request" });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    "passwordReset.tokenHash": tokenHash,
    "passwordReset.expiresAt": { $gt: Date.now() },
  });

  if (!user) {
    return res.status(400).json({ error: "Token expired or invalid" });
  }

  user.passwordHash = await bcrypt.hash(password, 10);
  user.passwordReset = { tokenHash: null, expiresAt: null };

  await user.save();

  return res.json({ ok: true });
}
