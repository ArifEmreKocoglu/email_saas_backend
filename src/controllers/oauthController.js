import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { google } from "googleapis";
import MailAccount from "../models/MailAccount.js";
import User from "../models/User.js";

function must(name) {
  if (!process.env[name]) throw new Error(`${name} is missing`);
}

const SCOPES = ["openid","email","profile","https://www.googleapis.com/auth/gmail.modify"];

function oauthClient() {
  must("GOOGLE_CLIENT_ID"); must("GOOGLE_CLIENT_SECRET"); must("GOOGLE_REDIRECT_URI");
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
    if (!mongoose.isValidObjectId(userId)) return res.status(400).send("Invalid userId");

    const state = jwt.sign({ userId, mode: "connect" }, process.env.JWT_SECRET, { expiresIn: "15m" });
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
          userId, provider: "gmail", email, googleId,
          accessToken: tokens.access_token || null,
          refreshToken: tokens.refresh_token || null,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          status: "active",
        },
      },
      { upsert: true, new: true }
    );

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
    account.watchExpiration = watchRes.data.expiration ? new Date(Number(watchRes.data.expiration)) : null;
    await account.save();

    return res.redirect(`${process.env.FRONTEND_URL}/auth/callback?status=success&email=${encodeURIComponent(email)}`);
  } catch (e) {
    console.error("[/auth/google/callback] error:", e);
    return res.redirect(`${process.env.FRONTEND_URL}/auth/callback?status=error&msg=${encodeURIComponent(e.message)}`);
  }
}