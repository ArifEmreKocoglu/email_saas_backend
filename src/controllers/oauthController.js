import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { google } from "googleapis";
import MailAccount from "../models/MailAccount.js";
import User from "../models/User.js";

// ✅ Default tagsConfig template backend'dekiyle birebir
const DEFAULT_LABEL_TEMPLATE = {
  allowed: [
    { path: "Finance", color: "#fad165" },
    { path: "Finance/Invoices", color: "#fad165" },
    { path: "Finance/Payments", color: "#fad165" },
    { path: "Security", color: "#ffad47" },
    { path: "Security/Spam", color: "#ffad47" },
    { path: "Security/Phishing", color: "#ffad47" },
    { path: "Marketing", color: "#fb4c2f" },
    { path: "Marketing/Newsletters", color: "#fb4c2f" },
    { path: "Marketing/Promotions", color: "#fb4c2f" },
    { path: "Commerce", color: "#16a766" },
    { path: "Commerce/Orders", color: "#16a766" },
    { path: "Commerce/Shipping", color: "#16a766" },
    { path: "Commerce/Returns", color: "#16a766" },
    { path: "Support", color: "#f691b3" },
    { path: "Support/Tickets", color: "#f691b3" },
    { path: "DevOps", color: "#f691b3" },
    { path: "DevOps/Tools", color: "#f691b3" },
    { path: "HR", color: "#43d692" },
    { path: "HR/Application", color: "#43d692" },
    { path: "Legal", color: "#43d692" },
    { path: "System", color: "#43d692" },
    { path: "Personal", color: "#a479e2" },
  ],
  awaiting: { path: "AwaitingReply", color: "#000000" },
  review: { path: "Review/Uncertain", color: "#4a86e8" },
};

function must(name) {
  if (!process.env[name]) throw new Error(`${name} is missing`);
}

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify",
];

function oauthClient() {
  must("GOOGLE_CLIENT_ID");
  must("GOOGLE_CLIENT_SECRET");
  must("GOOGLE_REDIRECT_URI");
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export async function startGoogleConnect(req, res) {
  try {
    must("JWT_SECRET");
    const userId = String(req.query.userId || "");
    if (!mongoose.isValidObjectId(userId))
      return res.status(400).send("Invalid userId");

    const state = jwt.sign(
      { userId, mode: "connect" },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );
    const client = oauthClient();
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: SCOPES,
      state,
    });
    return res.redirect(url);
  } catch (e) {
    console.error("[/auth/google] error:", e);
    return res.status(500).send(`[oauth] ${e.message}`);
  }
}

export async function googleCallback(req, res) {
  try {
    must("JWT_SECRET");
    const { code, state } = req.query;
    const { userId } = jwt.verify(state, process.env.JWT_SECRET);

    const client = oauthClient();
    const { tokens } = await client.getToken(String(code));
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    const email = me.data.email;
    const googleId = me.data.id;

    if (!email) return res.status(400).send("Email not found from Google");

    const account = await MailAccount.findOneAndUpdate(
      { userId, provider: "gmail", email },
      {
        $set: {
          userId,
          provider: "gmail",
          email,
          googleId,
          accessToken: tokens.access_token || null,
          refreshToken: tokens.refresh_token || null,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          status: "active",
          isActive: true, // ✅ Reconnect veya yeni bağlantıda yeniden aktif hale getir
        },
      },
      { upsert: true, new: true }
    );

    // ✅ Eğer tagsConfig yoksa otomatik oluştur
    if (!account.tagsConfig || Object.keys(account.tagsConfig).length === 0) {
      account.tagsConfig = DEFAULT_LABEL_TEMPLATE;
    }

    // Gmail Watch API
    const gmail = google.gmail({ version: "v1", auth: client });
    const watchRes = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: process.env.GMAIL_PUBSUB_TOPIC,
        labelIds: ["INBOX"],
        labelFilterAction: "include",
      },
    });

 
    account.historyId = watchRes.data.historyId || null;
    account.lastHistoryId = account.historyId;
    account.watchExpiration = watchRes.data.expiration
      ? new Date(Number(watchRes.data.expiration))
      : null;

    // 🔥 Reconnect durumunda da aktifliği koru
    account.isActive = true;
    account.status = "active";

    await account.save();

    return res.redirect(
      `${process.env.FRONTEND_URL}/auth/callback?status=success&email=${encodeURIComponent(email)}`
    );
  } catch (e) {
    console.error("[/auth/google/callback] error:", e);
    return res.redirect(
      `${process.env.FRONTEND_URL}/auth/callback?status=error&msg=${encodeURIComponent(e.message)}`
    );
  }
}