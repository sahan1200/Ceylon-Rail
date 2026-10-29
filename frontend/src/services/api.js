const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:5000/api';

function getPassengerToken() {
  return localStorage.getItem('ceylon_rail_passenger_token') || '';
}

function getStaffToken() {
  return localStorage.getItem('ceylon_rail_staff_token') || '';
}

export function getGuestSessionId() {
  let sid = localStorage.getItem('ceylon_rail_guest_session_id');
  if (!sid) {
    sid = `GUEST-${Math.random().toString(36).slice(2, 10).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    localStorage.setItem('ceylon_rail_guest_session_id', sid);
  }
  return sid;
}

export function setPassengerSession(token, user) {
  if (token) localStorage.setItem('ceylon_rail_passenger_token', token);
  else localStorage.removeItem('ceylon_rail_passenger_token');
  if (user) localStorage.setItem('ceylon_rail_passenger_user', JSON.stringify(user));
  else localStorage.removeItem('ceylon_rail_passenger_user');
}

export function setStaffSession(token, staff) {
  if (token) localStorage.setItem('ceylon_rail_staff_token', token);
  else localStorage.removeItem('ceylon_rail_staff_token');
  if (staff) localStorage.setItem('ceylon_rail_staff_user', JSON.stringify(staff));
  else localStorage.removeItem('ceylon_rail_staff_user');
}

async function apiRequest(path, { method = 'GET', body = null, useStaffToken = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = useStaffToken ? getStaffToken() : getPassengerToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const err = new Error(data.error || `Request failed with status ${res.status}`);
    err.status = res.status;
    err.code = data.code;
    err.payload = data;
    throw err;
  }
  return data;
}

export const api = {
  // System & status
  getSystemStatus: () => apiRequest('/system/status'),

  // Passenger Auth & Profile (Optional for guest passengers)
  registerPassenger: (payload) => apiRequest('/auth/register', { method: 'POST', body: payload }),
  loginPassenger: (payload) => apiRequest('/auth/login', { method: 'POST', body: payload }),
  logoutPassenger: () => apiRequest('/auth/logout', { method: 'POST' }),
  getPassengerProfile: () => apiRequest('/auth/me'),
  updatePassengerProfile: (payload) => apiRequest('/auth/profile', { method: 'PUT', body: payload }),
  getNotifications: () => apiRequest('/notifications'),

  // Railway Operations & Search
  getStations: () => apiRequest('/stations'),
  searchTrains: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return apiRequest(`/trains${qs ? `?${qs}` : ''}`);
  },
  getTrainById: (id) => apiRequest(`/trains/${id}`),
  getFareRules: () => apiRequest('/fare-rules'),
  calculateFare: (payload) => apiRequest('/fares/calculate', { method: 'POST', body: payload }),
  getFleetTelemetry: () => apiRequest('/tracking'),
  getTrainTelemetry: (trainId) => apiRequest(`/tracking/${trainId}`),

  // Seat Locking, Guest + Registered Bookings, Lookup & Payments
  getSeatMap: (trainId, carriageCode, travelDate, fromStation = '', toStation = '') =>
    apiRequest(
      `/seats/${trainId}/${carriageCode}?travel_date=${encodeURIComponent(travelDate)}&from_station=${encodeURIComponent(fromStation)}&to_station=${encodeURIComponent(toStation)}`
    ),
  lockSeats: (payload) => apiRequest('/seats/lock', { method: 'POST', body: { session_id: getGuestSessionId(), ...payload } }),
  unlockSeats: (payload) => apiRequest('/seats/unlock', { method: 'POST', body: { session_id: getGuestSessionId(), ...payload } }),
  createBooking: (payload) => apiRequest('/bookings', { method: 'POST', body: { session_id: getGuestSessionId(), ...payload } }),
  getMyBookings: () => apiRequest('/bookings'),
  lookupBooking: (pnr, verification) =>
    apiRequest('/bookings/lookup', { method: 'POST', body: { pnr, verification } }),
  getBookingDetails: (pnrOrId, useStaffToken = false, verification = '') =>
    apiRequest(
      `/bookings/${encodeURIComponent(pnrOrId)}${verification ? `?verification=${encodeURIComponent(verification)}` : ''}`,
      { useStaffToken }
    ),
  cancelBooking: (pnrOrId, reason, useStaffToken = false, verification = '') =>
    apiRequest(`/bookings/${encodeURIComponent(pnrOrId)}/cancel`, {
      method: 'POST',
      body: { reason, verification: verification || undefined },
      useStaffToken
    }),
  verifyQrTicket: (qrPayloadOrPnr) =>
    apiRequest('/tickets/verify', { method: 'POST', body: { qr_payload: qrPayloadOrPnr } }),

  // Smart Travel Planner
  getDestinations: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return apiRequest(`/travel-planner/destinations${qs ? `?${qs}` : ''}`);
  },
  getSingleDestination: (slugOrId) => apiRequest(`/travel-planner/destinations/${encodeURIComponent(slugOrId)}`),
  getMyItineraries: () => apiRequest('/travel-planner/itineraries'),
  createItinerary: (payload) => apiRequest('/travel-planner/itineraries', { method: 'POST', body: payload }),
  updateItinerary: (id, payload) => apiRequest(`/travel-planner/itineraries/${id}`, { method: 'PUT', body: payload }),
  deleteItinerary: (id) => apiRequest(`/travel-planner/itineraries/${id}`, { method: 'DELETE' }),

  // Complaints & Feedback (Guest & Registered)
  submitComplaint: (payload) => apiRequest('/complaints', { method: 'POST', body: payload }),
  getMyComplaints: () => apiRequest('/complaints'),
  trackComplaint: (complaintReference, verification) =>
    apiRequest('/complaints/track', {
      method: 'POST',
      body: { complaint_reference: complaintReference, verification }
    }),
  addComplaintReply: (id, message, verification = '') =>
    apiRequest(`/complaints/${id}/responses`, {
      method: 'POST',
      body: { message, verification: verification || undefined }
    }),
  submitFeedback: (payload) => apiRequest('/feedback', { method: 'POST', body: payload }),
  getFeedbackList: () => apiRequest('/feedback'),

  // Staff Portal APIs
  staffLogin: (payload) => apiRequest('/staff/auth/login', { method: 'POST', body: payload }),
  staffLogout: () => apiRequest('/staff/auth/logout', { method: 'POST', useStaffToken: true }),
  getStaffMe: () => apiRequest('/staff/auth/me', { useStaffToken: true }),
  changeStaffPassword: (payload) =>
    apiRequest('/staff/auth/change-password', { method: 'POST', body: payload, useStaffToken: true }),
  listStaffUsers: () => apiRequest('/staff/users', { useStaffToken: true }),
  createStaffUser: (payload) => apiRequest('/staff/users', { method: 'POST', body: payload, useStaffToken: true }),
  updateStaffUser: (id, payload) => apiRequest(`/staff/users/${id}`, { method: 'PUT', body: payload, useStaffToken: true }),
  getAuditLogs: () => apiRequest('/staff/audit-logs', { useStaffToken: true }),
  saveStation: (payload) => apiRequest('/staff/stations', { method: 'POST', body: payload, useStaffToken: true }),
  saveTrain: (payload) => apiRequest('/staff/trains', { method: 'POST', body: payload, useStaffToken: true }),
  saveFareRule: (payload) => apiRequest('/staff/fare-rules', { method: 'POST', body: payload, useStaffToken: true }),
  saveDestination: (payload) =>
    apiRequest('/staff/travel-planner/destinations', { method: 'POST', body: payload, useStaffToken: true }),
  saveAttraction: (payload) =>
    apiRequest('/staff/travel-planner/attractions', { method: 'POST', body: payload, useStaffToken: true }),
  deleteAttraction: (id) =>
    apiRequest(`/staff/travel-planner/attractions/${id}`, { method: 'DELETE', useStaffToken: true }),
  saveScenicRoute: (payload) =>
    apiRequest('/staff/travel-planner/scenic-routes', { method: 'POST', body: payload, useStaffToken: true }),
  getStaffBookings: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return apiRequest(`/staff/bookings${qs ? `?${qs}` : ''}`, { useStaffToken: true });
  },
  getStaffComplaints: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return apiRequest(`/staff/complaints${qs ? `?${qs}` : ''}`, { useStaffToken: true });
  },
  assignComplaint: (id, payload) =>
    apiRequest(`/staff/complaints/${id}/assign`, { method: 'POST', body: payload, useStaffToken: true }),
  updateComplaintStatus: (id, payload) =>
    apiRequest(`/staff/complaints/${id}/status`, { method: 'PUT', body: payload, useStaffToken: true }),
  staffReplyComplaint: (id, payload) =>
    apiRequest(`/staff/complaints/${id}/responses`, { method: 'POST', body: payload, useStaffToken: true }),
  getOperatingExpenses: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return apiRequest(`/staff/finance/expenses${qs ? `?${qs}` : ''}`, { useStaffToken: true });
  },
  createOperatingExpense: (payload) =>
    apiRequest('/staff/finance/expenses', { method: 'POST', body: payload, useStaffToken: true }),
  updateOperatingExpense: (id, payload) =>
    apiRequest(`/staff/finance/expenses/${id}`, { method: 'PUT', body: payload, useStaffToken: true }),
  getFinancialReport: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return apiRequest(`/staff/finance/reports${qs ? `?${qs}` : ''}`, { useStaffToken: true });
  },
  getFinancialReportCsvUrl: (startDate, endDate, periodType = 'CUSTOM') =>
    `${API_BASE}/staff/finance/reports?period_type=${encodeURIComponent(periodType)}&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&format=csv`
};
