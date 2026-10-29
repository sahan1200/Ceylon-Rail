const { dbAll, dbGet, dbRun, withTransaction } = require('../database');

function enrichComplaint(complaint, { includeInternalNotes = false } = {}) {
  if (!complaint) return null;

  const statusHistory = dbAll(
    `SELECT * FROM complaint_status_history WHERE complaint_id = ? ORDER BY created_at ASC, id ASC`,
    [complaint.id]
  );

  const assignments = dbAll(
    `SELECT ca.*,
            su.full_name AS assigned_to_name, su.username AS assigned_to_username,
            sb.full_name AS assigned_by_name
     FROM complaint_assignments ca
     JOIN staff_users su ON su.id = ca.assigned_to_staff_id
     LEFT JOIN staff_users sb ON sb.id = ca.assigned_by_staff_id
     WHERE ca.complaint_id = ?
     ORDER BY ca.assigned_at DESC, ca.id DESC`,
    [complaint.id]
  );

  const responseQuery = includeInternalNotes
    ? `SELECT * FROM complaint_responses WHERE complaint_id = ? ORDER BY created_at ASC, id ASC`
    : `SELECT * FROM complaint_responses WHERE complaint_id = ? AND is_internal_note = 0 ORDER BY created_at ASC, id ASC`;

  const responses = dbAll(responseQuery, [complaint.id]);
  const attachments = dbAll(
    `SELECT * FROM complaint_attachments WHERE complaint_id = ? ORDER BY created_at ASC`,
    [complaint.id]
  );

  return {
    ...complaint,
    passenger_name: complaint.passenger_name || complaint.guest_name || 'Guest Passenger',
    passenger_email: complaint.passenger_email || complaint.guest_email || null,
    passenger_phone: complaint.passenger_phone || complaint.guest_phone || null,
    booking_pnr: complaint.booking_pnr || complaint.raw_booking_pnr || null,
    status_history: statusHistory,
    assignments,
    current_assignee: assignments.find((a) => a.is_active === 1) || null,
    responses,
    attachments
  };
}

function createComplaint(userId, payload) {
  return withTransaction(() => {
    const ref = `CMP-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    const priority = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(payload.priority)
      ? payload.priority
      : 'MEDIUM';

    let resolvedBookingId = payload.booking_id ? Number(payload.booking_id) : null;
    let resolvedBookingPnr = payload.booking_pnr ? String(payload.booking_pnr).trim().toUpperCase() : null;
    if (!resolvedBookingId && resolvedBookingPnr) {
      const bRow = dbGet('SELECT id, pnr FROM bookings WHERE upper(pnr) = upper(?)', [resolvedBookingPnr]);
      if (bRow) {
        resolvedBookingId = bRow.id;
        resolvedBookingPnr = bRow.pnr;
      }
    }

    const res = dbRun(
      `INSERT INTO complaints (
        complaint_reference, user_id, guest_name, guest_email, guest_phone,
        booking_id, booking_pnr, train_id, station_id,
        category, subject, description, priority, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED')`,
      [
        ref,
        userId || null,
        payload.guest_name ? String(payload.guest_name).trim() : null,
        payload.guest_email ? String(payload.guest_email).trim().toLowerCase() : null,
        payload.guest_phone ? String(payload.guest_phone).trim() : null,
        resolvedBookingId,
        resolvedBookingPnr,
        payload.train_id ? Number(payload.train_id) : null,
        payload.station_id ? Number(payload.station_id) : null,
        payload.category || 'SERVICE_QUALITY',
        String(payload.subject).trim(),
        String(payload.description).trim(),
        priority
      ]
    );
    const complaintId = res.lastID;

    dbRun(
      `INSERT INTO complaint_status_history (
        complaint_id, previous_status, new_status, changed_by_type, changed_by_id, notes
      ) VALUES (?, NULL, 'SUBMITTED', 'PASSENGER', ?, 'Initial complaint submitted by passenger')`,
      [complaintId, userId || null]
    );

    if (Array.isArray(payload.attachments)) {
      for (const att of payload.attachments) {
        if (att && att.file_name) {
          dbRun(
            `INSERT INTO complaint_attachments (complaint_id, file_name, mime_type, file_size_bytes, content_url_or_data)
             VALUES (?, ?, ?, ?, ?)`,
            [
              complaintId,
              String(att.file_name).slice(0, 200),
              att.mime_type || 'application/octet-stream',
              Number(att.file_size_bytes) || 0,
              att.content_url_or_data || null
            ]
          );
        }
      }
    }

    return getComplaintByIdOrRef(complaintId, { includeInternalNotes: false });
  });
}

