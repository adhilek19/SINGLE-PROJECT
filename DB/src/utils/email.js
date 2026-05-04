import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const transporter = nodemailer.createTransport({
  host: env.EMAIL_HOST,
  port: env.EMAIL_PORT,
  secure: env.EMAIL_PORT === 465,
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
  },
});

const sendMail = async ({ to, subject, html }) => {
  try {
    const info = await transporter.sendMail({
      from: `"MyApp" <${env.EMAIL_FROM}>`,
      to,
      subject,
      html,
    });

    logger.info({ event: 'email_sent', to, subject, messageId: info.messageId });
  } catch (err) {
    logger.error({ event: 'email_failed', to, subject, error: err.message });
    throw err;
  }
};

export const sendOtpEmail = (to, otp, purpose) => {
  const isVerification = purpose === 'verify';
  const subject = isVerification ? 'Email verification OTP' : 'Password reset OTP';
  const heading = isVerification ? 'Verify your email' : 'Reset your password';
  const intro = isVerification
    ? 'Use this OTP to verify your account.'
    : 'Use this OTP to reset your password.';

  return sendMail({
    to,
    subject,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto; padding: 32px;">
        <h2 style="margin-bottom: 8px;">${heading}</h2>
        <p style="color: #555; line-height: 1.6;">
          ${intro} This OTP expires in <strong>10 minutes</strong>.
        </p>
        <div style="margin: 24px 0; padding: 16px; background: #f5f5f5; border-radius: 8px; text-align: center;">
          <span style="font-size: 28px; font-weight: 700; letter-spacing: 8px;">${otp}</span>
        </div>
        <p style="color: #777; font-size: 14px; line-height: 1.6;">
          If you did not request this, you can ignore this email.
        </p>
      </div>
    `,
  });
};
