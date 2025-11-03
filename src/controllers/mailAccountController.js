import mongoose from "mongoose";
import MailAccount from "../models/MailAccount.js";
import { google } from "googleapis";

/**
 * GET /api/mail-accounts?userId=
 * List all mail accounts by user
 */
export async function listByUser(req, res) {
  try {
    const { userId } = req.query;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const items = await MailAccount.find({
      userId,
      status: { $ne: "deleted" },
    })
      .select("email provider status isActive connectedAt watchExpiration lastHistoryId")
      .sort({ connectedAt: -1 })
      .lean();

    return res.json({ items });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

/* ============================================================
   TAG CONFIGURATION CONTROLLERS
   ============================================================ */

// Default labels_config template (matches frontend + n8n)
const DEFAULT_LABEL_TEMPLATE = {
  allowed: [
    { path: "Finance", color: "#fad165" },
    { path: "Finance/Invoices", color: "#fad165" },
    { path: "Finance/Payments", color: "#fad165" },
    { path: "Security", color: "#ffad47" },
    { path: "Security/Spam", color: "#ffad47" },
    { path: "Security/Phishing", color: "#ffad47" },
    { path: "Marketing", color: "#fb4c2f" },
    { path: "Marketing/Newsletters", color: "#fb4c2f" },
    { path: "Marketing/Promotions", color: "#fb4c2f" },
    { path: "Commerce", color: "#16a766" },
    { path: "Commerce/Orders", color: "#16a766" },
    { path: "Commerce/Shipping", color: "#16a766" },
    { path: "Commerce/Returns", color: "#16a766" },
    { path: "Support", color: "#f691b3" },
    { path: "Support/Tickets", color: "#f691b3" },
    { path: "DevOps", color: "#f691b3" },
    { path: "DevOps/Tools", color: "#f691b3" },
    { path: "HR", color: "#43d692" },
    { path: "HR/Application", color: "#43d692" },
    { path: "Legal", color: "#43d692" },
    { path: "System", color: "#43d692" },
    { path: "Personal", color: "#a479e2" },
  ],
  awaiting: { path: "AwaitingReply", color: "#000000" },
  review: { path: "Review/Uncertain", color: "#4a86e8" },
};

/**
 * POST /api/mail-accounts/:email/tags/init
 * Initialize default tagsConfig for a mail account (if missing)
 */
export async function initTagsConfig(req, res) {
  try {
    const { email } = req.params;
    const userId = req.user._id;

    const account = await MailAccount.findOne({ userId, email });
    if (!account) {
      return res.status(404).json({ error: "Mail account not found" });
    }

    if (!account.tagsConfig) {
      account.tagsConfig = DEFAULT_LABEL_TEMPLATE;
      await account.save();
    }

    return res.json({
      success: true,
      tagsConfig: account.tagsConfig,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

/**
 * GET /api/mail-accounts/:email/tags
 * Fetch existing tagsConfig for a mail account
 */
export async function getTagsConfig(req, res) {
  try {
    const { email } = req.params;
    const userId = req.user._id;

    const account = await MailAccount.findOne({ userId, email });
    if (!account) {
      return res.status(404).json({ error: "Mail account not found" });
    }

    // Eğer yoksa varsayılan ile döndür ama DB'ye yazma
    const config = account.tagsConfig || DEFAULT_LABEL_TEMPLATE;

    return res.json({ tagsConfig: config });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

/**
 * POST /api/mail-accounts/:email/tags
 * Save / overwrite tagsConfig for a mail account
 */
export async function saveTagsConfig(req, res) {
  try {
    const { email } = req.params;
    const userId = req.user._id;
    const { allowed, awaiting, review } = req.body || {};

    const account = await MailAccount.findOne({ userId, email });
    if (!account) {
      return res.status(404).json({ error: "Mail account not found" });
    }

    // Basit doğrulama
    if (!allowed || !Array.isArray(allowed)) {
      return res.status(400).json({ error: "Invalid config structure" });
    }

    account.tagsConfig = { allowed, awaiting, review };
    await account.save();

    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

/**
 * DELETE /api/mail-accounts/:email/tags/:path
 * Remove a specific label or sublabel by path
 */
export async function deleteTagPath(req, res) {
  try {
    const { email, path } = req.params;
    const userId = req.user._id;

    const account = await MailAccount.findOne({ userId, email });
    if (!account) {
      return res.status(404).json({ error: "Mail account not found" });
    }

    if (!account.tagsConfig || !Array.isArray(account.tagsConfig.allowed)) {
      return res.status(400).json({ error: "No tag configuration found" });
    }

    // Filtrele
    account.tagsConfig.allowed = account.tagsConfig.allowed.filter(
      (a) => a.path !== path
    );

    await account.save();

    return res.json({ success: true, tagsConfig: account.tagsConfig });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}



export async function deleteMailAccount(req, res) {
  try {
    const { email } = req.params;
    const account = await MailAccount.findOne({ email });

    if (!account) {
      return res.status(404).json({ error: "Mail account not found" });
    }

    // Soft delete
    account.status = "deleted";
    account.isActive = false;
    await account.save();

    return res.json({ success: true, message: `Account ${email} deleted.` });
  } catch (err) {
    console.error("[DELETE /mail-accounts/:email] error:", err);
    return res.status(500).json({ error: err.message });
  }
}

/* ============================================================
   POST /api/mail-accounts/:email/stop-watch
   Gmail watch bildirimini durdur
   ============================================================ */
   export async function stopMailWatch(req, res) {
    try {
      const email = decodeURIComponent(req.params.email);
      const userId = req.user?._id;
  
      // Kullanıcıya ait mail hesabını bul
      const account = await MailAccount.findOne({ email, userId });
      if (!account) {
        return res.status(404).json({ error: "Mail account not found" });
      }
  
      if (!account.refreshToken) {
        return res.status(400).json({ error: "Missing Gmail refresh token" });
      }
  
      // 🔐 Google API client oluştur
      const client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
  
      client.setCredentials({ refresh_token: account.refreshToken });
      const gmail = google.gmail({ version: "v1", auth: client });
  
      try {
        // 🛑 Gmail izlemeyi durdur
        await gmail.users.stop({ userId: "me" });
      } catch (err) {
        console.warn("⚠️ Gmail users.stop failed:", err.message);
      }
  
      // ✅ DB alanlarını güncelle
      account.status = "paused";       // izleme durdu
      account.isActive = false;        // aktif değil
      account.watchExpiration = null;  // artık süresi yok
      // historyId ve lastHistoryId korunuyor (email geçmişi için)
  
      await account.save();
  
      return res.json({
        success: true,
        message: `Stopped watching ${email}`,
      });
    } catch (err) {
      console.error("[POST /mail-accounts/:email/stop-watch] error:", err);
      return res.status(500).json({ error: err.message });
    }
  }