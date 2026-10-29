const {
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
} = require('../repositories/complaintRepository');
const { createNotification } = require('../repositories/userRepository');
const { sanitizeString } = require('../middleware/validation');
const { recordAuditLog } = require('../middleware/auth');

function submitPassengerComplaint(req, res) {
  const {
    subject,
    description,
    category,
    priority,
    booking_id,
    booking_pnr,
    train_id,
    station_id,
    guest_name,
    guest_email,
    guest_phone,
    attachments
  } = req.body || {};

  if (!subject || !description) {
    return res.status(400).json({
      success: false,
      error: 'Complaint subject and description are required.'
    });
  }

  const isGuest = !req.user;
  const cleanGuestName = sanitizeString(guest_name || req.user?.full_name || 'Guest Passenger', 120);
  const cleanGuestEmail = sanitizeString(guest_email || req.user?.email || '', 160).toLowerCase();
  const cleanGuestPhone = sanitizeString(guest_phone || req.user?.phone || '', 40);

  if (isGuest && !cleanGuestEmail && !cleanGuestPhone && !booking_pnr) {
    return res.status(400).json({
      success: false,
      error: 'Please provide your email address, phone number, or related booking reference (PNR) so you can track your complaint.'
    });
  }

  const complaint = createComplaint(req.user ? req.user.id : null, {
    subject,
    description,
    category,
    priority,
    booking_id,
    booking_pnr,
    train_id,
    station_id,
    guest_name: cleanGuestName,
    guest_email: cleanGuestEmail,
    guest_phone: cleanGuestPhone,
    attachments
  });

  recordAuditLog({
    actorType: isGuest ? 'GUEST' : 'PASSENGER',
    actorId: req.user ? req.user.id : null,
    actorIdentifier: cleanGuestEmail || cleanGuestPhone || cleanGuestName,
    action: 'COMPLAINT_SUBMITTED',
    entityType: 'complaints',
    entityId: complaint.complaint_reference,
    ipAddress: req.ip
  });

  return res.status(201).json({
    success: true,
    complaint
  });
}

function getPassengerComplaints(req, res) {
  return res.json({
    success: true,
    complaints: listComplaintsForUser(req.user.id)
  });
}

function getSingleComplaint(req, res) {
  const isStaff = Boolean(req.staff);
  const idOrRef = req.params.idOrRef || req.body?.complaint_reference || req.query?.complaint_reference;
  const verification =
    req.query?.verification ||
    req.query?.contact ||
    req.body?.verification ||
    req.body?.contact;

  const complaint = getComplaintByIdOrRef(idOrRef, { includeInternalNotes: isStaff });
  if (!complaint) {
    return res.status(404).json({ success: false, error: 'Complaint not found.' });
  }

  const isOwnerUser = Boolean(req.user && complaint.user_id && complaint.user_id === req.user.id);
  const isVerifiedGuest =
    ! /^\d+$/.test(String(idOrRef).trim()) &&
    verifyGuestComplaintAccess(complaint, verification);

  if (!isStaff && !isOwnerUser && !isVerifiedGuest) {
    if (!req.user && !verification) {
      return res.status(401).json({
        success: false,
        error: 'Verification required. Please provide your Complaint Reference and the email, phone, or booking PNR used when submitting.'
      });
    }
    return res.status(403).json({
      success: false,
      error: 'Access denied. You can only view your own verified complaints.'
    });
  }

  return res.json({
    success: true,
    complaint
  });
}

function trackGuestComplaintHandler(req, res) {
  const ref = sanitizeString(req.body?.complaint_reference || req.query?.complaint_reference, 40);
  const verification = sanitizeString(req.body?.verification || req.body?.contact || req.query?.verification, 160);

  if (!ref || !verification) {
    return res.status(400).json({
      success: false,
      error: 'Both Complaint Reference (CMP-...) and Contact Verification (Email, Phone, or Booking PNR) are required.'
    });
  }

  const complaint = getComplaintByIdOrRef(ref, { includeInternalNotes: false });
  if (!complaint || !verifyGuestComplaintAccess(complaint, verification)) {
    return res.status(403).json({
      success: false,
      error: 'No complaint matched the provided Complaint Reference and Verification details.'
    });
  }

  return res.json({
    success: true,
    complaint
  });
}

function listStaffComplaints(req, res) {
  const complaints = listAllComplaints({
    status: req.query?.status,
    category: req.query?.category,
    priority: req.query?.priority
  });
  return res.json({
    success: true,
    complaints
  });
}

