import { google } from "googleapis";
import MailAccount from "../models/MailAccount.js";

/* -------------------------------------------------
   Helpers
-------------------------------------------------- */
function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
}

function buildRawMessage({ to, subject, body, threadId }) {
  const headers = [
    `To: ${to}`,
    `Subject: Re: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
  ];

  const msg = headers.join("\r\n") + "\r\n\r\n" + body;

  const encoded = Buffer.from(msg)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return {
    raw: encoded,
    threadId,
  };
}

/* -------------------------------------------------
   CREATE GMAIL DRAFT
-------------------------------------------------- */
export async function createGmailDraft({
  userId,
  email,
  to,
  subject,
  body,
  threadId = null,
}) {
  // 1️⃣ MailAccount
  const account = await MailAccount.findOne({
    userId,
    email: email.toLowerCase(),
    provider: "gmail",
    status: "active",
  });

  if (!account) {
    throw new Error("Active Gmail account not found");
  }

  // 2️⃣ Token refresh (güvenli)
  const now = Date.now();
  if (account.expiresAt && account.expiresAt.getTime() <= now) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: account.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const data = await res.json();
    if (!data.access_token) {
      throw new Error("Failed to refresh Gmail token");
    }

    account.accessToken = data.access_token;
    account.expiresAt = new Date(
      Date.now() + (data.expires_in || 3600) * 1000
    );
    await account.save();
  }

  // 3️⃣ Gmail client
  const auth = createOAuthClient();
  auth.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
  });

  const gmail = google.gmail({ version: "v1", auth });

  // 4️⃣ Raw draft
  const message = buildRawMessage({
    to,
    subject,
    body,
    threadId,
  });

  // 5️⃣ Draft create
  const draftRes = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message,
    },
  });

  return {
    draftId: draftRes.data.id,
    threadId: draftRes.data.message?.threadId || threadId || null,
  };
}
