import MailAccount from "../models/MailAccount.js";
import JobLock from "../models/JobLock.js";
import { rewatchGmailAccount } from "../services/gmailWatch.js";

const HOUR = 60 * 60 * 1000;
const JOB_NAME = "rewatch-gmail";
const LOCK_TTL_MS = 10 * 60 * 1000;      // 10 dk
const SCAN_INTERVAL_MS = 6 * HOUR;       // her 6 saatte bir tara
const STALE_HOURS = 24;                   // 24 saat push yoksa zorla rewatch
const BATCH_LIMIT = 100;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function acquireLock() {
  const now = new Date();
  const expires = new Date(Date.now() + LOCK_TTL_MS);
  const res = await JobLock.findOneAndUpdate(
    {
      jobName: JOB_NAME,
      $or: [{ expiresAt: { $lte: now } }, { expiresAt: { $exists: false } }],
    },
    { $set: { jobName: JOB_NAME, lockedAt: now, expiresAt: expires } },
    { upsert: true, new: true }
  ).lean();

  // lean() ile gelebilecek string/tarih farkını güvene al
  return !!(res && new Date(res.expiresAt) > now);
}

async function releaseLock() {
  await JobLock.updateOne(
    { jobName: JOB_NAME },
    { $set: { expiresAt: new Date(0) } }
  );
}

async function scanAndRewatch() {
  // Jitter: 0–30 sn (çoklu instance çarpışmasını azaltır)
  await sleep(Math.floor(Math.random() * 30000));

  const gotLock = await acquireLock();
  if (!gotLock) {
    console.log("[rewatch] skipped (lock held)");
    return;
  }

  try {
    const nowMs = Date.now();
    const threshold = new Date(nowMs + 36 * HOUR);         // 36 saat kala yenile
    const staleSince = new Date(nowMs - STALE_HOURS * HOUR); // 24 saattir push yoksa

    // ✅ Adaylar: süresi yaklaşanlar + uzun süredir push almayanlar
    const candidates = await MailAccount.find({
      provider: "gmail",
      status: "active",
      isActive: true,
      $or: [
        { watchExpiration: { $exists: false } },
        { watchExpiration: null },
        { watchExpiration: { $lte: threshold } },
        { lastWebhookAt: { $exists: false } },
        { lastWebhookAt: { $lte: staleSince } },
      ],
    })
      .select("_id email watchExpiration lastWebhookAt")
      .limit(BATCH_LIMIT)
      .lean();

    console.log(
      `[rewatch] candidates: ${candidates.length} (<=${BATCH_LIMIT})`
    );

    let ok = 0, fail = 0;
    for (const c of candidates) {
      try {
        // Hesap başına küçük jitter (quota/dos koruması)
        await sleep(250 + Math.floor(Math.random() * 500));

        const acc = await MailAccount.findById(c._id);
        if (!acc) continue;

        // 🛠 rewatch INBOX: services/gmailWatch.rewatchGmailAccount
        // fonksiyonu içinde mutlaka stop()+watch({labelIds:["INBOX"]})
        // ve DB'ye watchExpiration/historyId update yapılıyor olmalı.
        await rewatchGmailAccount(acc);

        ok++;
        console.log(
          `[rewatch] ok: ${acc.email} → exp:${acc.watchExpiration?.toISOString?.() || "-"}`
        );
      } catch (e) {
        fail++;
        console.error("[rewatch] fail:", c.email, e?.message || e);
      }
    }
    console.log(`[rewatch] done — ok:${ok} fail:${fail}`);
  } finally {
    await releaseLock();
  }
}

export function startRewatchJob() {
  // İlk çalıştırma
  scanAndRewatch().catch(err =>
    console.error("[rewatch] initial error:", err?.message || err)
  );

  // Periyodik tarama
  setInterval(() => {
    scanAndRewatch().catch(err =>
      console.error("[rewatch] interval error:", err?.message || err)
    );
  }, SCAN_INTERVAL_MS);
}