function getComplaintByIdOrRef(idOrRef, { includeInternalNotes = false } = {}) {
  const isNum = /^\d+$/.test(String(idOrRef));
  const row = dbGet(
    `SELECT c.*,
            COALESCE(u.full_name, c.guest_name) AS passenger_name,
            COALESCE(u.email, c.guest_email) AS passenger_email,
            COALESCE(u.phone, c.guest_phone) AS passenger_phone,
            COALESCE(b.pnr, c.booking_pnr) AS booking_pnr,
            c.booking_pnr AS raw_booking_pnr,
            t.train_number, t.name AS train_name,
            s.code AS station_code, s.name AS station_name
     FROM complaints c
     LEFT JOIN users u ON u.id = c.user_id
     LEFT JOIN bookings b ON b.id = c.booking_id
     LEFT JOIN trains t ON t.id = c.train_id
     LEFT JOIN stations s ON s.id = c.station_id
     WHERE ${isNum ? 'c.id = ?' : 'upper(c.complaint_reference) = upper(?)'}`,
    [isNum ? Number(idOrRef) : String(idOrRef).trim()]
  );
  return enrichComplaint(row, { includeInternalNotes });
}

function verifyGuestComplaintAccess(complaint, verificationInput) {
  if (!complaint || !verificationInput) return false;
  const clean = String(verificationInput).trim().toLowerCase();
  if (!clean || clean.length < 3) return false;

  const candidates = [
    complaint.passenger_email,
    complaint.guest_email,
    complaint.passenger_phone,
    complaint.guest_phone,
    complaint.booking_pnr
  ]
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());

  const normalizePhone = (s) => s.replace(/[\s\-()]/g, '');
  const normInput = normalizePhone(clean);

  for (const cand of candidates) {
    if (cand === clean) return true;
    const normCand = normalizePhone(cand);
    if (normCand.length >= 6 && normCand === normInput) return true;
  }
  return false;
}

function listComplaintsForUser(userId) {
  const rows = dbAll(
    `SELECT c.*,
            COALESCE(b.pnr, c.booking_pnr) AS booking_pnr,
            t.train_number, t.name AS train_name,
            s.code AS station_code, s.name AS station_name
     FROM complaints c
     LEFT JOIN bookings b ON b.id = c.booking_id
     LEFT JOIN trains t ON t.id = c.train_id
     LEFT JOIN stations s ON s.id = c.station_id
     WHERE c.user_id = ?
     ORDER BY c.created_at DESC, c.id DESC`,
    [userId]
  );
  return rows.map((r) => enrichComplaint(r, { includeInternalNotes: false }));
}

function listAllComplaints({ status, category, priority } = {}) {
  const conditions = ['1 = 1'];
  const params = [];
  if (status && status !== 'ALL') {
    conditions.push('c.status = ?');
    params.push(status);
  }
  if (category && category !== 'ALL') {
    conditions.push('c.category = ?');
    params.push(category);
  }
  if (priority && priority !== 'ALL') {
    conditions.push('c.priority = ?');
    params.push(priority);
  }

  const rows = dbAll(
    `SELECT c.*,
            COALESCE(u.full_name, c.guest_name, 'Guest Passenger') AS passenger_name,
            COALESCE(u.email, c.guest_email) AS passenger_email,
            COALESCE(u.phone, c.guest_phone) AS passenger_phone,
            COALESCE(b.pnr, c.booking_pnr) AS booking_pnr,
            t.train_number, t.name AS train_name,
            s.code AS station_code, s.name AS station_name
     FROM complaints c
     LEFT JOIN users u ON u.id = c.user_id
     LEFT JOIN bookings b ON b.id = c.booking_id
     LEFT JOIN trains t ON t.id = c.train_id
     LEFT JOIN stations s ON s.id = c.station_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE c.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END ASC,
       c.created_at DESC`,
    params
  );

  return rows.map((r) => enrichComplaint(r, { includeInternalNotes: true }));
}

