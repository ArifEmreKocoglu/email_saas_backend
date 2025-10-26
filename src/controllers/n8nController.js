import axios from "axios";
import { google } from "googleapis";
import User from "../models/User.js";

export const handleGmailPush = async (req, res) => {
  try {
    console.log("📨 Pub/Sub Notification Received:");
    console.log(JSON.stringify(req.body, null, 2));

    const { message } = req.body;
    if (!message?.data) {
      return res.status(400).json({ error: "Invalid Pub/Sub payload" });
    }

    console.log("1");

    // Pub/Sub base64 decode
    const decoded = JSON.parse(Buffer.from(message.data, "base64").toString("utf8"));
    const { emailAddress, historyId } = decoded;

    console.log("2");

    // 🧠 Önce kullanıcıyı bul
    const user = await User.findOne({ email: emailAddress });
    if (!user) return res.status(404).json({ error: "User not found" });

    console.log("3");

    // 🆕 Eğer lastHistoryId yoksa sadece kaydet ve çık
    if (!user.lastHistoryId) {
      user.lastHistoryId = historyId;
      await user.save();
      console.log("🆕 Initial historyId saved:", historyId);
      return res.status(200).json({ status: "initialized" });
    }

    // 🔁 Access token süresi dolduysa yenile
    if (user.expiresAt && user.expiresAt < new Date()) {
      const { data } = await axios.post("https://oauth2.googleapis.com/token", {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: user.refreshToken,
        grant_type: "refresh_token",
      });
      user.accessToken = data.access_token;
      user.expiresAt = new Date(Date.now() + data.expires_in * 1000);
      await user.save();
    }

    console.log("5");

    // Gmail API client
    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oAuth2Client.setCredentials({
      access_token: user.accessToken,
      refresh_token: user.refreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });


    const diff = Date.now() - new Date(user.updatedAt).getTime();
    const ONE_DAY = 1000 * 60 * 60 * 24;
    if (diff > ONE_DAY) {
      console.log("⚠️ lastHistoryId too old, resetting to current Gmail state.");

      const profile = await gmail.users.getProfile({ userId: "me" });
      user.lastHistoryId = profile.data.historyId;
      await user.save();

      return res.status(200).json({ status: "reinitialized" });
    }

    // Gmail history'den yeni mailleri al
    const history = await gmail.users.history.list({
      userId: "me",
      startHistoryId: user.lastHistoryId,
      historyTypes: ["messageAdded"],
    });


    console.log("6");

    if (!history.data.history) {
      console.log("⚠️ No new messages found.");
      return res.status(200).json({ status: "ok" });
    }

    console.log("7");

    for (const h of history.data.history || []) {
      console.log("🧩 Processing history chunk:", h.id || "(no id)");

      for (const msg of h.messages || []) {
        console.log("📬 Fetching message:", msg.id);

        const fullMessage = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full",
        });

        console.log("🧠 Message fetched, preparing webhook payload...");

        const headers = fullMessage.data.payload.headers;
        const subject = headers.find((h) => h.name === "Subject")?.value || "";
        const from = headers.find((h) => h.name === "From")?.value || "";
        const to = headers.find((h) => h.name === "To")?.value || "";
        const snippet = fullMessage.data.snippet;

        // 🧩 Yeni: Mail gövdesini (HTML + text) ve attachments’ı decode et
        const parts = fullMessage.data.payload.parts || [];
        let html = "";
        let text = "";
        let attachments = [];

        const extractParts = (partsArr) => {
          for (const part of partsArr) {
            if (part.mimeType === "text/html" && part.body?.data) {
              html += Buffer.from(part.body.data, "base64").toString("utf8");
            } else if (part.mimeType === "text/plain" && part.body?.data) {
              text += Buffer.from(part.body.data, "base64").toString("utf8");
            } else if (part.filename && part.body?.attachmentId) {
              attachments.push({
                fileName: part.filename,
                mimeType: part.mimeType,
                size: part.body?.size || 0,
                attachmentId: part.body.attachmentId,
              });
            }
            if (part.parts) extractParts(part.parts);
          }
        };
        extractParts(parts);

        // 📦 Payload oluştur
        const payload = {
          emailAddress,
          messageId: msg.id,
          subject,
          from,
          to,
          snippet,
          historyId,
          html,
          text,
          attachments,
        };

        console.log("🚀 Sending to n8n webhook:", payload);

        try {
          const n8nRes = await axios.post(
            "https://n8n.entrfy.com/webhook/mail-ingest-v0",
            payload,
            { headers: { "Content-Type": "application/json" } }
          );
          console.log("✅ Sent to n8n successfully:", n8nRes.status, n8nRes.data);
        } catch (err) {
          console.error(
            "❌ n8n webhook error:",
            err.response?.status,
            err.response?.data || err.message
          );
        }
      }
    }

    // 📌 Güncel historyId'yi kaydet
    user.lastHistoryId = historyId;
    await user.save();

    res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error("❌ Error processing Pub/Sub push:", error.message);
    res.status(500).json({ error: error.message });
  }
};
