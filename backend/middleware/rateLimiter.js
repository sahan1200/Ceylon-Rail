const env = require('../config/env');

const buckets = new Map();

function createRateLimiter({ windowMs = env.AUTH_RATE_LIMIT_WINDOW_MS, maxAttempts = env.AUTH_RATE_LIMIT_MAX_ATTEMPTS, keyPrefix = 'global' } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    const identifier = req.body?.email || req.body?.username || '';
    const key = `${keyPrefix}:${ip}:${String(identifier).toLowerCase()}`;
    const now = Date.now();

    const record = buckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + windowMs;
    }

    record.count += 1;
    buckets.set(key, record);

    if (record.count > maxAttempts) {
      const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        success: false,
        error: `Too many attempts. Please wait ${retryAfterSec} seconds before trying again.`
      });
    }

    next();
  };
}

function resetRateLimiter() {
  buckets.clear();
}

module.exports = {
  createRateLimiter,
  resetRateLimiter
};
