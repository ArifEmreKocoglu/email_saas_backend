import axios from "axios";
import { google } from "googleapis";
import MailAccount from "../models/MailAccount.js";

function oauth() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
}

// SADECE INBOX için, MailAccount token'ı ile watch kurar
export const gmailWatchByAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const acc = await MailAccount.findById(accountId);
    if (!acc) return res.status(404).json({ error: "MailAccount not found" });

    // Token gerekirse yenile
    if (!acc.expiresAt || acc.expiresAt.getTime() <= Date.now() + 60 * 1000) {
      const { data } = await axios.post("https://oauth2.googleapis.com/token", {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: acc.refreshToken,
        grant_type: "refresh_token",
      });
      acc.accessToken = data.access_token;
      acc.expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
      await acc.save();
    }

    const auth = oauth();
    auth.setCredentials({
      access_token: acc.accessToken,
      refresh_token: acc.refreshToken,
    });
    const gmail = google.gmail({ version: "v1", auth });

    // Eski watch'ı idempotent kapat (varsa)
    try { await gmail.users.stop({ userId: "me" }); } catch { /* ignore */ }

    // YENİ watch — SADECE INBOX
    const { data } = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: process.env.GMAIL_TOPIC,   // projects/.../topics/gmail-inbox-watch
        labelFilterAction: "include",
        labelIds: ["INBOX"],                  // 🔒 sadece INBOX
      },
    });

    // DB güncelle
    acc.watchExpiration = new Date(Number(data.expiration));
    acc.historyId = String(data.historyId);
    acc.labelMap = { ...(acc.labelMap || {}), lastHistoryId: String(data.historyId) };
    acc.status = "active";
    acc.isActive = true;
    acc.updatedAt = new Date();
    await acc.save();

    res.json({
      ok: true,
      accountId: acc._id,
      watchExpiration: acc.watchExpiration,
      historyId: acc.historyId,
    });
  } catch (err) {
    console.error("Watch error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
};