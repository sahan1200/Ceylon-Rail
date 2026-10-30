const {
  findUserByEmail,
  findUserById,
  createPassengerUser,
  updatePassengerProfile,
  createPassengerSession,
  revokePassengerSession,
  getPassengerNotifications,
  markNotificationRead
} = require('../repositories/userRepository');
const { hashPassword, verifyPassword, validatePasswordStrength } = require('../utils/cryptoUtils');
const { validateEmail, sanitizeString } = require('../middleware/validation');
const { recordAuditLog } = require('../middleware/auth');

function registerPassenger(req, res) {
  const fullName = sanitizeString(req.body?.full_name, 120);
  const email = sanitizeString(req.body?.email, 160).toLowerCase();
  const phone = sanitizeString(req.body?.phone, 40);
  const nicPassport = sanitizeString(req.body?.nic_passport, 40);
  const password = req.body?.password;
  const preferredLanguage = ['EN', 'SI', 'TA'].includes(req.body?.preferred_language)
    ? req.body.preferred_language
    : 'EN';

  if (!fullName || !email || !password) {
    return res.status(400).json({
      success: false,
      error: 'full_name, email, and password are required.'
    });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({
      success: false,
      error: 'Please provide a valid email address.'
    });
  }

  const strength = validatePasswordStrength(password);
  if (!strength.valid) {
    return res.status(400).json({
      success: false,
      error: strength.reason
    });
  }

  const existing = findUserByEmail(email);
  if (existing) {
    return res.status(409).json({
      success: false,
      error: 'An account with this email address already exists.'
    });
  }

  const passwordHash = hashPassword(password);
  const user = createPassengerUser({
    fullName,
    email,
    phone,
    nicPassport,
    passwordHash,
    preferredLanguage
  });

  const token = createPassengerSession(user.id, req.ip, req.headers?.['user-agent']);

  recordAuditLog({
    actorType: 'PASSENGER',
    actorId: user.id,
    actorIdentifier: user.email,
    action: 'PASSENGER_REGISTERED',
    entityType: 'users',
    entityId: user.id,
    ipAddress: req.ip
  });

  return res.status(201).json({
    success: true,
    token,
    user
  });
}

function loginPassenger(req, res) {
  const email = sanitizeString(req.body?.email, 160).toLowerCase();
  const password = req.body?.password;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required.'
    });
  }

  const userRow = findUserByEmail(email);
  if (!userRow || !userRow.is_active || !verifyPassword(password, userRow.password_hash)) {
    recordAuditLog({
      actorType: 'PASSENGER',
      actorIdentifier: email,
      action: 'PASSENGER_LOGIN_FAILED',
      entityType: 'users',
      ipAddress: req.ip
    });
    return res.status(401).json({
      success: false,
      error: 'Invalid email or password.'
    });
  }

  const token = createPassengerSession(userRow.id, req.ip, req.headers?.['user-agent']);
  const profile = findUserById(userRow.id);

  recordAuditLog({
    actorType: 'PASSENGER',
    actorId: userRow.id,
    actorIdentifier: userRow.email,
    action: 'PASSENGER_LOGIN_SUCCESS',
    entityType: 'users',
    entityId: userRow.id,
    ipAddress: req.ip
  });

  return res.json({
    success: true,
    token,
    user: profile
  });
}

function logoutPassenger(req, res) {
  if (req.rawToken) {
    revokePassengerSession(req.rawToken);
  }
  return res.json({
    success: true,
    message: 'Signed out successfully.'
  });
}

function getOwnProfile(req, res) {
  const profile = findUserById(req.user.id);
  return res.json({
    success: true,
    user: profile
  });
}

function updateOwnProfile(req, res) {
  const updated = updatePassengerProfile(req.user.id, req.body || {});
  recordAuditLog({
    actorType: 'PASSENGER',
    actorId: req.user.id,
    actorIdentifier: req.user.email,
    action: 'PASSENGER_PROFILE_UPDATED',
    entityType: 'users',
    entityId: req.user.id,
    ipAddress: req.ip
  });
  return res.json({
    success: true,
    user: updated
  });
}

function listNotifications(req, res) {
  const notifications = getPassengerNotifications(req.user.id);
  return res.json({
    success: true,
    notifications
  });
}

function markNotificationAsRead(req, res) {
  markNotificationRead(Number(req.params.id), req.user.id);
  return res.json({
    success: true
  });
}

module.exports = {
  registerPassenger,
  loginPassenger,
  logoutPassenger,
  getOwnProfile,
  updateOwnProfile,
  listNotifications,
  markNotificationAsRead
};