function assignComplaint({ complaintId, assignedToStaffId, assignedByStaffId, notes }) {
  return withTransaction(() => {
    const complaint = dbGet('SELECT * FROM complaints WHERE id = ?', [complaintId]);
    if (!complaint) return null;

    dbRun('UPDATE complaint_assignments SET is_active = 0 WHERE complaint_id = ?', [complaintId]);
    dbRun(
      `INSERT INTO complaint_assignments (complaint_id, assigned_to_staff_id, assigned_by_staff_id, notes, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [complaintId, assignedToStaffId, assignedByStaffId || null, notes || null]
    );

    if (complaint.status === 'SUBMITTED') {
      dbRun(
        `UPDATE complaints SET status = 'UNDER_REVIEW', updated_at = datetime('now') WHERE id = ?`,
        [complaintId]
      );
      dbRun(
        `INSERT INTO complaint_status_history (complaint_id, previous_status, new_status, changed_by_type, changed_by_id, notes)
         VALUES (?, 'SUBMITTED', 'UNDER_REVIEW', 'STAFF', ?, ?)`,
        [complaintId, assignedByStaffId, notes || 'Assigned to complaint officer']
      );
    }

    return getComplaintByIdOrRef(complaintId, { includeInternalNotes: true });
  });
}

function updateComplaintStatus({ complaintId, newStatus, staffId, notes, resolutionSummary }) {
  return withTransaction(() => {
    const complaint = dbGet('SELECT * FROM complaints WHERE id = ?', [complaintId]);
    if (!complaint) return null;

    const prevStatus = complaint.status;
    const isResolved = newStatus === 'RESOLVED' || newStatus === 'CLOSED';
    dbRun(
      `UPDATE complaints
       SET status = ?,
           resolution_summary = COALESCE(?, resolution_summary),
           resolved_at = CASE WHEN ? = 1 THEN datetime('now') ELSE resolved_at END,
           updated_at = datetime('now')
       WHERE id = ?`,
      [newStatus, resolutionSummary || null, isResolved ? 1 : 0, complaintId]
    );

    dbRun(
      `INSERT INTO complaint_status_history (complaint_id, previous_status, new_status, changed_by_type, changed_by_id, notes)
       VALUES (?, ?, ?, 'STAFF', ?, ?)`,
      [complaintId, prevStatus, newStatus, staffId, notes || resolutionSummary || `Status changed to ${newStatus}`]
    );

    return getComplaintByIdOrRef(complaintId, { includeInternalNotes: true });
  });
}

function addComplaintResponse({ complaintId, authorType, authorId, authorName, message, isInternalNote = false }) {
  return withTransaction(() => {
    dbRun(
      `INSERT INTO complaint_responses (complaint_id, author_type, author_id, author_name, is_internal_note, message)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [complaintId, authorType, authorId || null, authorName, isInternalNote ? 1 : 0, String(message).trim()]
    );
    dbRun(`UPDATE complaints SET updated_at = datetime('now') WHERE id = ?`, [complaintId]);
    return getComplaintByIdOrRef(complaintId, { includeInternalNotes: authorType === 'STAFF' });
  });
}

function createFeedback(userId, payload) {
  const res = dbRun(
    `INSERT INTO feedback_submissions (
      user_id, guest_name, booking_id, train_id, overall_rating, punctuality_rating,
      cleanliness_rating, staff_behavior_rating, comments, is_public_testimonial
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId || null,
      payload.guest_name ? String(payload.guest_name).trim() : null,
      payload.booking_id ? Number(payload.booking_id) : null,
      payload.train_id ? Number(payload.train_id) : null,
      Number(payload.overall_rating),
      payload.punctuality_rating ? Number(payload.punctuality_rating) : null,
      payload.cleanliness_rating ? Number(payload.cleanliness_rating) : null,
      payload.staff_behavior_rating ? Number(payload.staff_behavior_rating) : null,
      payload.comments ? String(payload.comments).trim() : null,
      payload.is_public_testimonial !== undefined ? (payload.is_public_testimonial ? 1 : 0) : 1
    ]
  );
  return dbGet(
    `SELECT f.*, COALESCE(u.full_name, f.guest_name, 'Guest Passenger') AS passenger_name,
            t.name AS train_name, t.train_number
     FROM feedback_submissions f
     LEFT JOIN users u ON u.id = f.user_id
     LEFT JOIN trains t ON t.id = f.train_id
     WHERE f.id = ?`,
    [res.lastID]
  );
}

function listFeedback({ trainId } = {}) {
  const sql = trainId
    ? `SELECT f.*, COALESCE(u.full_name, f.guest_name, 'Guest Passenger') AS passenger_name,
              t.name AS train_name, t.train_number
       FROM feedback_submissions f
       LEFT JOIN users u ON u.id = f.user_id
       LEFT JOIN trains t ON t.id = f.train_id
       WHERE f.train_id = ?
       ORDER BY f.created_at DESC`
    : `SELECT f.*, COALESCE(u.full_name, f.guest_name, 'Guest Passenger') AS passenger_name,
              t.name AS train_name, t.train_number
       FROM feedback_submissions f
       LEFT JOIN users u ON u.id = f.user_id
       LEFT JOIN trains t ON t.id = f.train_id
       ORDER BY f.created_at DESC LIMIT 100`;
  return dbAll(sql, trainId ? [Number(trainId)] : []);
}

module.exports = {
  createComplaint,
  getComplaintByIdOrRef,
  verifyGuestComplaintAccess,
  listComplaintsForUser,
  listAllComplaints,
  assignComplaint,
  updateComplaintStatus,
  addComplaintResponse,
  createFeedback,
  listFeedback
};
