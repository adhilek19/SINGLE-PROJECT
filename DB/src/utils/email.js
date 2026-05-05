import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const transporter = nodemailer.createTransport({
  host: env.EMAIL_HOST,
  port: Number(env.EMAIL_PORT),
  secure: Boolean(env.EMAIL_SECURE), // true for 465
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
  },
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 30000,
});

const getOtpSubject = (type) => {
  if (type === 'reset') return 'Password reset OTP';
  return 'Email verification OTP';
};

const getOtpHtml = (otp, type) => {
  const title = type === 'reset' ? 'Reset your password' : 'Verify your email';

  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:14px">
      <h2 style="margin:0 0 12px;color:#111827">${title}</h2>
      <p style="color:#4b5563">Use this OTP to continue:</p>
      <div style="font-size:32px;font-weight:800;letter-spacing:6px;background:#f3f4f6;padding:16px;text-align:center;border-radius:10px;color:#111827">
        ${otp}
      </div>
      <p style="color:#6b7280;font-size:13px;margin-top:18px">This OTP expires in 10 minutes.</p>
    </div>
  `;
};

export const sendOtpEmail = async (to, otp, type = 'verify') => {
  try {
    const subject = getOtpSubject(type);

    const info = await transporter.sendMail({
      from: `"SahaYatri" <${env.EMAIL_FROM}>`,
      to,
      subject,
      html: getOtpHtml(otp, type),
    });

    logger.info({
      event: 'email_sent',
      to,
      subject,
      messageId: info.messageId,
    });

    return info;
  } catch (error) {
    logger.error({
      event: 'email_failed',
      to,
      subject: getOtpSubject(type),
      error: error.message,
      code: error.code,
    });

    throw error;
  }
};