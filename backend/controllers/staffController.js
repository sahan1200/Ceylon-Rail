const {
  findStaffByUsernameOrEmail,
  findStaffById,
  createStaffSession,
  revokeStaffSession,
  updateStaffPassword,
  listAllStaff,
  listRoles,
  createStaffAccount,
  updateStaffAccount,
  listAuditLogs
} = require('../repositories/staffRepository');
const { hashPassword, verifyPassword, validatePasswordStrength } = require('../utils/cryptoUtils');
const { sanitizeString, validateEmail } = require('../middleware/validation');
const { recordAuditLog } = require('../middleware/auth');

function staffLogin(req, res) {
  const identifier = sanitizeString(req.body?.username || req.body?.email, 160);
  const password = req.body?.password;

  if (!identifier || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username/email and password are required.'
    });
  }

  const staffRow = findStaffByUsernameOrEmail(identifier);
  if (!staffRow || !staffRow.is_active || !verifyPassword(password, staffRow.password_hash)) {
    recordAuditLog({
      actorType: 'STAFF',
      actorIdentifier: identifier,
      action: 'STAFF_LOGIN_FAILED',
      entityType: 'staff_users',
      ipAddress: req.ip
    });
    return res.status(401).json({
      success: false,
      error: 'Invalid staff username or password.'
    });
  }

  const token = createStaffSession(staffRow.id, req.ip, req.headers?.['user-agent']);
  const safeStaff = findStaffById(staffRow.id);

  recordAuditLog({
    actorType: 'STAFF',
    actorId: staffRow.id,
    actorIdentifier: staffRow.username,
    action: 'STAFF_LOGIN_SUCCESS',
    entityType: 'staff_users',
    entityId: staffRow.id,
    details: { role: staffRow.role_code, must_change_password: Boolean(staffRow.must_change_password) },
    ipAddress: req.ip
  });

  return res.json({
    success: true,
    token,
    must_change_password: Boolean(staffRow.must_change_password),
    staff: safeStaff
  });
}

function staffLogout(req, res) {
  if (req.rawToken) {
    revokeStaffSession(req.rawToken);
  }
  return res.json({
    success: true,
    message: 'Signed out of Railway Staff Portal.'
  });
}

function getStaffMe(req, res) {
  const safeStaff = findStaffById(req.staff.id);
  return res.json({
    success: true,
    staff: safeStaff
  });
}

function changeStaffPassword(req, res) {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({
      success: false,
      error: 'current_password and new_password are required.'
    });
  }

  const fullStaff = findStaffByUsernameOrEmail(req.staff.username);
  if (!fullStaff || !verifyPassword(current_password, fullStaff.password_hash)) {
    return res.status(401).json({
      success: false,
      error: 'Current password is incorrect.'
    });
  }

  if (current_password === new_password) {
    return res.status(400).json({
      success: false,
      error: 'New password must be different from your current temporary password.'
    });
  }

  const strength = validatePasswordStrength(new_password);
  if (!strength.valid) {
    return res.status(400).json({
      success: false,
      error: strength.reason
    });
  }

  const newHash = hashPassword(new_password);
  updateStaffPassword(req.staff.id, newHash, 0);

  recordAuditLog({
    actorType: 'STAFF',
    actorId: req.staff.id,
    actorIdentifier: req.staff.username,
    action: 'STAFF_PASSWORD_CHANGED',
    entityType: 'staff_users',
    entityId: req.staff.id,
    ipAddress: req.ip
  });

  const updatedStaff = findStaffById(req.staff.id);
  return res.json({
    success: true,
    message: 'Password updated successfully.',
    must_change_password: false,
    staff: updatedStaff
  });
}

function listStaffMembers(req, res) {
  return res.json({
    success: true,
    staff: listAllStaff(),
    roles: listRoles()
  });
}

function createNewStaffMember(req, res) {
  const username = sanitizeString(req.body?.username, 80);
  const email = sanitizeString(req.body?.email, 160).toLowerCase();
  const fullName = sanitizeString(req.body?.full_name, 120);
  const password = req.body?.password;
  const roleCode = sanitizeString(req.body?.role_code || 'STATION_STAFF', 40).toUpperCase();

  if (!username || !email || !fullName || !password) {
    return res.status(400).json({
      success: false,
      error: 'username, email, full_name, and password are required.'
    });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({
      success: false,
      error: 'Please provide a valid staff email address.'
    });
  }

  const strength = validatePasswordStrength(password);
  if (!strength.valid) {
    return res.status(400).json({
      success: false,
      error: strength.reason
    });
  }

  // Only SUPER_ADMIN can create another SUPER_ADMIN or ADMIN
  if (['SUPER_ADMIN', 'ADMIN'].includes(roleCode) && req.staff.role_code !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'Only a SUPER_ADMIN can provision SUPER_ADMIN or ADMIN staff accounts.'
    });
  }

  const existing = findStaffByUsernameOrEmail(username) || findStaffByUsernameOrEmail(email);
  if (existing) {
    return res.status(409).json({
      success: false,
      error: 'A staff member with that username or email already exists.'
    });
  }

  const passwordHash = hashPassword(password);
  const created = createStaffAccount({
    username,
    email,
    fullName,
    passwordHash,
    roleCode,
    employeeCode: req.body?.employee_code,
    phone: req.body?.phone,
    department: req.body?.department,
    assignedStationId: req.body?.assigned_station_id ? Number(req.body.assigned_station_id) : null,
    mustChangePassword: req.body?.must_change_password !== undefined ? Boolean(req.body.must_change_password) : true
  });

  recordAuditLog({
    actorType: 'STAFF',
    actorId: req.staff.id,
    actorIdentifier: req.staff.username,
    action: 'STAFF_ACCOUNT_CREATED',
    entityType: 'staff_users',
    entityId: created.id,
    details: { created_username: created.username, role_code: created.role_code },
    ipAddress: req.ip
  });

  return res.status(201).json({
    success: true,
    staff: created
  });
}

function updateStaffMember(req, res) {
  const targetId = Number(req.params.id);
  const target = findStaffById(targetId);
  if (!target) {
    return res.status(404).json({ success: false, error: 'Staff account not found.' });
  }

  // Prevent deactivating the last SUPER_ADMIN
  if (target.role_code === 'SUPER_ADMIN' && req.body?.is_active === false) {
    return res.status(400).json({
      success: false,
      error: 'Cannot deactivate the primary SUPER_ADMIN account.'
    });
  }

  const updated = updateStaffAccount(targetId, req.body || {});
  recordAuditLog({
    actorType: 'STAFF',
    actorId: req.staff.id,
    actorIdentifier: req.staff.username,
    action: 'STAFF_ACCOUNT_UPDATED',
    entityType: 'staff_users',
    entityId: targetId,
    details: req.body,
    ipAddress: req.ip
  });

  return res.json({
    success: true,
    staff: updated
  });
}

function getAuditLogs(req, res) {
  const logs = listAuditLogs(req.query?.limit || 100);
  return res.json({
    success: true,
    audit_logs: logs
  });
}

module.exports = {
  staffLogin,
  staffLogout,
  getStaffMe,
  changeStaffPassword,
  listStaffMembers,
  createNewStaffMember,
  updateStaffMember,
  getAuditLogs
};
