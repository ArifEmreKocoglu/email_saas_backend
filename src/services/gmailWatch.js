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

  // Token hâlâ geçerliyse dokunma
  if (acc.expiresAt && acc.expiresAt.getTime() > now) {
    console.log("[rewatch] token still valid:", acc.email);
    return;
  }

  console.log("[rewatch] refreshing token for:", acc.email);

  try {
    const { data } = await axios.post("https://oauth2.googleapis.com/token", {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: acc.refreshToken,
      grant_type: "refresh_token",
    });

    acc.accessToken = data.access_token;
    acc.expiresAt = new Date(now + (data.expires_in || 3600) * 1000);
    await acc.save();

    console.log("[rewatch] token refresh OK:", acc.email);
  } catch (e) {
    console.error(
      "[rewatch] token refresh ERROR:",
      acc.email,
      "status:",
      e?.response?.status,
      "data:",
      e?.response?.data || e.message
    );
    throw e; // dışarı fırlasın ki rewatchJob fail loglasın
  }
}

export async function rewatchGmailAccount(acc) {
  // 1️⃣ Token taze olsun
  await ensureValidToken(acc);

  const auth = oauthClient();
  auth.setCredentials({
    access_token: acc.accessToken,
    refresh_token: acc.refreshToken,
  });

  const gmail = google.gmail({ version: "v1", auth });

  try {
    // 2️⃣ Eski watch'ı durdurmaya çalış (hata verirse sadece uyarı)
    try {
      await gmail.users.stop({ userId: "me" });
    } catch (e) {
      console.warn(
        "[rewatch] users.stop warn:",
        acc.email,
        e?.response?.data || e.message
      );
    }

    // 3️⃣ Yeni watch isteği
    const res = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: process.env.GMAIL_PUBSUB_TOPIC,
        labelIds: ["INBOX"],
        labelFilterAction: "include",
      },
    });

    const expirationMs = res.data.expiration
      ? Number(res.data.expiration)
      : null;

    acc.historyId = String(res.data.historyId || acc.historyId || "");
    acc.lastHistoryId = acc.historyId;
    acc.watchExpiration = expirationMs ? new Date(expirationMs) : null;
    await acc.save();

    console.log(
      "[rewatch] watch ok:",
      acc.email,
      "exp:",
      acc.watchExpiration ? acc.watchExpiration.toISOString() : "-"
    );

    return {
      historyId: acc.historyId,
      watchExpiration: acc.watchExpiration,
    };
  } catch (e) {
    console.error(
      "[rewatch] watch 400+ error:",
      acc.email,
      "status:",
      e?.response?.status,
      "data:",
      e?.response?.data || e.message
    );
    throw e;
  }
}