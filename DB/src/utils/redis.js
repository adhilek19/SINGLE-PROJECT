import Redis from 'ioredis';
import { env } from '../config/env.js';

const memoryStore = new Map();

const now = () => Date.now();

const memorySetex = (key, seconds, value) => {
  memoryStore.set(key, {
    value: String(value),
    expiresAt: now() + Number(seconds) * 1000,
  });
  return 'OK';
};

const memoryGet = (key) => {
  const item = memoryStore.get(key);
  if (!item) return null;

  if (item.expiresAt && item.expiresAt <= now()) {
    memoryStore.delete(key);
    return null;
  }

  return item.value;
};

const memoryDel = (key) => {
  const existed = memoryStore.delete(key);
  return existed ? 1 : 0;
};

const memoryIncrWithExpiry = (key, ttlSeconds) => {
  const current = Number(memoryGet(key) || 0) + 1;
  memorySetex(key, ttlSeconds, current);
  return current;
};

export const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => {
        if (times > 2) {
          console.warn('Redis unavailable → using in-memory fallback');
          return null;
        }
        return Math.min(times * 200, 1000);
      },
      lazyConnect: true,
    })
  : {
      status: 'disabled',
      connect: async () => null,
      on: () => {},
    };

let redisConnectPromise = null;
let warnedMemoryFallback = false;

const warnFallbackOnce = () => {
  if (warnedMemoryFallback) return;
  warnedMemoryFallback = true;
  console.warn('Redis not ready → OTP/rate-limit fallback is in-memory for this server process');
};

const ensureRedisReady = async () => {
  if (!env.REDIS_URL) return false;
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
    console.warn('Redis unavailable → continuing with in-memory fallback:', e.message);
    return false;
  }
};

export const connectRedis = ensureRedisReady;

export const safeRedis = {
  async setex(key, seconds, value) {
    if (!(await ensureRedisReady())) {
      warnFallbackOnce();
      return memorySetex(key, seconds, value);
    }

    try {
      return await redis.setex(key, seconds, value);
    } catch (e) {
      console.error('Redis SETEX error → using memory fallback:', e.message);
      return memorySetex(key, seconds, value);
    }
  },

  async get(key) {
    if (!(await ensureRedisReady())) {
      warnFallbackOnce();
      return memoryGet(key);
    }

    try {
      return await redis.get(key);
    } catch (e) {
      console.error('Redis GET error → using memory fallback:', e.message);
      return memoryGet(key);
    }
  },

  async del(key) {
    memoryDel(key);

    if (!(await ensureRedisReady())) return 0;

    try {
      return await redis.del(key);
    } catch (e) {
      console.error('Redis DEL error:', e.message);
      return 0;
    }
  },

  async incrWithExpiry(key, ttlSeconds) {
    if (!(await ensureRedisReady())) {
      warnFallbackOnce();
      return memoryIncrWithExpiry(key, ttlSeconds);
    }

    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, ttlSeconds);
      return count;
    } catch (e) {
      console.error('Redis INCR error → using memory fallback:', e.message);
      return memoryIncrWithExpiry(key, ttlSeconds);
    }
  },

  async blacklistToken(jti, ttlSeconds) {
    return this.setex(`bl:${jti}`, ttlSeconds, 1);
  },

  async isBlacklisted(jti) {
    return Boolean(await this.get(`bl:${jti}`));
  },

  async blacklistRefresh(jti, ttlSeconds) {
    return this.setex(`rbl:${jti}`, ttlSeconds, 1);
  },

  async isRefreshBlacklisted(jti) {
    return Boolean(await this.get(`rbl:${jti}`));
  },
};

redis.on?.('connect', () => {
  console.log('✅ Redis connected');
});

redis.on?.('ready', () => {
  console.log('Redis status: ready');
});

redis.on?.('error', (err) => {
  if (redis.status !== 'closed' && redis.status !== 'end') {
    console.error('❌ Redis error:', err.message);
  }
});
