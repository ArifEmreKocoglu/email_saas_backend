import axios from "axios";
import MailAccount from "../models/MailAccount.js";

/* -------------------------------------------------
   Helpers
-------------------------------------------------- */
async function refreshMicrosoftToken(account) {
  const res = await axios.post(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: account.refreshToken,
      scope: "https://graph.microsoft.com/.default offline_access",
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  const data = res.data;
  if (!data.access_token) {
    throw new Error("Failed to refresh Outlook token");
  }

  account.accessToken = data.access_token;
  account.expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
  await account.save();
}

/* -------------------------------------------------
   CREATE OUTLOOK DRAFT
-------------------------------------------------- */
export async function createOutlookDraft({
  userId,
  email,
  to,
  subject,
  body,
  threadId = null, // Outlook conversationId
}) {
  // 1️⃣ MailAccount
  const account = await MailAccount.findOne({
    userId,
    email: email.toLowerCase(),
    provider: "outlook",
    status: "active",
  });

  if (!account) {
    throw new Error("Active Outlook account not found");
  }

  // 2️⃣ Token refresh
  const now = Date.now();
  if (account.expiresAt && account.expiresAt.getTime() <= now) {
    await refreshMicrosoftToken(account);
  }

  // 3️⃣ Draft payload
  const payload = {
    subject: `Re: ${subject}`,
    body: {
      contentType: "Text",
      content: body,
    },
    toRecipients: [
      {
        emailAddress: { address: to },
      },
    ],
  };

  // Outlook reply thread (conversation)
  if (threadId) {
    payload.conversationId = threadId;
  }

  // 4️⃣ Create draft
  const res = await axios.post(
    "https://graph.microsoft.com/v1.0/me/messages",
    payload,
    {
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  return {
    draftId: res.data.id,
    threadId: res.data.conversationId || threadId || null,
  };
}
