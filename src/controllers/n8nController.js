import axios from "axios";
import { google } from "googleapis";
import MailAccount from "../models/MailAccount.js";
import { upsertTemplateFromMessage } from "../services/templateService.js"; // 🆕

// -------------------------------------------------------------
// 🔐 Basit hesap-bazlı throttle + lock (in-memory)
//
// Amaç:
//  - Aynı email hesabı için aynı anda birden fazla push işlenmesin
//  - Çok sık gelen (Pub/Sub flood) push'lar Gmail API ve n8n'i boğmasın
//
// Not:
//  - Tek Node.js process / tek EC2 için gayet yeterli.
//  - İlerde çoklu worker/proc kullanırsan Redis gibi merkezi bir store'a
//    taşıyabilirsin.
// -------------------------------------------------------------

// Aynı hesabı en az kaç ms aralıkla işleyelim?
const ACCOUNT_THROTTLE_MS = 5000; // 5 saniye

// email -> { lastRun: number, running: boolean }
const accountState = new Map();

/**
 * Bu push'u işleyelim mi, yoksa atlayalım mı?
 * - running = true ise: o hesap için başka bir işlem devam ediyor → skip
 * - lastRun çok yeni ise: throttle → skip
 * - aksi halde: running=true yapıp izin ver
 */
function shouldSkipPush(emailAddress) {
  const now = Date.now();
  const key = String(emailAddress || "").toLowerCase();
  if (!key) return { skip: true, reason: "no-email" };

  let state = accountState.get(key);
  if (!state) {
    state = { lastRun: 0, running: false };
    accountState.set(key, state);
  }

  // Aynı hesap için halihazırda bir push işleniyorsa → bu push'u atla
  if (state.running) {
    return { skip: true, reason: "already-running" };
  }

  // Çok kısa süre içinde tekrar gelen push'u atla.
  // Gmail historyId mekanizması sayesinde bir sonraki turda
  // geriden yakalarız, veri kaybı olmaz.
  if (now - state.lastRun < ACCOUNT_THROTTLE_MS) {
    return { skip: true, reason: "throttled" };
  }

  // Bu push için işlem izni ver, lock'la
  state.running = true;
  state.lastRun = now;
  accountState.set(key, state);
  return { skip: false, reason: null };
}

/**
 * İşlem bittikten sonra (başarılı veya hatalı) lock'u bırak.
 */
function releasePushLock(emailAddress) {
  const key = String(emailAddress || "").toLowerCase();
  const state = accountState.get(key);
  if (state) {
    state.running = false;
    accountState.set(key, state);
  }
}

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

    // 🔐 Basit hesap-bazlı throttle + lock
    const { skip, reason } = shouldSkipPush(emailAddress);
    if (skip) {
      console.log("[gmail push] skipped for", emailAddress, "reason:", reason);
      return;
    }

    try {
      // 1) Hesap bazlı çalış
      const acc = await MailAccount.findOne({ provider: "gmail", email: emailAddress });
      if (!acc) { console.warn("[gmail push] MailAccount yok:", emailAddress); return; }
      if (acc.status !== "active" || !acc.isActive) { console.log("[gmail push] paused/deleted:", emailAddress); return; }
      console.log("5");
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
          // 4) "HistoryId too old" reset
          const reason = err?.errors?.[0]?.reason || err?.response?.data?.error?.errors?.[0]?.reason;
          console.log("14");
          if (err?.code === 404 || reason === "historyIdInvalid") {
            console.warn("[history] too old → reset to current profile.historyId");
            const prof = await gmail.users.getProfile({ userId: "me" });
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
          // 🔥 Sadece yeni eklenen mesajları dikkate al
          if (!h.messagesAdded) continue;
        
          for (const added of h.messagesAdded) {
            const m = added.message;
            if (!m || seen.has(m.id)) continue;
            seen.add(m.id);
        
            console.log("m-label", m.labelIds);
            console.log("m", m);
            // 🔥 Sadece INBOX etiketli mesajları işle
            if (!m.labelIds.includes("INBOX")) {
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
    } finally {
      // 🔓 Hesap için lock'u bırak
      releasePushLock(emailAddress);
    }
  } catch (e) {
    console.error("[gmail push] fatal:", e);
    // ACK verildi; sadece logla.
  }
};


// ---- n8n LLM classification sonucu ----
export const handleClassificationResult = async (req, res) => {
  try {
    const {
      accountId,         // MailAccount._id (string)
      emailAddress,      // "foo@gmail.com"
      normalizedMessage, // n8n'deki normalize_and_hash çıktısı
      decision,          // decision_llm çıktısı
    } = req.body || {};

    if (!accountId || !emailAddress || !normalizedMessage || !decision) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // UserId'yi güvenli almak için MailAccount'tan çekiyoruz
    let account = null;

    // 1️⃣ Önce accountId ile dene
    if (accountId) {
      try {
        account = await MailAccount.findById(accountId);
      } catch (e) {
        console.error(
          "[handleClassificationResult] invalid accountId:",
          accountId,
          e.message
        );
      }
    }

    // 2️⃣ Bulunamazsa email + provider ile fallback
    if (!account && emailAddress) {
      account = await MailAccount.findOne({
        email: emailAddress.toLowerCase(),
        provider: "gmail",
        status: { $ne: "deleted" },
      });
    }

    if (!account) {
      console.error("[handleClassificationResult] MailAccount not found for", {
        accountId,
        emailAddress,
      });
      return res.status(404).json({ error: "MailAccount not found" });
    }

    // Email uyuşmuyorsa sadece logla, yine de devam et
    if (
      emailAddress &&
      account.email &&
      account.email.toLowerCase() !== emailAddress.toLowerCase()
    ) {
      console.warn("[handleClassificationResult] email mismatch", {
        bodyEmail: emailAddress,
        accountEmail: account.email,
      });
    }

    // LLM kararından labelPath'i çek
    const labelPath =
      decision.final_label ||
      decision.primary_label ||
      decision.primary_label_path ||
      null;

    if (!labelPath) {
      return res.status(400).json({ error: "Missing labelPath in decision" });
    }

    const replyNeeded =
      !!decision.reply_needed ||
      !!decision.replyNeeded ||
      false;

    console.log("[ClassificationResult] fields", {
      from_addr: normalizedMessage.from_addr,
      link_domains: normalizedMessage.link_domains,
    });

    // 🧠 Template hafızasına yaz
    await upsertTemplateFromMessage({
      userId: account.userId,
      email: account.email,
      message: normalizedMessage,
      labelPath,
      replyNeeded,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("[handleClassificationResult] error:", err);
    return res.status(500).json({ error: err.message });
  }
};