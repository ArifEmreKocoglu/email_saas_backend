import nodemailer from "nodemailer";

/**
 * =========================================
 * ENTRFY - CENTRAL MAIL SERVICE
 * =========================================
 * - Transactional mails only
 * - Password reset
 * - Email verification
 * - Welcome mail
 * =========================================
 */

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM_NAME = "Entrfy",
  SMTP_FROM_EMAIL = "support@entrfy.com",
  NODE_ENV,
} = process.env;

/* -----------------------------
   Transport
------------------------------ */
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: Number(SMTP_PORT) === 465, // true for 465, false otherwise
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

/* -----------------------------
   Base sender
------------------------------ */
async function sendMail({ to, subject, html }) {
  if (!to) throw new Error("Mail target missing");

  const mail = {
    from: `"${SMTP_FROM_NAME}" <${SMTP_FROM_EMAIL}>`,
    to,
    subject,
    html,
  };

  if (NODE_ENV !== "production") {
    console.log("📧 MAIL (DEV):", { to, subject });
  }

  return transporter.sendMail(mail);
}

/* =============================
   TEMPLATES
============================= */

function baseTemplate({ title, content }) {
  return `
    <div style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px">
      <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:12px;padding:32px">
        <h2 style="margin:0 0 16px;color:#111827">${title}</h2>
        <div style="color:#374151;font-size:14px;line-height:1.6">
          ${content}
        </div>
        <p style="margin-top:32px;font-size:12px;color:#9ca3af">
          Entrfy • support@entrfy.com
        </p>
      </div>
    </div>
  `;
}

/* =============================
   PUBLIC API
============================= */

/**
 * Email Verification
 */
export async function sendEmailVerification({ email, verifyUrl }) {
  return sendMail({
    to: email,
    subject: "Verify your Entrfy account",
    html: baseTemplate({
      title: "Verify your email",
      content: `
        <p>Welcome to Entrfy 👋</p>
        <p>Please verify your email to activate your account.</p>
        <p style="margin:24px 0">
          <a href="${verifyUrl}"
             style="background:#4f46e5;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">
            Verify Email
          </a>
        </p>
        <p>If you didn’t create this account, you can ignore this email.</p>
      `,
    }),
  });
}

/**
 * Password Reset
 */
export async function sendPasswordReset({ email, resetUrl }) {
  return sendMail({
    to: email,
    subject: "Reset your Entrfy password",
    html: baseTemplate({
      title: "Password reset",
      content: `
        <p>You requested to reset your password.</p>
        <p style="margin:24px 0">
          <a href="${resetUrl}"
             style="background:#ef4444;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">
            Reset Password
          </a>
        </p>
        <p>This link expires in 15 minutes.</p>
        <p>If you didn’t request this, ignore this email.</p>
      `,
    }),
  });
}

/**
 * Welcome mail (optional)
 */
export async function sendWelcomeMail({ email, name }) {
  return sendMail({
    to: email,
    subject: "Welcome to Entrfy 🚀",
    html: baseTemplate({
      title: `Welcome ${name || ""}`,
      content: `
        <p>Your Entrfy account is ready.</p>
        <p>You can now connect Gmail or Outlook and start automations.</p>
        <p>If you need help, just reply to this email.</p>
      `,
    }),
  });
}
