const { dbGet, dbRun } = require('../database');
const { hashToken } = require('../utils/cryptoUtils');

function extractBearerToken(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

/**
 * Resolve an active passenger session from a raw Bearer token.
 */
function getPassengerFromToken(rawToken) {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const row = dbGet(
    `SELECT
       s.id AS session_id,
       s.expires_at,
       u.id,
       u.full_name,
       u.email,
       u.phone,
       u.nic_passport,
       u.role,
       u.preferred_language,
       u.is_active
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?
       AND s.revoked_at IS NULL
       AND datetime(s.expires_at) > datetime('now')
       AND u.is_active = 1`,
    [tokenHash]
  );
  return row || null;
}

/**
 * Resolve an active staff session from a raw Bearer token.
 */
function getStaffFromToken(rawToken) {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const row = dbGet(
    `SELECT
       ss.id AS session_id,
       ss.expires_at,
       su.id,
       su.username,
       su.email,
       su.full_name,
       su.employee_code,
       su.department,
       su.assigned_station_id,
       su.is_active,
       su.must_change_password,
       r.id AS role_id,
       r.code AS role_code,
       r.name AS role_name
     FROM staff_sessions ss
     JOIN staff_users su ON su.id = ss.staff_user_id
     JOIN roles r ON r.id = su.role_id
     WHERE ss.token_hash = ?
       AND ss.revoked_at IS NULL
       AND datetime(ss.expires_at) > datetime('now')
       AND su.is_active = 1`,
    [tokenHash]
  );
  return row || null;
}

/**
 * Require a valid passenger session.
 */
function authenticatePassenger(req, res, next) {
  const rawToken = extractBearerToken(req);
  const passenger = getPassengerFromToken(rawToken);
  if (!passenger) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please sign in to your passenger account.'
    });
  }
  req.user = passenger;
  req.rawToken = rawToken;
  next();
}

/**
 * Attach req.user if passenger token is valid, or allow anonymous/guest access.
 */
function optionalPassengerAuth(req, _res, next) {
  const rawToken = extractBearerToken(req);
  if (rawToken) {
    const passenger = getPassengerFromToken(rawToken);
    if (passenger) {
      req.user = passenger;
      req.rawToken = rawToken;
    }
  }
  next();
}

/**
 * Attach req.user or req.staff if a valid token is present, or allow anonymous guest access
 * so the controller can verify guest contact details (PNR + email/phone/NIC).
 */
function optionalPassengerOrStaffAuth(req, res, next) {
  const rawToken = extractBearerToken(req);
  if (rawToken) {
    const passenger = getPassengerFromToken(rawToken);
    if (passenger) {
      req.user = passenger;
      req.rawToken = rawToken;
      return next();
    }
    const staff = getStaffFromToken(rawToken);
    if (staff) {
      if (Number(staff.must_change_password) === 1) {
        return res.status(403).json({
          success: false,
          code: 'MUST_CHANGE_PASSWORD',
          error: 'You must change your initial password before accessing resources.'
        });
      }
      req.staff = staff;
      req.rawToken = rawToken;
      return next();
    }
  }
  next();
}

/**
 * Require a valid staff session. Enforces first-login password change when must_change_password = 1.
 */
function authenticateStaff(req, res, next) {
  const rawToken = extractBearerToken(req);
  const staff = getStaffFromToken(rawToken);
  if (!staff) {
    return res.status(401).json({
      success: false,
      error: 'Staff authentication required. Please sign in through the Railway Staff Portal.'
    });
  }

  const allowedFirstLoginPaths = [
    '/api/staff/auth/change-password',
    '/api/staff/auth/me',
    '/api/staff/auth/logout'
  ];
  const currentPath = req.originalUrl || req.path || '';
  const isAllowedPath = allowedFirstLoginPaths.some((p) => currentPath.startsWith(p));

  if (Number(staff.must_change_password) === 1 && !isAllowedPath) {
    return res.status(403).json({
      success: false,
      code: 'MUST_CHANGE_PASSWORD',
      error: 'You must change your temporary initial password before accessing railway staff resources.'
    });
  }

  req.staff = staff;
  req.rawToken = rawToken;
  next();
}

/**
 * Role-based authorization middleware for staff routes.
 * SUPER_ADMIN always has full authorization across all staff roles.
 */
function requireStaffRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.staff) {
      return res.status(401).json({
        success: false,
        error: 'Staff authentication required.'
      });
    }
    if (req.staff.role_code === 'SUPER_ADMIN' || allowedRoles.includes(req.staff.role_code)) {
      return next();
    }
    return res.status(403).json({
      success: false,
      error: `Access denied. Required role: ${allowedRoles.join(' or ')}. Current role: ${req.staff.role_code}.`
    });
  };
}

/**
 * Allow either an authenticated passenger or an authenticated staff member.
 */
function authenticatePassengerOrStaff(req, res, next) {
  const rawToken = extractBearerToken(req);
  const passenger = getPassengerFromToken(rawToken);
  if (passenger) {
    req.user = passenger;
    req.rawToken = rawToken;
    return next();
  }
  const staff = getStaffFromToken(rawToken);
  if (staff) {
    if (Number(staff.must_change_password) === 1) {
      return res.status(403).json({
        success: false,
        code: 'MUST_CHANGE_PASSWORD',
        error: 'You must change your initial password before accessing resources.'
      });
    }
    req.staff = staff;
    req.rawToken = rawToken;
    return next();
  }
  return res.status(401).json({
    success: false,
    error: 'Authentication required.'
  });
}

function recordAuditLog({ actorType, actorId, actorIdentifier, action, entityType, entityId, details, ipAddress }) {
  try {
    dbRun(
      `INSERT INTO audit_logs (
        actor_type, actor_id, actor_identifier, action, entity_type, entity_id, details_json, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        actorType || 'SYSTEM',
        actorId || null,
        actorIdentifier || null,
        action,
        entityType || null,
        entityId !== undefined && entityId !== null ? String(entityId) : null,
        details ? JSON.stringify(details) : null,
        ipAddress || null
      ]
    );
  } catch (_err) {}
}

module.exports = {
  extractBearerToken,
  getPassengerFromToken,
  getStaffFromToken,
  authenticatePassenger,
  optionalPassengerAuth,
  optionalPassengerOrStaffAuth,
  authenticateStaff,
  requireStaffRoles,
  authenticatePassengerOrStaff,
  recordAuditLog
};
