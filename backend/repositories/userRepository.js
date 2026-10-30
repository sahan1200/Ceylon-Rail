const { dbAll, dbGet, dbRun, withTransaction } = require('../database');
const { generateSessionToken, hashToken } = require('../utils/cryptoUtils');
const env = require('../config/env');

function findUserByEmail(email) {
  return dbGet('SELECT * FROM users WHERE lower(email) = lower(?)', [String(email).trim()]);
}

function findUserById(userId) {
  const user = dbGet(
    `SELECT u.id, u.full_name, u.email, u.phone, u.nic_passport, u.role, u.preferred_language, u.is_active, u.created_at,
            p.date_of_birth, p.nationality, p.address_line1, p.city, p.country,
            p.emergency_contact_name, p.emergency_contact_phone,
            p.default_seat_preference, p.concession_type
     FROM users u
     LEFT JOIN passenger_profiles p ON p.user_id = u.id
     WHERE u.id = ?`,
    [userId]
  );
  return user;
}

function createPassengerUser({ fullName, email, phone, nicPassport, passwordHash, preferredLanguage = 'EN' }) {
  return withTransaction(() => {
    const res = dbRun(
      `INSERT INTO users (full_name, email, phone, nic_passport, password_hash, role, preferred_language, is_active)
       VALUES (?, ?, ?, ?, ?, 'PASSENGER', ?, 1)`,
      [fullName, email.toLowerCase().trim(), phone || '', nicPassport || '', passwordHash, preferredLanguage]
    );
    const userId = res.lastID;
    dbRun(
      `INSERT INTO passenger_profiles (user_id, nationality, country, default_seat_preference, concession_type)
       VALUES (?, 'Sri Lankan', 'Sri Lanka', 'WINDOW', 'NONE')`,
      [userId]
    );
    return findUserById(userId);
  });
}

function updatePassengerProfile(userId, payload) {
  return withTransaction(() => {
    const current = findUserById(userId);
    if (!current) return null;

    const fullName = payload.full_name !== undefined ? String(payload.full_name).trim() : current.full_name;
    const phone = payload.phone !== undefined ? String(payload.phone).trim() : current.phone;
    const nicPassport = payload.nic_passport !== undefined ? String(payload.nic_passport).trim() : current.nic_passport;
    const preferredLanguage =
      payload.preferred_language && ['EN', 'SI', 'TA'].includes(payload.preferred_language)
        ? payload.preferred_language
        : current.preferred_language || 'EN';

    dbRun(
      `UPDATE users
       SET full_name = ?, phone = ?, nic_passport = ?, preferred_language = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [fullName, phone, nicPassport, preferredLanguage, userId]
    );

    const existingProfile = dbGet('SELECT id FROM passenger_profiles WHERE user_id = ?', [userId]);
    if (!existingProfile) {
      dbRun('INSERT INTO passenger_profiles (user_id) VALUES (?)', [userId]);
    }

    dbRun(
      `UPDATE passenger_profiles
       SET date_of_birth = COALESCE(?, date_of_birth),
           nationality = COALESCE(?, nationality),
           address_line1 = COALESCE(?, address_line1),
           city = COALESCE(?, city),
           country = COALESCE(?, country),
           emergency_contact_name = COALESCE(?, emergency_contact_name),
           emergency_contact_phone = COALESCE(?, emergency_contact_phone),
           default_seat_preference = COALESCE(?, default_seat_preference),
           concession_type = COALESCE(?, concession_type),
           updated_at = datetime('now')
       WHERE user_id = ?`,
      [
        payload.date_of_birth ?? null,
        payload.nationality ?? null,
        payload.address_line1 ?? null,
        payload.city ?? null,
        payload.country ?? null,
        payload.emergency_contact_name ?? null,
        payload.emergency_contact_phone ?? null,
        payload.default_seat_preference ?? null,
        payload.concession_type ?? null,
        userId
      ]
    );

    return findUserById(userId);
  });
}

function createPassengerSession(userId, ipAddress = null, userAgent = null) {
  const { rawToken, tokenHash } = generateSessionToken();
  const ttlHours = env.PASSENGER_SESSION_TTL_HOURS || 24;
  dbRun(
    `INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, datetime('now', '+' || ? || ' hours'))`,
    [userId, tokenHash, ipAddress, userAgent, ttlHours]
  );
  return rawToken;
}

function revokePassengerSession(rawToken) {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  dbRun(`UPDATE user_sessions SET revoked_at = datetime('now') WHERE token_hash = ?`, [tokenHash]);
}

function createNotification({ userId = null, staffUserId = null, type = 'SYSTEM', title, message, relatedEntityType = null, relatedEntityId = null }) {
  return dbRun(
    `INSERT INTO notifications (user_id, staff_user_id, type, title, message, related_entity_type, related_entity_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, staffUserId, type, title, message, relatedEntityType, relatedEntityId ? String(relatedEntityId) : null]
  );
}

function getPassengerNotifications(userId) {
  return dbAll(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
}

function markNotificationRead(notificationId, userId) {
  return dbRun(
    `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
    [notificationId, userId]
  );
}

module.exports = {
  findUserByEmail,
  findUserById,
  createPassengerUser,
  updatePassengerProfile,
  createPassengerSession,
  revokePassengerSession,
  createNotification,
  getPassengerNotifications,
  markNotificationRead
};
