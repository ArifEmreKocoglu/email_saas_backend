import jwt from "jsonwebtoken";
import axios from "axios";
import mongoose from "mongoose";
import { google } from "googleapis";
import MailAccount from "../models/MailAccount.js";
import { createOrRenewOutlookSubscription } from "./outlookController.js"; 
import { syncOutlookCategoriesFromTagsConfig } from "./outlookController.js";

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


// ✅ Outlook için özel DEFAULT (FLAT – category tabanlı)
const DEFAULT_OUTLOOK_CATEGORIES = {
  type: "outlook",

  // Outlook native category isimleri
  categories: [
    { name: "Finance",      color: "preset1" },
    { name: "Invoices",     color: "preset1" },
    { name: "Payments",     color: "preset1" },

    { name: "Security",     color: "preset3" },
    { name: "Spam",         color: "preset3" },
    { name: "Phishing",     color: "preset3" },

    { name: "Marketing",    color: "preset6" },
    { name: "Newsletters",  color: "preset6" },
    { name: "Promotions",   color: "preset6" },

    { name: "Commerce",     color: "preset4" },
    { name: "Orders",       color: "preset4" },
    { name: "Shipping",     color: "preset4" },
    { name: "Returns",      color: "preset4" },

    { name: "Support",      color: "preset7" },
    { name: "Tickets",      color: "preset7" },

    { name: "DevOps",       color: "preset7" },
    { name: "Tools",        color: "preset7" },

    { name: "HR",           color: "preset2" },
    { name: "Application",  color: "preset2" },

    { name: "Legal",        color: "preset2" },
    { name: "System",       color: "preset2" },
    { name: "Personal",     color: "preset5" },
  ],

  // özel durumlar
  special: {
    awaiting: { name: "Awaiting Reply", color: "preset0" },
    review:   { name: "Review",         color: "preset8" },
  }
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
  `${process.env.FRONTEND_URL}/auth/callback?status=success&provider=gmail&email=${encodeURIComponent(email)}`
);

  } catch (e) {
    console.error("[/auth/google/callback] error:", e);
    return res.redirect(
      `${process.env.FRONTEND_URL}/auth/callback?status=error&msg=${encodeURIComponent(e.message)}`
    );
  }
}





// =========================
// Microsoft OAuth (Outlook)
// =========================
function mustMs(name) {
  if (!process.env[name]) throw new Error(`${name} is missing`);
}

const MS_SCOPES = [
  "openid",
  "email",
  "profile",
  "offline_access",
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Mail.ReadWrite",
];



function decodeJwtPayload(token) {
  try {
    const part = token.split(".")[1];
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function startMicrosoftConnect(req, res) {
  try {
    must("JWT_SECRET");
    mustMs("MICROSOFT_CLIENT_ID");
    mustMs("MICROSOFT_REDIRECT_URI");

    const userId = String(req.query.userId || "");
    if (!mongoose.isValidObjectId(userId))
      return res.status(400).send("Invalid userId");

    const state = jwt.sign(
      { userId, mode: "connect", provider: "outlook" },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    const authorizeUrl =
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";

    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      response_type: "code",
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI,
      response_mode: "query",
      scope: MS_SCOPES.join(" "),
      state,
      prompt: "select_account",
    });

    return res.redirect(`${authorizeUrl}?${params.toString()}`);
  } catch (e) {
    console.error("[/auth/microsoft] error:", e);
    return res.status(500).send(`[oauth] ${e.message}`);
  }
}

export async function microsoftCallback(req, res) {
  try {
    must("JWT_SECRET");
    mustMs("MICROSOFT_CLIENT_ID");
    mustMs("MICROSOFT_CLIENT_SECRET");
    mustMs("MICROSOFT_REDIRECT_URI");
    must("FRONTEND_URL");

    const { code, state } = req.query;
    const decoded = jwt.verify(String(state), process.env.JWT_SECRET);
    const userId = decoded?.userId;

    if (!mongoose.isValidObjectId(userId))
      throw new Error("Invalid userId in state");

    // 1) Exchange code -> tokens
    const tokenUrl =
      "https://login.microsoftonline.com/common/oauth2/v2.0/token";

    const form = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      code: String(code),
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI,
      grant_type: "authorization_code",
      scope: MS_SCOPES.join(" "),
    });

    const tokenRes = await axios.post(tokenUrl, form.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const {
      access_token,
      refresh_token,
      expires_in,
      id_token,
    } = tokenRes.data || {};

    if (!access_token) throw new Error("No access_token from Microsoft");

    // 2) Get user info (email)
    const meRes = await axios.get("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const msUser = meRes.data || {};
    const email = (msUser.mail || msUser.userPrincipalName || "").toLowerCase();
    const microsoftId = msUser.id || null;

    if (!email) throw new Error("Email not found from Microsoft /me");

    const idPayload = id_token ? decodeJwtPayload(id_token) : null;
    const tenantId = idPayload?.tid || null;

    // 3) Upsert MailAccount (provider: outlook)
    const now = Date.now();
    const expiresAt = expires_in ? new Date(now + Number(expires_in) * 1000) : null;

    const account = await MailAccount.findOneAndUpdate(
      { userId, provider: "outlook", email },
      {
        $set: {
          userId,
          provider: "outlook",
          email,
          microsoftId,
          tenantId,
          accessToken: access_token || null,
          refreshToken: refresh_token || null,
          expiresAt,
          status: "active",
          isActive: true,
        },
      },
      { upsert: true, new: true }
    );

      if (!account.tagsConfig || Object.keys(account.tagsConfig).length === 0) {
        account.tagsConfig = DEFAULT_OUTLOOK_CATEGORIES;
      }

      await account.save();

      await syncOutlookCategoriesFromTagsConfig(account);

      try {
        await createOrRenewOutlookSubscription(account);
      } catch (e) {
        console.error(
          "[outlook] subscription create failed:",
          e?.response?.data || e.message
        );
      }

    return res.redirect(
      `${process.env.FRONTEND_URL}/auth/callback?status=success&provider=outlook&email=${encodeURIComponent(email)}`
    );

  } catch (e) {
    console.error("[/auth/microsoft/callback] error:", e);
    return res.redirect(
      `${process.env.FRONTEND_URL}/auth/callback?status=error&msg=${encodeURIComponent(e.message)}`
    );
  }
}
