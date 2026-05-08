import { env } from '../config/env.js';
import { logger } from './logger.js';

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

const parseSender = (value) => {
  const senderValue = String(value || '').trim();
  const match = senderValue.match(/^(?:"?([^"]*)"?\s*)?<([^>]+)>$/);

  if (match) {
    return {
      name: match[1]?.trim() || 'SahaYatri',
      email: match[2].trim(),
    };
  }

  return {
    name: 'SahaYatri',
    email: senderValue,
  };
};

const sender = parseSender(env.EMAIL_FROM);
const hasBrevoApiKey = Boolean(String(env.BREVO_API_KEY || '').trim());
const hasValidSender = Boolean(String(sender.email || '').trim());
let brevoClientPromise = null;

const getBrevoClient = async () => {
  if (!brevoClientPromise) {
    brevoClientPromise = import('@getbrevo/brevo')
      .then(({ BrevoClient }) => new BrevoClient({ apiKey: env.BREVO_API_KEY }))
      .catch((error) => {
        logger.error({
          event: 'email_provider_module_missing',
          provider: 'brevo',
          error: error?.message,
          hint: 'Ensure @getbrevo/brevo is installed in DB package and Render installs dependencies inside DB.',
        });
        throw error;
      });
  }

  return brevoClientPromise;
};

export const getEmailDebugConfig = () => ({
  provider: 'brevo',
  senderEmail: sender.email,
  senderName: sender.name,
});

export const verifyEmailTransporter = async () => {
  if (!hasBrevoApiKey) {
    logger.error({
      event: 'email_provider_not_configured',
      provider: 'brevo',
      reason: 'BREVO_API_KEY is missing',
    });
    return false;
  }

  if (!hasValidSender) {
    logger.error({
      event: 'email_provider_not_configured',
      provider: 'brevo',
      reason: 'EMAIL_FROM is missing',
    });
    return false;
  }

  logger.info({
    event: 'email_provider_ready',
    provider: 'brevo',
    senderEmail: sender.email,
  });

  return true;
};

export const sendOtpEmail = async (to, otp, type = 'verify') => {
  const subject = getOtpSubject(type);
  const htmlContent = getOtpHtml(otp, type);

  try {
    if (!hasBrevoApiKey || !hasValidSender) {
      logger.error({
        event: 'email_provider_not_configured',
        provider: 'brevo',
        hasBrevoApiKey,
        hasSenderEmail: hasValidSender,
        senderEmail: sender.email || null,
      });
      throw new Error(
        'Brevo email provider is not configured. Set BREVO_API_KEY and EMAIL_FROM.'
      );
    }

    const brevo = await getBrevoClient();
    const response = await brevo.transactionalEmails.sendTransacEmail({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent,
    });

    const messageId =
      response?.messageId ||
      (Array.isArray(response?.messageIds) ? response.messageIds[0] : undefined) ||
      'brevo-accepted';

    logger.info({
      event: 'email_sent',
      provider: 'brevo',
      to,
      subject,
      messageId,
      senderEmail: sender.email,
    });

    return { messageId };
  } catch (error) {
    logger.error({
      event: 'email_failed',
      provider: 'brevo',
      to,
      subject,
      senderEmail: sender.email,
      error: error?.message,
      statusCode: error?.statusCode || error?.rawResponse?.status,
      responseBody: error?.body || error?.rawResponse?.body,
    });

    throw error;
  }
};
