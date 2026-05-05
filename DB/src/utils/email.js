import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const emailPass = String(env.EMAIL_PASS || '').replace(/\s/g, '');
const emailPort = Number(env.EMAIL_PORT || 587);
const hasExplicitSecure = process.env.EMAIL_SECURE !== undefined;

// Gmail rule:
// 465  => secure true
// 587  => secure false, then STARTTLS
const emailSecure = hasExplicitSecure
  ? String(env.EMAIL_SECURE).toLowerCase() === 'true'
  : emailPort === 465;

const smtpHost = env.EMAIL_HOST || 'smtp.gmail.com';

const fromAddress = (() => {
  const configured = String(env.EMAIL_FROM || '').trim();

  // If EMAIL_FROM is a full display address like "SahaYatri <x@gmail.com>", use it.
  if (configured.includes('<') && configured.includes('>')) return configured;

  // For Gmail, the safest sender is the authenticated mailbox.
  return `"SahaYatri" <${env.EMAIL_USER}>`;
})();

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: emailPort,
  secure: emailSecure,
  family: 4,
  requireTLS: !emailSecure,
  auth: {
    user: env.EMAIL_USER,
    pass: emailPass,
  },
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 30000,
  tls: {
    servername: smtpHost,
    minVersion: 'TLSv1.2',
  },
});

const getOtpSubject = (type) =>
  type === 'reset' ? 'Password reset OTP' : 'Email verification OTP';

const getOtpHtml = (otp, type) => {
  const title = type === 'reset' ? 'Reset your password' : 'Verify your email';

  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:14px">
      <h2 style="margin:0 0 12px;color:#111827">${title}</h2>
      <p style="color:#4b5563">Use this OTP to continue:</p>
      <div style="font-size:32px;font-weight:800;letter-spacing:6px;background:#f3f4f6;padding:16px;text-align:center;border-radius:10px;color:#111827">
        ${otp}
      </div>
      <p style="color:#6b7280;font-size:13px;margin-top:18px">
        This OTP expires in 10 minutes.
      </p>
    </div>
  `;
};

export const sendOtpEmail = async (to, otp, type = 'verify') => {
  const subject = getOtpSubject(type);

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html: getOtpHtml(otp, type),
    });

    logger.info({
      event: 'email_sent',
      to,
      subject,
      messageId: info.messageId,
      host: smtpHost,
      port: emailPort,
      secure: emailSecure,
    });

    return info;
  } catch (error) {
    logger.error({
      event: 'email_failed',
      to,
      subject,
      error: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      host: smtpHost,
      port: emailPort,
      secure: emailSecure,
      user: env.EMAIL_USER,
    });

    throw error;
  }
};
