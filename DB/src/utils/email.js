import { env } from '../config/env.js';
import { logger } from './logger.js';

const BREVO_AUTHORISED_IPS_URL = 'https://app.brevo.com/security/authorised_ips';
const DEFAULT_PROVIDER_BLOCK_SECONDS = 300;

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
let providerBlockedUntil = 0;
let providerBlockReason = null;
let providerBlockHint = null;

export class EmailDeliveryError extends Error {
  constructor({
    message,
    statusCode = 503,
    code = 'email_delivery_failed',
    reason = 'unknown',
    retryable = false,
    permanent = false,
    operatorHint = null,
    provider = 'brevo',
    providerStatusCode = null,
    providerCode = null,
  }) {
    super(message);
    this.name = 'EmailDeliveryError';
    this.statusCode = statusCode;
    this.code = code;
    this.reason = reason;
    this.retryable = retryable;
    this.permanent = permanent;
    this.operatorHint = operatorHint;
    this.provider = provider;
    this.providerStatusCode = providerStatusCode;
    this.providerCode = providerCode;
    this.isOperational = true;
  }
}

const getProviderBlockSeconds = () => {
  const value = Number(env.EMAIL_PROVIDER_BLOCK_SECONDS);
  if (Number.isFinite(value) && value >= 30) {
    return Math.floor(value);
  }
  return DEFAULT_PROVIDER_BLOCK_SECONDS;
};

const parseResponseBody = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return { message: value };
    }
  }
  return {};
};

const isIpAuthorisationFailure = (providerStatusCode, providerCode, providerMessage) => {
  if (providerStatusCode !== 401) return false;
  if (providerCode !== 'unauthorized') return false;
  const normalized = String(providerMessage || '').toLowerCase();
  return (
    normalized.includes('unrecognised ip address') ||
    normalized.includes('unrecognized ip address')
  );
};

const toEmailDeliveryError = (error) => {
  const providerStatusCode =
    Number(error?.statusCode || error?.rawResponse?.status || 0) || null;
  const parsedBody = parseResponseBody(error?.body || error?.rawResponse?.body);
  const providerCode = String(parsedBody?.code || '').trim().toLowerCase() || null;
  const providerMessage = String(
    parsedBody?.message || error?.message || 'Brevo email request failed'
  ).trim();

  if (isIpAuthorisationFailure(providerStatusCode, providerCode, providerMessage)) {
    return new EmailDeliveryError({
      message: 'OTP email service is temporarily unavailable. Please try again shortly.',
      statusCode: 503,
      code: 'brevo_ip_not_authorized',
      reason: 'ip_not_authorized',
      retryable: false,
      permanent: true,
      operatorHint: `Brevo rejected server IP. Add deployment egress IP to ${BREVO_AUTHORISED_IPS_URL}.`,
      providerStatusCode,
      providerCode,
    });
  }

  if (providerStatusCode === 401) {
    return new EmailDeliveryError({
      message: 'OTP email service is temporarily unavailable. Please try again shortly.',
      statusCode: 503,
      code: 'brevo_unauthorized',
      reason: 'unauthorized',
      retryable: false,
      permanent: true,
      operatorHint: 'BREVO_API_KEY is invalid, revoked, or missing the required scope.',
      providerStatusCode,
      providerCode,
    });
  }

  if (providerStatusCode === 429 || (providerStatusCode !== null && providerStatusCode >= 500)) {
    return new EmailDeliveryError({
      message: 'OTP email service is temporarily unavailable. Please try again shortly.',
      statusCode: 503,
      code: 'brevo_transient_failure',
      reason: 'transient_upstream_failure',
      retryable: true,
      permanent: false,
      operatorHint: 'Brevo is rate-limiting or unavailable. Retries should recover automatically.',
      providerStatusCode,
      providerCode,
    });
  }

  if (!providerStatusCode) {
    return new EmailDeliveryError({
      message: 'OTP email service is temporarily unavailable. Please try again shortly.',
      statusCode: 503,
      code: 'brevo_network_or_sdk_failure',
      reason: 'network_or_sdk_failure',
      retryable: true,
      permanent: false,
      operatorHint: 'Could not reach Brevo API or SDK threw before a response was received.',
      providerStatusCode,
      providerCode,
    });
  }

  return new EmailDeliveryError({
    message: 'OTP email service is temporarily unavailable. Please try again shortly.',
    statusCode: 503,
    code: 'brevo_delivery_failed',
    reason: 'unknown_provider_failure',
    retryable: false,
    permanent: false,
    operatorHint: 'Inspect Brevo response details in logs.',
    providerStatusCode,
    providerCode,
  });
};

