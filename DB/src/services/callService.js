import { env } from '../config/env.js';
import { callLogRepository } from '../repositories/callLogRepository.js';
import { BadRequest, NotFound } from '../utils/AppError.js';
import { toId } from './chatAccessService.js';

const CALL_STATUSES = new Set([
  'calling',
  'ringing',
  'connected',
  'ended',
  'rejected',
  'missed',
  'failed',
  'busy',
]);

const safeDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed;
};

const buildIceServers = () => {
  const iceServers = [];

  const stunUrl = String(env.WEBRTC_STUN_URL || '').trim();

  if (stunUrl) {
    iceServers.push({
      urls: stunUrl,
    });
  }

  const turnUrls = String(env.WEBRTC_TURN_URLS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const turnUsername = String(env.WEBRTC_TURN_USERNAME || '').trim();
  const turnCredential = String(env.WEBRTC_TURN_CREDENTIAL || '').trim();

  if (turnUrls.length && turnUsername && turnCredential) {
    turnUrls.forEach((url) => {
      iceServers.push({
        urls: url,
        username: turnUsername,
        credential: turnCredential,
      });
    });
  }

  return iceServers;
};

export const callService = {
  getIceServers() {
    return buildIceServers();
  },

  getRingTimeoutMs() {
    const timeoutMs = Number(env.WEBRTC_CALL_RING_TIMEOUT_MS || 30000);
    if (!Number.isFinite(timeoutMs) || timeoutMs < 5000) return 30000;
    return Math.min(120000, Math.round(timeoutMs));
  },

  async createCallLog({
    chatId,
    rideId,
    callerId,
    calleeId,
    status = 'ringing',
    failureReason = '',
  }) {
    const safeStatus = String(status || '').trim();
    if (!CALL_STATUSES.has(safeStatus)) {
      throw BadRequest('Invalid call status');
    }

    return callLogRepository.create({
      chat: chatId,
      ride: rideId,
      caller: callerId,
      callee: calleeId,
      status: safeStatus,
      startedAt: new Date(),
      ringingAt: new Date(),
      failureReason: String(failureReason || '').trim(),
    });
  },

  async updateCallStatus({
    callId,
    status,
    endedBy = null,
    failureReason = '',
    answeredAt = null,
    endedAt = null,
  }) {
    const safeCallId = toId(callId);
    if (!safeCallId) throw BadRequest('Invalid call id');

    const safeStatus = String(status || '').trim();
    if (!CALL_STATUSES.has(safeStatus)) {
      throw BadRequest('Invalid call status');
    }

    const callLog = await callLogRepository.findRawById(safeCallId);
    if (!callLog) throw NotFound('Call log not found');

    callLog.status = safeStatus;

    const answerTime = safeDate(answeredAt);
    if (answerTime) {
      callLog.answeredAt = answerTime;
    } else if (safeStatus === 'connected' && !callLog.answeredAt) {
      callLog.answeredAt = new Date();
    }

    const endTime = safeDate(endedAt);
    if (endTime) {
      callLog.endedAt = endTime;
    } else if (
      ['ended', 'rejected', 'missed', 'failed', 'busy'].includes(safeStatus) &&
      !callLog.endedAt
    ) {
      callLog.endedAt = new Date();
    }

    if (endedBy) {
      callLog.endedBy = endedBy;
    }

    callLog.failureReason = String(failureReason || '').trim();

    await callLogRepository.save(callLog);
    return callLogRepository.findById(callLog._id);
  },
};
