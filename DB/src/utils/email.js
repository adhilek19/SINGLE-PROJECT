import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const normalizeAppPassword = (value = '') => String(value).replace(/\s/g, '');

const emailPort = Number(env.EMAIL_PORT || 587);
const emailSecure = Boolean(env.EMAIL_SECURE);

const createTransporter = () =>
  nodemailer.createTransport({
    host: env.EMAIL_HOST || 'smtp.gmail.com',
    port: emailPort,
    secure: emailSecure, // true only for 465, false for 587 STARTTLS
    family: 4,
    requireTLS: emailPort === 587,
    auth: {
      user: env.EMAIL_USER,
      pass: normalizeAppPassword(env.EMAIL_PASS),
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
    tls: {
      servername: env.EMAIL_HOST || 'smtp.gmail.com',
      minVersion: 'TLSv1.2',
    },
  });

const transporter = createTransporter();

const getOtpSubject = (type) =>
  type === 'reset' ? 'Password reset OTP' : 'Email verification OTP';

const getOtpHtml = (otp, type = 'verify') => {
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

export const getEmailDebugConfig = () => ({
  host: env.EMAIL_HOST,
  port: emailPort,
  secure: emailSecure,
  user: env.EMAIL_USER,
});

export const sendOtpEmail = async (to, otp, type = 'verify') => {
  const subject = getOtpSubject(type);

  try {
    const info = await transporter.sendMail({
      from: env.EMAIL_FROM || `SahaYatri <${env.EMAIL_USER}>`,
      to,
      subject,
      html: getOtpHtml(otp, type),
    });

    logger.info({
      event: 'email_sent',
      to,
      subject,
      messageId: info.messageId,
      host: env.EMAIL_HOST,
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
      host: env.EMAIL_HOST,
      port: emailPort,
      secure: emailSecure,
      user: env.EMAIL_USER,
    });

    throw error;
  }
};