const openProviderCircuit = (emailError) => {
  if (!emailError?.permanent) return;
  if (emailError.code === 'email_provider_circuit_open') return;
  if (Date.now() < providerBlockedUntil && providerBlockReason === emailError.reason) {
    return;
  }

  const seconds = getProviderBlockSeconds();
  providerBlockedUntil = Date.now() + seconds * 1000;
  providerBlockReason = emailError.reason || 'unknown';
  providerBlockHint = emailError.operatorHint || null;

  logger.warn({
    event: 'email_provider_circuit_open',
    provider: 'brevo',
    reason: providerBlockReason,
    blockSeconds: seconds,
    blockedUntil: new Date(providerBlockedUntil).toISOString(),
    operatorHint: providerBlockHint,
  });
};

const assertProviderNotBlocked = () => {
  if (Date.now() >= providerBlockedUntil) return;

  throw new EmailDeliveryError({
    message: 'OTP email service is temporarily unavailable. Please try again shortly.',
    statusCode: 503,
    code: 'email_provider_circuit_open',
    reason: providerBlockReason || 'provider_blocked',
    retryable: false,
    permanent: true,
    operatorHint: providerBlockHint || 'Email provider circuit is temporarily open.',
  });
};

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
  providerBlockedUntil:
    providerBlockedUntil > Date.now()
      ? new Date(providerBlockedUntil).toISOString()
      : null,
  providerBlockReason: providerBlockReason,
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

  return sendTransactionalEmail({
    to,
    subject,
    htmlContent,
    category: 'otp',
  });
};

export const sendTransactionalEmail = async ({
  to,
  subject,
  htmlContent,
  textContent = '',
  category = 'transactional',
  tags = [],
}) => {
  const safeTo = String(to || '').trim().toLowerCase();
  const safeSubject = String(subject || '').trim().slice(0, 180);
  const safeHtml = String(htmlContent || '').trim();
  const safeText = String(textContent || '').trim();

  if (!safeTo || !safeSubject || !safeHtml) {
    throw new EmailDeliveryError({
      message: 'Email payload is invalid',
      statusCode: 400,
      code: 'email_payload_invalid',
      reason: 'payload_invalid',
      retryable: false,
      permanent: false,
      operatorHint: 'Ensure to, subject, and htmlContent are provided.',
    });
  }

  try {
    assertProviderNotBlocked();

    if (!hasBrevoApiKey || !hasValidSender) {
      throw new EmailDeliveryError({
        message: 'Email service is temporarily unavailable. Please try again shortly.',
        statusCode: 503,
        code: 'email_provider_not_configured',
        reason: 'provider_not_configured',
        retryable: false,
        permanent: true,
        operatorHint: 'Set BREVO_API_KEY and EMAIL_FROM in the backend environment.',
      });
    }

    const brevo = await getBrevoClient();
    const response = await brevo.transactionalEmails.sendTransacEmail({
      sender,
      to: [{ email: safeTo }],
      subject: safeSubject,
      htmlContent: safeHtml,
      textContent: safeText || undefined,
      tags: Array.isArray(tags) ? tags.filter(Boolean).slice(0, 10) : undefined,
    });

    const messageId =
      response?.messageId ||
      (Array.isArray(response?.messageIds) ? response.messageIds[0] : undefined) ||
      'brevo-accepted';

    logger.info({
      event: 'email_sent',
      provider: 'brevo',
      to: safeTo,
      subject: safeSubject,
      category,
      messageId,
      senderEmail: sender.email,
    });

    return { messageId };
  } catch (error) {
    const emailError =
      error instanceof EmailDeliveryError ? error : toEmailDeliveryError(error);

    if (emailError.code === 'email_provider_circuit_open') {
      const remainingMs = Math.max(0, providerBlockedUntil - Date.now());
      logger.warn({
        event: 'email_send_skipped_provider_circuit_open',
        provider: 'brevo',
        reason: emailError.reason,
        remainingSeconds: Math.ceil(remainingMs / 1000),
        operatorHint: emailError.operatorHint,
      });
      throw emailError;
    }

    openProviderCircuit(emailError);
    const providerBody = parseResponseBody(error?.body || error?.rawResponse?.body);

    logger.error({
      event: 'email_failed',
      provider: 'brevo',
      to: safeTo,
      subject: safeSubject,
      category,
      senderEmail: sender.email,
      error: error?.message,
      statusCode:
        error?.statusCode ||
        error?.rawResponse?.status ||
        emailError.providerStatusCode ||
        emailError.statusCode,
      responseBody: providerBody,
      errorCode: emailError.code,
      reason: emailError.reason,
      retryable: emailError.retryable,
      operatorHint: emailError.operatorHint,
    });

    throw emailError;
  }
};
