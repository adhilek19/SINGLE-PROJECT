import { redis } from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import { sendTransactionalEmail, EmailDeliveryError } from '../utils/email.js';

const MAX_ATTEMPTS = 4;
const BASE_RETRY_MS = 1500;
const emailQueue = [];
let workerTimer = null;

const now = () => Date.now();

const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const queueKey = 'email:queue:v1';

const safeText = (value, max = 240) =>
  String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const safeUrl = (value, fallback = '') => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (/^https?:\/\/[^\s]+$/i.test(raw)) return raw;
  return fallback;
};

const parseQueueItem = (value) => {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const pushToRedisQueue = async (job) => {
  if (redis.status !== 'ready') return false;
  try {
    await redis.rpush(queueKey, JSON.stringify(job));
    return true;
  } catch (err) {
    logger.warn({
      event: 'email_queue_redis_push_failed',
      reason: err?.message || 'unknown',
    });
    return false;
  }
};

const popFromRedisQueue = async () => {
  if (redis.status !== 'ready') return null;
  try {
    const raw = await redis.lpop(queueKey);
    if (!raw) return null;
    return parseQueueItem(raw);
  } catch (err) {
    logger.warn({
      event: 'email_queue_redis_pop_failed',
      reason: err?.message || 'unknown',
    });
    return null;
  }
};

const renderShell = ({ heading, bodyHtml, ctaLabel = '', ctaUrl = '' }) => {
  const hasCta = Boolean(ctaLabel && ctaUrl);
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:16px;background:#ffffff">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <div style="width:36px;height:36px;border-radius:12px;background:#2563eb;color:#fff;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center">SY</div>
        <div style="font-weight:800;color:#0f172a;font-size:18px">SahaYatri</div>
      </div>
      <h2 style="margin:0 0 12px;color:#0f172a">${heading}</h2>
      <div style="color:#334155;font-size:14px;line-height:1.6">${bodyHtml}</div>
      ${
        hasCta
          ? `<div style="margin-top:18px"><a href="${ctaUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:10px">${ctaLabel}</a></div>`
          : ''
      }
      <p style="margin-top:22px;font-size:12px;color:#64748b">This is an automated message from SahaYatri.</p>
    </div>
  `;
};

const templates = {
  rideRequestReceived: ({ passengerName, rideRoute, rideTime, rideUrl }) => ({
    subject: `New ride request from ${safeText(passengerName || 'a passenger', 50)}`,
    htmlContent: renderShell({
      heading: 'New ride request received',
      bodyHtml: `
        <p>${safeText(passengerName || 'A passenger', 50)} requested to join your ride.</p>
        <p><strong>Route:</strong> ${safeText(rideRoute, 140)}</p>
        <p><strong>Departure:</strong> ${safeText(rideTime, 90)}</p>
      `,
      ctaLabel: 'Review request',
      ctaUrl: safeUrl(rideUrl, ''),
    }),
  }),

  rideRequestAccepted: ({ driverName, rideRoute, rideTime, pickupLocation, rideUrl }) => ({
    subject: 'Your ride request was accepted',
    htmlContent: renderShell({
      heading: 'Ride request accepted',
      bodyHtml: `
        <p>${safeText(driverName || 'Your driver', 50)} accepted your request.</p>
        <p><strong>Route:</strong> ${safeText(rideRoute, 140)}</p>
        <p><strong>Departure:</strong> ${safeText(rideTime, 90)}</p>
        <p><strong>Pickup:</strong> ${safeText(pickupLocation || 'Check ride details', 140)}</p>
      `,
      ctaLabel: 'Open ride details',
      ctaUrl: safeUrl(rideUrl, ''),
    }),
  }),

  rideCompleted: ({ rideRoute, rideTime, ridesUrl }) => ({
    subject: 'Thank you for riding with SahaYatri',
    htmlContent: renderShell({
      heading: 'Ride completed',
      bodyHtml: `
        <p>Thank you for riding with SahaYatri.</p>
        <p><strong>Ride:</strong> ${safeText(rideRoute, 140)}</p>
        <p><strong>Completed at:</strong> ${safeText(rideTime, 90)}</p>
        <p>Find nearby rides anytime and continue sharing journeys.</p>
      `,
      ctaLabel: 'Find nearby rides',
      ctaUrl: safeUrl(ridesUrl, ''),
    }),
  }),

  userBlocked: ({ reason = '', supportUrl = '' }) => ({
    subject: 'Important account notice from SahaYatri',
    htmlContent: renderShell({
      heading: 'Account access update',
      bodyHtml: `
        <p>Your account has been temporarily restricted by our moderation team.</p>
        ${reason ? `<p><strong>Reason:</strong> ${safeText(reason, 180)}</p>` : ''}
        <p>If you believe this is incorrect, contact support.</p>
      `,
      ctaLabel: supportUrl ? 'Contact support' : '',
      ctaUrl: safeUrl(supportUrl, ''),
    }),
  }),

  chatFallback: ({ senderName, preview, chatUrl }) => ({
    subject: `New message from ${safeText(senderName || 'someone', 50)}`,
    htmlContent: renderShell({
      heading: 'You received a new message',
      bodyHtml: `
        <p>${safeText(senderName || 'Someone', 50)} sent you a message.</p>
        <p style="padding:10px 12px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0">${safeText(preview || 'Open chat to view message', 200)}</p>
      `,
      ctaLabel: 'Open chat',
      ctaUrl: safeUrl(chatUrl, ''),
    }),
  }),
};

const processJob = async (job) => {
  const payload = job?.payload || {};
  const templateName = String(job?.template || '').trim();
  const to = String(job?.to || '').trim().toLowerCase();
  const template = templates[templateName];

  if (!to || !template) {
    logger.warn({
      event: 'email_job_invalid',
      template: templateName,
      to,
    });
    return { ok: false, final: true };
  }

  const rendered = template(payload);
  await sendTransactionalEmail({
    to,
    subject: rendered.subject,
    htmlContent: rendered.htmlContent,
    category: templateName,
    tags: ['sahayatri', templateName],
  });

  return { ok: true };
};

const scheduleWorker = () => {
  if (workerTimer) return;
  workerTimer = setTimeout(async () => {
    workerTimer = null;
    await runWorkerLoop();
    if (emailQueue.length) {
      scheduleWorker();
    }
  }, 250);
};

const pullJob = async () => {
  const redisJob = await popFromRedisQueue();
  if (redisJob) return redisJob;
  return emailQueue.shift() || null;
};

const requeueJob = async (job) => {
  const pushed = await pushToRedisQueue(job);
  if (!pushed) {
    emailQueue.push(job);
  }
};

const runWorkerLoop = async () => {
  for (let i = 0; i < 8; i += 1) {
    const job = await pullJob();
    if (!job) return;

    try {
      const result = await processJob(job);
      if (result?.ok) {
        logger.info({
          event: 'email_job_sent',
          template: job.template,
          to: job.to,
          attempts: Number(job.attempts || 1),
        });
      }
    } catch (err) {
      const attempts = Number(job.attempts || 1);
      const retryable = err instanceof EmailDeliveryError ? Boolean(err.retryable) : true;
      const final = !retryable || attempts >= MAX_ATTEMPTS;

      logger.warn({
        event: 'email_job_failed',
        template: job.template,
        to: job.to,
        attempts,
        retryable,
        final,
        reason: err?.message || 'unknown',
      });

      if (!final) {
        const retryInMs = BASE_RETRY_MS * 2 ** (attempts - 1);
        await wait(Math.min(12000, retryInMs));
        await requeueJob({
          ...job,
          attempts: attempts + 1,
          updatedAt: now(),
        });
      }
    }
  }
};

export const emailWorkflowService = {
  enqueue({ template, to, payload = {}, dedupeKey = '' }) {
    const safeTo = String(to || '').trim().toLowerCase();
    if (!safeTo) return;
    const job = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      template: String(template || '').trim(),
      to: safeTo,
      payload,
      dedupeKey: String(dedupeKey || '').trim(),
      attempts: 1,
      createdAt: now(),
      updatedAt: now(),
    };

    // Fast dedupe on hot paths.
    if (job.dedupeKey) {
      const duplicate = emailQueue.find((entry) => entry.dedupeKey === job.dedupeKey);
      if (duplicate) return;
    }

    if (redis.status === 'ready') {
      void pushToRedisQueue(job).then((pushed) => {
        if (!pushed) {
          emailQueue.push(job);
          scheduleWorker();
        }
      });
      scheduleWorker();
      return;
    }

    emailQueue.push(job);
    scheduleWorker();
  },
};

export default emailWorkflowService;
