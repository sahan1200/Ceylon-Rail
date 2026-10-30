const { dbAll, dbGet, dbRun } = require('../database');
const { generateSessionToken, hashToken } = require('../utils/cryptoUtils');
const env = require('../config/env');

function findStaffByUsernameOrEmail(identifier) {
  if (!identifier) return null;
  const clean = String(identifier).trim();
  return dbGet(
    `SELECT su.*, r.code AS role_code, r.name AS role_name
     FROM staff_users su
     JOIN roles r ON r.id = su.role_id
     WHERE lower(su.username) = lower(?) OR lower(su.email) = lower(?)`,
    [clean, clean]
  );
}

function findStaffById(staffId) {
  return dbGet(
    `SELECT su.id, su.username, su.email, su.full_name, su.employee_code, su.phone,
            su.department, su.assigned_station_id, su.is_active, su.must_change_password,
            su.last_login_at, su.password_changed_at, su.created_at,
            r.id AS role_id, r.code AS role_code, r.name AS role_name,
            st.name AS assigned_station_name, st.code AS assigned_station_code
     FROM staff_users su
     JOIN roles r ON r.id = su.role_id
     LEFT JOIN stations st ON st.id = su.assigned_station_id
     WHERE su.id = ?`,
    [staffId]
  );
}

function createStaffSession(staffUserId, ipAddress = null, userAgent = null) {
  const { rawToken, tokenHash } = generateSessionToken();
  const ttlHours = env.STAFF_SESSION_TTL_HOURS || 12;
  dbRun(
    `INSERT INTO staff_sessions (staff_user_id, token_hash, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, datetime('now', '+' || ? || ' hours'))`,
    [staffUserId, tokenHash, ipAddress, userAgent, ttlHours]
  );
  dbRun(`UPDATE staff_users SET last_login_at = datetime('now') WHERE id = ?`, [staffUserId]);
  return rawToken;
}

function revokeStaffSession(rawToken) {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  dbRun(`UPDATE staff_sessions SET revoked_at = datetime('now') WHERE token_hash = ?`, [tokenHash]);
}

function revokeAllStaffSessions(staffUserId) {
  dbRun(`UPDATE staff_sessions SET revoked_at = datetime('now') WHERE staff_user_id = ? AND revoked_at IS NULL`, [staffUserId]);
}

function updateStaffPassword(staffUserId, newPasswordHash, mustChangePassword = 0) {
  dbRun(
    `UPDATE staff_users
     SET password_hash = ?,
         must_change_password = ?,
         password_changed_at = datetime('now'),
         updated_at = datetime('now')
     WHERE id = ?`,
    [newPasswordHash, mustChangePassword ? 1 : 0, staffUserId]
  );
}

function listAllStaff() {
  return dbAll(
    `SELECT su.id, su.username, su.email, su.full_name, su.employee_code, su.phone,
            su.department, su.assigned_station_id, su.is_active, su.must_change_password,
            su.last_login_at, su.created_at,
            r.code AS role_code, r.name AS role_name,
            st.name AS assigned_station_name
     FROM staff_users su
     JOIN roles r ON r.id = su.role_id
     LEFT JOIN stations st ON st.id = su.assigned_station_id
     ORDER BY su.id ASC`
  );
}

function listRoles() {
  return dbAll('SELECT id, code, name, description FROM roles ORDER BY id ASC');
}

function createStaffAccount({ username, email, fullName, passwordHash, roleCode, employeeCode, phone, department, assignedStationId, mustChangePassword = 1 }) {
  const roleRow = dbGet('SELECT id FROM roles WHERE code = ?', [roleCode]);
  if (!roleRow) {
    const err = new Error(`Invalid role code: ${roleCode}`);
    err.statusCode = 400;
    throw err;
  }
  const res = dbRun(
    `INSERT INTO staff_users (
      username, email, full_name, password_hash, role_id, employee_code,
      phone, department, assigned_station_id, is_active, must_change_password
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      username.trim(),
      email.toLowerCase().trim(),
      fullName.trim(),
      passwordHash,
      roleRow.id,
      employeeCode || null,
      phone || null,
      department || 'Railway Operations',
      assignedStationId || null,
      mustChangePassword ? 1 : 0
    ]
  );
  return findStaffById(res.lastID);
}

function updateStaffAccount(staffId, updates) {
  const current = findStaffById(staffId);
  if (!current) return null;

  let roleId = current.role_id;
  if (updates.role_code) {
    const r = dbGet('SELECT id FROM roles WHERE code = ?', [updates.role_code]);
    if (!r) {
      const err = new Error(`Invalid role code: ${updates.role_code}`);
      err.statusCode = 400;
      throw err;
    }
    roleId = r.id;
  }

  const isActive = updates.is_active !== undefined ? (updates.is_active ? 1 : 0) : current.is_active;
  dbRun(
    `UPDATE staff_users
     SET full_name = COALESCE(?, full_name),
         email = COALESCE(?, email),
         phone = COALESCE(?, phone),
         department = COALESCE(?, department),
         assigned_station_id = COALESCE(?, assigned_station_id),
         role_id = ?,
         is_active = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [
      updates.full_name ?? null,
      updates.email ? updates.email.toLowerCase().trim() : null,
      updates.phone ?? null,
      updates.department ?? null,
      updates.assigned_station_id ?? null,
      roleId,
      isActive,
      staffId
    ]
  );

  if (!isActive) {
    revokeAllStaffSessions(staffId);
  }

  return findStaffById(staffId);
}

function listAuditLogs(limit = 100) {
  return dbAll(
    `SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT ?`,
    [Math.min(Number(limit) || 100, 500)]
  );
}

module.exports = {
  findStaffByUsernameOrEmail,
  findStaffById,
  createStaffSession,
  revokeStaffSession,
  revokeAllStaffSessions,
  updateStaffPassword,
  listAllStaff,
  listRoles,
  createStaffAccount,
  updateStaffAccount,
  listAuditLogs
};
