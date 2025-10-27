import axios from "axios";
import { google } from "googleapis";

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
}

export async function ensureValidToken(acc) {
  const now = Date.now();
  if (acc.expiresAt && acc.expiresAt.getTime() <= now) {
    const { data } = await axios.post("https://oauth2.googleapis.com/token", {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: acc.refreshToken,
      grant_type: "refresh_token",
    });
    acc.accessToken = data.access_token;
    acc.expiresAt = new Date(now + (data.expires_in || 3600) * 1000);
    await acc.save();
  }
}

export async function rewatchGmailAccount(acc) {
  await ensureValidToken(acc);
  const auth = oauthClient();
  auth.setCredentials({ access_token: acc.accessToken, refresh_token: acc.refreshToken });

  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: process.env.GMAIL_PUBSUB_TOPIC,
      labelIds: ["INBOX"],
      labelFilterAction: "include",
    },
  });

  acc.historyId = String(res.data.historyId || acc.historyId || "");
  acc.lastHistoryId = acc.historyId;
  acc.watchExpiration = res.data.expiration ? new Date(Number(res.data.expiration)) : null;
  await acc.save();

  return {
    historyId: acc.historyId,
    watchExpiration: acc.watchExpiration,
  };
}