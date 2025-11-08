import axios from "axios";
import { google } from "googleapis";
import MailAccount from "../models/MailAccount.js";

/* ======================== helpers ======================== */
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
function escapeRegex(str = "") {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeGmail(email = "") {
  const e = (email || "").trim().toLowerCase();
  if (!e.includes("@")) return e;
  let [local, domain] = e.split("@");
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") {
    local = local.replace(/\./g, "").replace(/\+.*/, "");
  }
  return `${local}@${domain}`;
}
/* ========================================================= */

/**
 * Pub/Sub push endpoint
 */
export const handleGmailPush = async (req, res) => {
  try {
    console.log("📨 Push HIT", {
      path: req.path,
      ip: req.headers["x-forwarded-for"] || req.ip,
      ua: req.headers["user-agent"],
    });

    const msg = req.body?.message;
    if (!msg?.data) return res.status(204).end(); // erken ACK

    console.log("2");
    const decoded = JSON.parse(Buffer.from(msg.data, "base64").toString("utf8"));
    const { emailAddress, historyId } = decoded || {};
    console.log("3");

    // her koşulda ACK ver, işleme arkada devam et
    res.status(204).end();
    if (!emailAddress || !historyId) return;

    console.log("4");

    // === E-posta eşleştirme: case-insensitive + gmail dot/plus normalize ===
    const safeEmail = (emailAddress || "").trim().toLowerCase();
    const normEmail = normalizeGmail(safeEmail);
    const emailOr = [
      { email: new RegExp(`^${escapeRegex(safeEmail)}$`, "i") },
      { email: new RegExp(`^${escapeRegex(normEmail)}$`, "i") },
    ];
    console.log("[PUSH] emailAddress:", safeEmail, "→ normalized:", normEmail, "historyId:", historyId);

    // 1) Hesap bazlı çalış
    const acc = await MailAccount.findOne({ provider: "gmail", $or: emailOr });
    if (!acc) { console.warn("[gmail push] MailAccount yok:", safeEmail, "norm:", normEmail); return; }
    if (acc.status !== "active" || !acc.isActive) { console.log("[gmail push] paused/deleted:", acc.email); return; }

    // ⬇️ SAĞLIK PİNGİ
    await MailAccount.updateOne({ _id: acc._id }, { $set: { lastWebhookAt: new Date() } });

    // 2) Token yenileme (hesap)
    const now = Date.now();
    if (acc.expiresAt && acc.expiresAt.getTime() <= now) {
      console.log("7");
      try {
        const { data } = await axios.post("https://oauth2.googleapis.com/token", {
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: acc.refreshToken,
          grant_type: "refresh_token",
        });
        console.log("6");
        acc.accessToken = data.access_token;
        acc.expiresAt = new Date(now + (data.expires_in || 3600) * 1000);
        await acc.save();
      } catch (err) {
        console.error("[token refresh] error:", err?.response?.data || err.message);
        return;
      }
    }

    const auth = oauthClient();
    console.log("8");
    auth.setCredentials({ access_token: acc.accessToken, refresh_token: acc.refreshToken });
    console.log("9");
    const gmail = google.gmail({ version: "v1", auth });
    console.log("10");

    // 3) History akışı (sayfalama + dedupe)
    const startHistoryId = String(acc.lastHistoryId || acc.historyId || historyId);
    let pageToken;
    const seen = new Set();
    console.log("11");

    do {
      let histRes;
      try {
        histRes = await gmail.users.history.list({
          userId: "me",
          startHistoryId,
          historyTypes: ["messageAdded"],
          pageToken,
        });
        console.log("12");
      } catch (err) {
        const reason =
          err?.errors?.[0]?.reason ||
          err?.response?.data?.error?.errors?.[0]?.reason;
        console.log("14");
        if (err?.code === 404 || reason === "historyIdInvalid") {
          console.warn("[history] too old → reset to current profile.historyId");
          const prof = await gmail.users.getProfile({ userId: "me" });
          console.log("[WATCHED EMAIL]", acc.email, "=>", prof.data.emailAddress);
          acc.lastHistoryId = String(prof.data.historyId);
          await acc.save();
          console.log("12");
          return;
        }
        console.error("[history.list] error:", err?.response?.data || err.message);
        return;
      }

      const chunks = histRes.data.history || [];
      console.log("15");
      for (const h of chunks) {
        if (!h.messagesAdded) continue;

        for (const added of h.messagesAdded) {
          const m = added.message;
          if (!m || seen.has(m.id)) continue;
          seen.add(m.id);

          // 🔒 Sadece INBOX etiketli mesajları işle
          if (!m.labelIds || !m.labelIds.includes("INBOX")) {
            console.log("⏩ skipped non-INBOX message:", m.id);
            continue;
          }

          console.log("📩 new message detected:", m.id);

          const full = await gmail.users.messages.get({
            userId: "me",
            id: m.id,
            format: "full",
          });

          const headers = full.data.payload?.headers || [];
          const subject = header(headers, "Subject");
          const from = header(headers, "From");
          const to = header(headers, "To");
          const date = header(headers, "Date");
          const internalDate = Number(full.data.internalDate) || Date.now();
          const snippet = full.data.snippet || "";

          const { html, text, attachments } = extractParts(full.data.payload);

          const payload = {
            emailAddress: acc.email,
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
            oauth: {
              provider: "gmail",
              email: acc.email,
              accessToken: acc.accessToken,
            },
          };

          try {
            await axios.post(
              `${process.env.N8N_URL}/webhook/mail-ingest-v1`,
              payload,
              { headers: { "Content-Type": "application/json" } }
            );
            console.log("✅ sent to n8n:", m.id);
          } catch (postErr) {
            console.error(
              "[n8n webhook] error:",
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