function assignComplaintHandler(req, res) {
  const complaintId = Number(req.params.id);
  const assignedToStaffId = Number(req.body?.assigned_to_staff_id || req.staff.id);
  const updated = assignComplaint({
    complaintId,
    assignedToStaffId,
    assignedByStaffId: req.staff.id,
    notes: req.body?.notes
  });

  if (!updated) {
    return res.status(404).json({ success: false, error: 'Complaint not found.' });
  }

  recordAuditLog({
    actorType: 'STAFF',
    actorId: req.staff.id,
    actorIdentifier: req.staff.username,
    action: 'COMPLAINT_ASSIGNED',
    entityType: 'complaints',
    entityId: updated.complaint_reference,
    details: { assigned_to_staff_id: assignedToStaffId },
    ipAddress: req.ip
  });

  return res.json({
    success: true,
    complaint: updated
  });
}

function updateComplaintStatusHandler(req, res) {
  const complaintId = Number(req.params.id);
  const { status, notes, resolution_summary } = req.body || {};
  const validStatuses = ['SUBMITTED', 'UNDER_REVIEW', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: `Invalid status. Allowed: ${validStatuses.join(', ')}`
    });
  }

  const updated = updateComplaintStatus({
    complaintId,
    newStatus: status,
    staffId: req.staff.id,
    notes,
    resolutionSummary: resolution_summary
  });

  if (!updated) {
    return res.status(404).json({ success: false, error: 'Complaint not found.' });
  }

  if (updated.user_id) {
    createNotification({
      userId: updated.user_id,
      type: 'COMPLAINT',
      title: `Complaint ${updated.complaint_reference} — ${status}`,
      message: resolution_summary || notes || `Your complaint status has been updated to ${status}.`,
      relatedEntityType: 'complaints',
      relatedEntityId: updated.complaint_reference
    });
  }

  recordAuditLog({
    actorType: 'STAFF',
    actorId: req.staff.id,
    actorIdentifier: req.staff.username,
    action: 'COMPLAINT_STATUS_UPDATED',
    entityType: 'complaints',
    entityId: updated.complaint_reference,
    details: { status, resolution_summary },
    ipAddress: req.ip
  });

  return res.json({
    success: true,
    complaint: updated
  });
}

function respondToComplaintHandler(req, res) {
  const complaintId = Number(req.params.id);
  const { message, is_internal_note, verification } = req.body || {};
  if (!message || !String(message).trim()) {
    return res.status(400).json({
      success: false,
      error: 'Response message is required.'
    });
  }

  const existing = getComplaintByIdOrRef(complaintId, { includeInternalNotes: true });
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Complaint not found.' });
  }

  const isStaff = Boolean(req.staff);
  const isOwnerUser = Boolean(req.user && existing.user_id && existing.user_id === req.user.id);
  const isVerifiedGuest = verifyGuestComplaintAccess(existing, verification);

  if (!isStaff && !isOwnerUser && !isVerifiedGuest) {
    return res.status(403).json({
      success: false,
      error: 'Access denied.'
    });
  }

  const internalFlag = isStaff ? Boolean(is_internal_note) : false;
  const authorName = isStaff
    ? `${req.staff.full_name} (${req.staff.role_name})`
    : req.user?.full_name || existing.passenger_name || 'Passenger';

  const updated = addComplaintResponse({
    complaintId: existing.id,
    authorType: isStaff ? 'STAFF' : 'PASSENGER',
    authorId: isStaff ? req.staff.id : (req.user?.id || null),
    authorName,
    message,
    isInternalNote: internalFlag
  });

  if (isStaff && !internalFlag && existing.user_id) {
    createNotification({
      userId: existing.user_id,
      type: 'COMPLAINT',
      title: `New Reply on Complaint ${existing.complaint_reference}`,
      message: String(message).slice(0, 200),
      relatedEntityType: 'complaints',
      relatedEntityId: existing.complaint_reference
    });
  }

  return res.status(201).json({
    success: true,
    complaint: updated
  });
}

function submitFeedbackHandler(req, res) {
  const rating = Number(req.body?.overall_rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({
      success: false,
      error: 'overall_rating must be an integer between 1 and 5.'
    });
  }

  const feedback = createFeedback(req.user?.id || null, req.body || {});
  return res.status(201).json({
    success: true,
    feedback
  });
}

function getFeedbackListHandler(req, res) {
  return res.json({
    success: true,
    feedback: listFeedback({ trainId: req.query?.train_id })
  });
}

module.exports = {
  submitPassengerComplaint,
  getPassengerComplaints,
  getSingleComplaint,
  trackGuestComplaintHandler,
  listStaffComplaints,
  assignComplaintHandler,
  updateComplaintStatusHandler,
  respondToComplaintHandler,
  submitFeedbackHandler,
  getFeedbackListHandler
};
