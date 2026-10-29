const crypto = require('crypto');
const env = require('../config/env');

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const KEY_LEN = 64;

/**
 * Hash a plaintext password using Node.js crypto.scryptSync with a random 16-byte salt.
 * Format: scrypt$N$r$p$saltHex$derivedKeyHex
 */
function hashPassword(plainPassword) {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plainPassword, salt, KEY_LEN, SCRYPT_PARAMS).toString('hex');
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt}$${derived}`;
}

/**
 * Verify a plaintext password against a stored scrypt hash using timingSafeEqual.
 */
function verifyPassword(plainPassword, storedHash) {
  if (!plainPassword || !storedHash || typeof storedHash !== 'string') {
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, nStr, rStr, pStr, salt, expectedHex] = parts;
  const N = parseInt(nStr, 10) || 16384;
  const r = parseInt(rStr, 10) || 8;
  const p = parseInt(pStr, 10) || 1;
  try {
    const derivedBuf = crypto.scryptSync(plainPassword, salt, KEY_LEN, {
      N,
      r,
      p,
      maxmem: 32 * 1024 * 1024
    });
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    if (derivedBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derivedBuf, expectedBuf);
  } catch (_err) {
    return false;
  }
}

/**
 * Validate sensible password policy:
 * Do not force unnecessarily complicated symbol/case combinations; allow memorable passwords
 * subject to sensible length (>= 6 chars) and basic security checks.
 */
function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, reason: 'Password is required.' };
  }
  const trimmed = password.trim();
  if (trimmed.length < 6) {
    return { valid: false, reason: 'Password must be at least 6 characters long.' };
  }
  if (trimmed.length > 128) {
    return { valid: false, reason: 'Password must not exceed 128 characters.' };
  }
  const weakList = ['password', '123456', 'qwerty', 'admin123'];
  if (weakList.includes(trimmed.toLowerCase())) {
    return { valid: false, reason: 'Please choose a less common password.' };
  }
  return { valid: true };
}

/**
 * Generate a cryptographically random opaque session token and its SHA-256 storage hash.
 */
function generateSessionToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenHash };
}

function hashToken(rawToken) {
  return crypto
    .createHmac('sha256', env.SESSION_SECRET)
    .update(String(rawToken))
    .digest('hex');
}

/**
 * Sign a payload string with HMAC-SHA256 using QR_HMAC_SECRET.
 */
function signQrPayload(payloadString) {
  return crypto
    .createHmac('sha256', env.QR_HMAC_SECRET)
    .update(String(payloadString))
    .digest('hex')
    .slice(0, 24)
    .toUpperCase();
}

function verifyQrSignature(payloadString, signature) {
  if (!payloadString || !signature) return false;
  const expected = signQrPayload(payloadString);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature).toUpperCase(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verify webhook HMAC signature for external payment gateway callbacks.
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!env.PAYMENT_WEBHOOK_SECRET || !signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET)
    .update(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody))
    .digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signatureHeader), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  generateSessionToken,
  hashToken,
  signQrPayload,
  verifyQrSignature,
  verifyWebhookSignature
};
