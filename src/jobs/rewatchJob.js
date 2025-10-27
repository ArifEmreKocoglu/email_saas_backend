import MailAccount from "../models/MailAccount.js";
import JobLock from "../models/JobLock.js";
import { rewatchGmailAccount } from "../services/gmailWatch.js";

const HOUR = 60 * 60 * 1000;
const JOB_NAME = "rewatch-gmail";
const LOCK_TTL_MS = 10 * 60 * 1000; // 10 dk
const SCAN_INTERVAL_MS = 6 * HOUR;

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
  // lock başarılı ise res.expiresAt gelecekte olmalı
  return res && res.expiresAt > now;
}

async function releaseLock() {
  await JobLock.updateOne({ jobName: JOB_NAME }, { $set: { expiresAt: new Date(0) } });
}

async function scanAndRewatch() {
  // Jitter: 0-30 sn gecikme (çoklu instance çakışmasını azaltır)
  await sleep(Math.floor(Math.random() * 30000));

  const gotLock = await acquireLock();
  if (!gotLock) {
    console.log("[rewatch] skipped (lock held)");
    return;
  }

  try {
    const now = Date.now();
    const threshold = new Date(now + 36 * HOUR); // 36 saat kala yenile

    const candidates = await MailAccount.find({
      provider: "gmail",
      status: "active",
      $or: [
        { watchExpiration: { $exists: false } },
        { watchExpiration: null },
        { watchExpiration: { $lte: threshold } },
      ],
    })
      .select("_id email watchExpiration")
      .limit(100)
      .lean();

    console.log(`[rewatch] candidates: ${candidates.length}`);

    let ok = 0, fail = 0;
    for (const c of candidates) {
      try {
        // Her hesap arasında küçük jitter (quota koruması)
        await sleep(250 + Math.floor(Math.random() * 500));
        const acc = await MailAccount.findById(c._id);
        if (!acc) continue;
        await rewatchGmailAccount(acc);
        ok++;
      } catch (e) {
        fail++;
        console.error("[rewatch] fail:", c.email, e.message);
      }
    }
    console.log(`[rewatch] done — ok:${ok} fail:${fail}`);
  } finally {
    await releaseLock();
  }
}

export function startRewatchJob() {
  // Başlangıçta bir kere
  scanAndRewatch().catch(err => console.error("[rewatch] initial error:", err.message));
  // Sonra periyodik
  setInterval(() => {
    scanAndRewatch().catch(err => console.error("[rewatch] interval error:", err.message));
  }, SCAN_INTERVAL_MS);
}