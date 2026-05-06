import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const normalizeAppPassword = (value = '') => String(value).replace(/\s/g, '');

const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return undefined;

  const normalized = String(value).trim().toLowerCase();

  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;

  return undefined;
};

const emailPort = Number(env.EMAIL_PORT || 587);

const configuredSecure = parseBoolean(env.EMAIL_SECURE);

// Gmail:
// port 465 => secure true
// port 587 => secure false + STARTTLS
const emailSecure =
  configuredSecure !== undefined ? configuredSecure : emailPort === 465;

const createSmtpTransporter = () =>
  nodemailer.createTransport({
    host: env.EMAIL_HOST || 'smtp.gmail.com',
    port: emailPort,
    secure: emailSecure,
    family: 4,

    // Only force STARTTLS for 587
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

const smtpTransporter = createSmtpTransporter();

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
  provider: env.EMAIL_PROVIDER || 'smtp',
  host: env.EMAIL_HOST || 'smtp.gmail.com',
  port: emailPort,
  secure: emailSecure,
  requireTLS: emailPort === 587,
  user: env.EMAIL_USER,
});

export const verifyEmailTransporter = async () => {
  if ((env.EMAIL_PROVIDER || 'smtp') !== 'smtp') return true;

  try {
    await smtpTransporter.verify();

    logger.info({
      event: 'email_transporter_verified',
      host: env.EMAIL_HOST || 'smtp.gmail.com',
      port: emailPort,
      secure: emailSecure,
      requireTLS: emailPort === 587,
      user: env.EMAIL_USER,
    });

    return true;
  } catch (error) {
    logger.error({
      event: 'email_transporter_verify_failed',
      error: error.message,
      code: error.code,
      command: error.command,
      host: env.EMAIL_HOST || 'smtp.gmail.com',
      port: emailPort,
      secure: emailSecure,
      requireTLS: emailPort === 587,
      user: env.EMAIL_USER,
    });

    return false;
  }
};

export const sendOtpEmail = async (to, otp, type = 'verify') => {
  const subject = getOtpSubject(type);
  const provider = env.EMAIL_PROVIDER || 'smtp';
  const html = getOtpHtml(otp, type);

  try {
    let info;
    if (provider === 'smtp') {
      info = await smtpTransporter.sendMail({
        from: env.EMAIL_FROM || `SahaYatri <${env.EMAIL_USER}>`,
        to,
        subject,
        html,
      });
    } else if (provider === 'resend') {
      if (!env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY is missing');
      }

      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM || 'SahaYatri <onboarding@resend.dev>',
          to: [to],
          subject,
          html,
        }),
      });

      const body = await resp.json();
      if (!resp.ok) {
        throw new Error(body?.message || `Resend failed with status ${resp.status}`);
      }

      info = { messageId: body?.id || 'resend-accepted' };
    } else if (provider === 'sendgrid') {
      if (!env.SENDGRID_API_KEY) {
        throw new Error('SENDGRID_API_KEY is missing');
      }

      const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: (env.EMAIL_FROM || '').match(/<(.+)>/)?.[1] || env.EMAIL_USER },
          subject,
          content: [{ type: 'text/html', value: html }],
        }),
      });

      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`SendGrid failed with status ${resp.status}: ${body}`);
      }

      info = { messageId: resp.headers.get('x-message-id') || 'sendgrid-accepted' };
    } else {
      throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
    }

    logger.info({
      event: 'email_sent',
      provider,
      to,
      subject,
      messageId: info.messageId,
      host: env.EMAIL_HOST || 'smtp.gmail.com',
      port: emailPort,
      secure: emailSecure,
      requireTLS: emailPort === 587,
      user: env.EMAIL_USER,
    });

    return info;
  } catch (error) {
    logger.error({
      event: 'email_failed',
      provider,
      to,
      subject,
      error: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      host: env.EMAIL_HOST || 'smtp.gmail.com',
      port: emailPort,
      secure: emailSecure,
      requireTLS: emailPort === 587,
      user: env.EMAIL_USER,
    });

    throw error;
  }
};
