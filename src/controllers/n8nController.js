import axios from "axios";
import { google } from "googleapis";
import MailAccount from "../models/MailAccount.js";

// ---- helpers ----
function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
}
function header(headers = [], name = "") {
  const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}
function extractParts(payload) {
  let html = "", text = "";
  const attachments = [];
  const walk = (part) => {
    if (!part) return;
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
    if (part.parts) part.parts.forEach(walk);
  };
  walk(payload);
  return { html, text, attachments };
}

// ---- Pub/Sub push endpoint ----
export const handleGmailPush = async (req, res) => {
  try {
    const msg = req.body?.message;
    if (!msg?.data) return res.status(204).end(); // erken ACK

    const decoded = JSON.parse(Buffer.from(msg.data, "base64").toString("utf8"));
    const { emailAddress, historyId } = decoded || {};

    // her koşulda ACK ver, işleme arkada devam et
    res.status(204).end();
    if (!emailAddress || !historyId) return;

    // 1) Hesap bazlı çalış
    const acc = await MailAccount.findOne({ provider: "gmail", email: emailAddress });
    if (!acc) { console.warn("[gmail push] MailAccount yok:", emailAddress); return; }
    if (acc.status !== "active" || !acc.isActive) { console.log("[gmail push] paused/deleted:", emailAddress); return; }

    // 2) Token yenileme (hesap)
    const now = Date.now();
    if (acc.expiresAt && acc.expiresAt.getTime() <= now) {
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
      } catch (err) {
        console.error("[token refresh] error:", err?.response?.data || err.message);
        return;
      }
    }

    const auth = oauthClient();
    auth.setCredentials({ access_token: acc.accessToken, refresh_token: acc.refreshToken });
    const gmail = google.gmail({ version: "v1", auth });

    // 3) History akışı (sayfalama + dedupe)
    const startHistoryId = String(acc.lastHistoryId || acc.historyId || historyId);
    let pageToken;
    const seen = new Set();

    do {
      let histRes;
      try {
        histRes = await gmail.users.history.list({
          userId: "me",
          startHistoryId,
          historyTypes: ["messageAdded"],
          pageToken,
        });
      } catch (err) {
        // 4) "HistoryId too old" reset
        const reason = err?.errors?.[0]?.reason || err?.response?.data?.error?.errors?.[0]?.reason;
        if (err?.code === 404 || reason === "historyIdInvalid") {
          console.warn("[history] too old → reset to current profile.historyId");
          const prof = await gmail.users.getProfile({ userId: "me" });
          acc.lastHistoryId = String(prof.data.historyId);
          await acc.save();
          return;
        }
        console.error("[history.list] error:", err?.response?.data || err.message);
        return;
      }

      const chunks = histRes.data.history || [];
      for (const h of chunks) {
        for (const m of h.messages || []) {
          if (seen.has(m.id)) continue;
          seen.add(m.id);

          const full = await gmail.users.messages.get({ userId: "me", id: m.id, format: "full" });

          const headers = full.data.payload?.headers || [];
          const subject = header(headers, "Subject");
          const from = header(headers, "From");
          const to = header(headers, "To");
          const date = header(headers, "Date");
          const internalDate = Number(full.data.internalDate) || Date.now();
          const snippet = full.data.snippet || "";

          const { html, text, attachments } = extractParts(full.data.payload);

          const payload = {
            emailAddress,
            accountId: acc._id.toString(),
            messageId: m.id,
            threadId: full.data.threadId,
            historyId: String(historyId),
            subject,
            from,
            to,
            date,
            internalDate,
            snippet,
            headers,
            html,
            text,
            attachments,
          };

          try {
            await axios.post(
              `${process.env.N8N_URL}/webhook/mail-ingest-v1`,
              payload,
              { headers: { "Content-Type": "application/json" } }
            );
            console.log("✅ sent to n8n:", m.id);
          } catch (postErr) {
            console.error("[n8n webhook] error:",
              postErr?.response?.status,
              postErr?.response?.data || postErr.message
            );
          }
        }
      }

      pageToken = histRes.data.nextPageToken;
    } while (pageToken);

    // 5) Son historyId’yi hesapta tut
    acc.lastHistoryId = String(historyId);
    await acc.save();
  } catch (e) {
    console.error("[gmail push] fatal:", e);
    // ACK verildi; sadece logla.
  }
};