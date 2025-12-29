// controllers/oauthAuthController.js
import jwt from "jsonwebtoken";
import axios from "axios";
import { google } from "googleapis";
import User from "../models/User.js";

/* -------------------------------------------------
   Helpers
------------------------------------------------- */
function must(name) {
  if (!process.env[name]) throw new Error(`${name} is missing`);
}

function setSessionCookie(res, userId) {
  const token = jwt.sign(
    { uid: String(userId) },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );

  res.cookie("sid", token, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
  });
}

/* -------------------------------------------------
   GOOGLE LOGIN / SIGNUP
------------------------------------------------- */

const GOOGLE_SCOPES = ["openid", "email", "profile"];

function googleClient() {
  must("GOOGLE_CLIENT_ID");
  must("GOOGLE_CLIENT_SECRET");
  must("GOOGLE_REDIRECT_URI_LOGIN");

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI_LOGIN
  );
}

export async function startGoogleLogin(req, res) {
  try {
    must("JWT_SECRET");

    const state = jwt.sign(
      { mode: "login", provider: "google" },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    const client = googleClient();
    const url = client.generateAuthUrl({
      scope: GOOGLE_SCOPES,
      state,
      prompt: "select_account",
    });

    return res.redirect(url);
  } catch (e) {
    console.error("[google login start]", e);
    return res.status(500).send(e.message);
  }
}

export async function googleLoginCallback(req, res) {
  try {
    must("JWT_SECRET");
    must("FRONTEND_URL");

    const { code, state } = req.query;
    jwt.verify(state, process.env.JWT_SECRET);

    const client = googleClient();
    const { tokens } = await client.getToken(String(code));
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();

    const email = me.data.email?.toLowerCase();
    const googleId = me.data.id;
    const name = me.data.name || "";
    const picture = me.data.picture || "";

    if (!email) throw new Error("Google email not found");

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        email,
        name,
        picture,
        authType: "google",
        googleId,
      });
    } else if (!user.googleId) {
      user.googleId = googleId;
      user.authType = "google";
      await user.save();
    }

    setSessionCookie(res, user._id);
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  } catch (e) {
    console.error("[google login callback]", e);
    return res.redirect(
      `${process.env.FRONTEND_URL}/auth/login?error=google_failed`
    );
  }
}

/* -------------------------------------------------
   MICROSOFT LOGIN / SIGNUP
------------------------------------------------- */

const MS_SCOPES = ["openid", "email", "profile"];

export async function startMicrosoftLogin(req, res) {
  try {
    must("JWT_SECRET");
    must("MICROSOFT_CLIENT_ID");
    must("MICROSOFT_REDIRECT_URI_LOGIN");

    const state = jwt.sign(
      { mode: "login", provider: "microsoft" },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      response_type: "code",
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI_LOGIN,
      response_mode: "query",
      scope: MS_SCOPES.join(" "),
      state,
      prompt: "select_account",
    });

    return res.redirect(
      `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`
    );
  } catch (e) {
    console.error("[ms login start]", e);
    return res.status(500).send(e.message);
  }
}

export async function microsoftLoginCallback(req, res) {
  try {
    must("JWT_SECRET");
    must("FRONTEND_URL");
    must("MICROSOFT_CLIENT_ID");
    must("MICROSOFT_CLIENT_SECRET");
    must("MICROSOFT_REDIRECT_URI_LOGIN");

    const { code, state } = req.query;
    jwt.verify(state, process.env.JWT_SECRET);

    const tokenRes = await axios.post(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        code,
        redirect_uri: process.env.MICROSOFT_REDIRECT_URI_LOGIN,
        grant_type: "authorization_code",
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const accessToken = tokenRes.data.access_token;
    if (!accessToken) throw new Error("No MS access token");

    const meRes = await axios.get(
      "https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const email = (meRes.data.mail || meRes.data.userPrincipalName || "").toLowerCase();
    if (!email) throw new Error("Microsoft email not found");

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        email,
        authType: "microsoft",
      });
    } else if (user.authType !== "microsoft") {
      user.authType = "microsoft";
      await user.save();
    }

    setSessionCookie(res, user._id);
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  } catch (e) {
    console.error("[ms login callback]", e);
    return res.redirect(
      `${process.env.FRONTEND_URL}/auth/login?error=microsoft_failed`
    );
  }
}
