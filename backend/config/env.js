const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Known project root is always two levels above backend/config/
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Load .env if present without overwriting existing environment variables
const envPath = path.join(PROJECT_ROOT, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  }
}

function resolveDatabasePath() {
  const configured = process.env.DATABASE_PATH || process.env.DB_PATH || process.env.DB_FILE;
  if (configured && configured.trim()) {
    const clean = configured.trim();
    return path.isAbsolute(clean) ? clean : path.resolve(PROJECT_ROOT, clean);
  }
  return path.join(PROJECT_ROOT, 'database', 'ceylon_rail.db');
}

const resolvedDbPath = resolveDatabasePath();

const ENV = {
  PROJECT_ROOT,
  PORT: Number(process.env.PORT || 5000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_PATH: resolvedDbPath,
  DB_PATH: resolvedDbPath,
  DB_BACKUP_DIR: process.env.DB_BACKUP_DIR
    ? path.resolve(PROJECT_ROOT, process.env.DB_BACKUP_DIR)
    : path.join(PROJECT_ROOT, 'database', 'backups'),
  SESSION_SECRET:
    process.env.SESSION_SECRET ||
    crypto.createHash('sha256').update('ceylon-rail-session-key-v2').digest('hex'),
  QR_HMAC_SECRET:
    process.env.QR_HMAC_SECRET ||
    crypto.createHash('sha256').update('ceylon-rail-qr-hmac-key-v2').digest('hex'),
  PASSENGER_SESSION_TTL_HOURS: Number(process.env.PASSENGER_SESSION_TTL_HOURS || 24),
  STAFF_SESSION_TTL_HOURS: Number(process.env.STAFF_SESSION_TTL_HOURS || 12),
  SEAT_LOCK_TTL_MINUTES: Number(process.env.SEAT_LOCK_TTL_MINUTES || 10),
  AUTH_RATE_LIMIT_WINDOW_MS: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 60000),
  AUTH_RATE_LIMIT_MAX_ATTEMPTS: Number(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS || 15),

  // Initial Administrator Account
  INITIAL_ADMIN_USERNAME: process.env.INITIAL_ADMIN_USERNAME || 'admin',
  INITIAL_ADMIN_PASSWORD: process.env.INITIAL_ADMIN_PASSWORD || '1234',
  INITIAL_ADMIN_EMAIL: process.env.INITIAL_ADMIN_EMAIL || 'admin@railway.gov.lk',
  INITIAL_ADMIN_FULL_NAME: process.env.INITIAL_ADMIN_FULL_NAME || 'System Administrator',

  // Legacy Administrator Account preserved for backwards compatibility
  LEGACY_ADMIN_USERNAME: 'RDSD RATHNAYAKA',
  LEGACY_ADMIN_PASSWORD: process.env.LEGACY_ADMIN_PASSWORD || 'Sahan1550@',
  LEGACY_ADMIN_EMAIL: 'rdsd.rathnayaka@railway.gov.lk',

  // Payment Gateway Configuration
  PAYMENT_PROVIDER_MODE: process.env.PAYMENT_PROVIDER_MODE || 'SANDBOX_TEST',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  PAYHERE_MERCHANT_SECRET: process.env.PAYHERE_MERCHANT_SECRET || '',
  PAYMENT_WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET || '',

  // Maps & Live Telemetry Configuration
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || '',
  LIVE_TELEMETRY_AUTHORIZED_FEED: process.env.LIVE_TELEMETRY_AUTHORIZED_FEED === 'true',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  isExternalPaymentGatewayConfigured() {
    return Boolean(this.STRIPE_SECRET_KEY || this.PAYHERE_MERCHANT_SECRET);
  },

  isSandboxTestPaymentAllowed() {
    return this.PAYMENT_PROVIDER_MODE === 'SANDBOX_TEST' || this.NODE_ENV === 'test';
  },

  isGoogleMapsConfigured() {
    return Boolean(this.GOOGLE_MAPS_API_KEY && this.GOOGLE_MAPS_API_KEY.trim().length > 0);
  }
};

module.exports = ENV;
