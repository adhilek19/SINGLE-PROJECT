import Redis from 'ioredis';
import { env } from '../config/env.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 3) {
      console.warn('Redis unavailable → running without cache');
      return null;
    }
    return Math.min(times * 100, 2000);
  },
  lazyConnect: true,
});

let redisConnectPromise = null;

const ensureRedisReady = async () => {
  if (redis.status === 'ready') return true;
  if (redis.status === 'connecting' || redis.status === 'connect') return false;
  if (redis.status === 'end' || redis.status === 'closed') return false;

  try {
    redisConnectPromise ||= redis.connect().finally(() => {
      redisConnectPromise = null;
    });
    await redisConnectPromise;
    return redis.status === 'ready';
  } catch (e) {
    console.warn('Redis unavailable → continuing without Redis:', e.message);
    return false;
  }
};

// Call this once in server startup if possible. Safe wrapper also calls it lazily.
export const connectRedis = ensureRedisReady;

export const safeRedis = {
  async setex(key, seconds, value) {
    if (!(await ensureRedisReady())) return null;
    try {
      return await redis.setex(key, seconds, value);
    } catch (e) {
      console.error('Redis SETEX error:', e.message);
      return null;
    }
  },

  async get(key) {
    if (!(await ensureRedisReady())) return null;
    try {
      return await redis.get(key);
    } catch (e) {
      console.error('Redis GET error:', e.message);
      return null;
    }
  },

  async del(key) {
    if (!(await ensureRedisReady())) return null;
    try {
      return await redis.del(key);
    } catch (e) {
      console.error('Redis DEL error:', e.message);
      return null;
    }
  },

  async incrWithExpiry(key, ttlSeconds) {
    if (!(await ensureRedisReady())) return 0;
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, ttlSeconds);
      return count;
    } catch (e) {
      console.error('Redis INCR error:', e.message);
      return 0;
    }
  },

  async blacklistToken(jti, ttlSeconds) {
    if (!(await ensureRedisReady())) return null;
    try {
      return await redis.setex(`bl:${jti}`, ttlSeconds, 1);
    } catch (e) {
      console.error('Blacklist error:', e.message);
      return null;
    }
  },

  async isBlacklisted(jti) {
    if (!(await ensureRedisReady())) return false;
    try {
      const res = await redis.get(`bl:${jti}`);
      return !!res;
    } catch {
      return false;
    }
  },

  async blacklistRefresh(jti, ttlSeconds) {
    if (!(await ensureRedisReady())) return null;
    try {
      return await redis.setex(`rbl:${jti}`, ttlSeconds, 1);
    } catch {
      return null;
    }
  },

  async isRefreshBlacklisted(jti) {
    if (!(await ensureRedisReady())) return false;
    try {
      const res = await redis.get(`rbl:${jti}`);
      return !!res;
    } catch {
      return false;
    }
  },
};

redis.on('connect', () => {
  console.log('✅ Redis connected');
});

redis.on('ready', () => {
  console.log('Redis status: ready');
});

redis.on('error', (err) => {
  if (redis.status !== 'closed' && redis.status !== 'end') {
    console.error('❌ Redis error:', err.message);
  }
});
