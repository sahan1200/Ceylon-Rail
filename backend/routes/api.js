const {
  authenticatePassenger,
  optionalPassengerAuth,
  optionalPassengerOrStaffAuth,
  authenticateStaff,
  requireStaffRoles
} = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimiter');

const passengerController = require('../controllers/passengerController');
const bookingController = require('../controllers/bookingController');
const staffController = require('../controllers/staffController');
const operationsController = require('../controllers/operationsController');
const complaintController = require('../controllers/complaintController');
const travelPlannerController = require('../controllers/travelPlannerController');
const financeController = require('../controllers/financeController');
const { getPaymentGatewayStatus } = require('../services/paymentService');
const { getDbPath } = require('../database');
const env = require('../config/env');

function buildApiRouter(createRouter) {
  const router = createRouter();
  const loginLimiter = createRateLimiter({ keyPrefix: 'auth_login' });
  const lookupLimiter = createRateLimiter({ keyPrefix: 'public_lookup', maxAttempts: 25 });

  // System & External Integration Status
  router.get('/system/status', (_req, res) => {
    res.json({
      success: true,
      service: 'Ceylon Rail — Sri Lanka Railway Reservation & Operations Platform',
      version: '2.1.0',
      database_engine: 'SQLite',
      database_path: getDbPath(),
      guest_booking_enabled: true,
      languages_supported: ['EN', 'SI', 'TA'],
      google_maps: {
        configured: env.isGoogleMapsConfigured(),
        tile_layers: ['GOOGLE_HYBRID', 'GOOGLE_SATELLITE', 'GOOGLE_ROADMAP', 'GOOGLE_TERRAIN', 'ESRI_WORLD_IMAGERY']
      },
      payment_gateway: getPaymentGatewayStatus()
    });
  });

  // =========================================================================
  // 1. PASSENGER AUTHENTICATION & PROFILE ROUTES (OPTIONAL FOR GUESTS)
  // =========================================================================
  router.post('/auth/register', loginLimiter, passengerController.registerPassenger);
  router.post('/auth/login', loginLimiter, passengerController.loginPassenger);
  router.post('/auth/logout', optionalPassengerAuth, passengerController.logoutPassenger);
  router.get('/auth/me', authenticatePassenger, passengerController.getOwnProfile);
  router.put('/auth/profile', authenticatePassenger, passengerController.updateOwnProfile);
  router.get('/notifications', authenticatePassenger, passengerController.listNotifications);
  router.post('/notifications/:id/read', authenticatePassenger, passengerController.markNotificationAsRead);

  // =========================================================================
  // 2. RAILWAY OPERATIONS, SEARCH, FARE & LIVE TRACKING ROUTES
  // =========================================================================
  router.get('/stations', operationsController.getStations);
  router.get('/trains', operationsController.getTrainsSearch);
  router.get('/trains/:id', operationsController.getSingleTrain);
  router.get('/fare-rules', operationsController.getFareRules);
  router.post('/fares/calculate', bookingController.calculateFarePreview);
  router.get('/tracking', operationsController.getLiveTrackingAll);
  router.get('/tracking/:trainId', operationsController.getLiveTrackingByTrain);

  // =========================================================================
  // 3. SEAT LOCKING, GUEST + ACCOUNT BOOKINGS, LOOKUP, REFUNDS & QR ROUTES
  // =========================================================================
  router.get('/seats/:trainId/:carriageCode', bookingController.getSeatMap);
  router.post('/seats/lock', optionalPassengerAuth, bookingController.lockSeats);
  router.post('/seats/unlock', optionalPassengerAuth, bookingController.unlockSeats);

  // Supports both Guest Booking (no login) and Authenticated Passenger Booking
  router.post('/bookings', optionalPassengerAuth, bookingController.createBooking);
  router.get('/bookings', authenticatePassenger, bookingController.getPassengerBookings);

  // Secure Guest Booking Lookup (requires PNR + matching Contact Email/Phone/NIC)
  router.post('/bookings/lookup', lookupLimiter, bookingController.lookupGuestBooking);

  // Supports Owner Passenger, Authorized Staff, or Verified Guest (via ?verification=... or body.verification)
  router.get('/bookings/:pnrOrId', optionalPassengerOrStaffAuth, bookingController.getBookingDetails);
  router.post('/bookings/:pnrOrId/cancel', optionalPassengerOrStaffAuth, bookingController.cancelBooking);
  router.post('/tickets/verify', bookingController.verifyQrTicketEndpoint);

  // =========================================================================
  // 4. SMART TRAVEL PLANNER & SAVED ITINERARIES ROUTES
  // =========================================================================
  router.get('/travel-planner/destinations', travelPlannerController.getDestinations);
  router.get('/travel-planner/destinations/:slugOrId', travelPlannerController.getSingleDestination);
  router.get('/travel-planner/itineraries', authenticatePassenger, travelPlannerController.getMyItineraries);
  router.get('/travel-planner/itineraries/:id', authenticatePassenger, travelPlannerController.getSingleItinerary);
  router.post('/travel-planner/itineraries', authenticatePassenger, travelPlannerController.createMyItinerary);
  router.put('/travel-planner/itineraries/:id', authenticatePassenger, travelPlannerController.updateMyItinerary);
  router.delete('/travel-planner/itineraries/:id', authenticatePassenger, travelPlannerController.deleteMyItinerary);

  // =========================================================================
  // 5. PASSENGER COMPLAINTS & FEEDBACK ROUTES (SUPPORTS GUEST SUBMISSION & TRACKING)
  // =========================================================================
  router.post('/complaints', optionalPassengerAuth, complaintController.submitPassengerComplaint);
  router.get('/complaints', authenticatePassenger, complaintController.getPassengerComplaints);
  router.post('/complaints/track', lookupLimiter, complaintController.trackGuestComplaintHandler);
  router.get('/complaints/:idOrRef', optionalPassengerOrStaffAuth, complaintController.getSingleComplaint);
  router.post('/complaints/:id/responses', optionalPassengerOrStaffAuth, complaintController.respondToComplaintHandler);

  router.post('/feedback', optionalPassengerAuth, complaintController.submitFeedbackHandler);
  router.get('/feedback', complaintController.getFeedbackListHandler);

  // =========================================================================
  // 6. RAILWAY STAFF PORTAL, RBAC, OPERATIONS, TRAVEL PLANNER, COMPLAINTS & FINANCE
  // =========================================================================
  router.post('/staff/auth/login', loginLimiter, staffController.staffLogin);
  router.post('/staff/auth/logout', authenticateStaff, staffController.staffLogout);
  router.get('/staff/auth/me', authenticateStaff, staffController.getStaffMe);
  router.post('/staff/auth/change-password', authenticateStaff, staffController.changeStaffPassword);

  // Staff Management (SUPER_ADMIN & ADMIN)
  router.get(
    '/staff/users',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN'),
    staffController.listStaffMembers
  );
  router.post(
    '/staff/users',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN'),
    staffController.createNewStaffMember
  );
  router.put(
    '/staff/users/:id',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN'),
    staffController.updateStaffMember
  );
  router.get(
    '/staff/audit-logs',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN'),
    staffController.getAuditLogs
  );

  // Railway Operations Management (SUPER_ADMIN, ADMIN, STATION_STAFF)
  router.post(
    '/staff/stations',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN'),
    operationsController.saveStation
  );
  router.post(
    '/staff/trains',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN'),
    operationsController.saveTrain
  );
  router.post(
    '/staff/fare-rules',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN', 'FINANCE_STAFF'),
    operationsController.saveFareRule
  );
  router.get(
    '/staff/bookings',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN', 'FINANCE_STAFF', 'STATION_STAFF'),
    bookingController.listBookingsForStaff
  );

  // Travel Planner Content Management (SUPER_ADMIN, ADMIN)
  router.post(
    '/staff/travel-planner/destinations',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN'),
    travelPlannerController.saveDestinationHandler
  );
  router.post(
    '/staff/travel-planner/attractions',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN'),
    travelPlannerController.saveAttractionHandler
  );
  router.delete(
    '/staff/travel-planner/attractions/:id',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN'),
    travelPlannerController.deleteAttractionHandler
  );
  router.post(
    '/staff/travel-planner/scenic-routes',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN'),
    travelPlannerController.saveScenicRouteHandler
  );

  // Complaint Management (SUPER_ADMIN, ADMIN, COMPLAINT_OFFICER)
  router.get(
    '/staff/complaints',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN', 'COMPLAINT_OFFICER'),
    complaintController.listStaffComplaints
  );
  router.post(
    '/staff/complaints/:id/assign',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN', 'COMPLAINT_OFFICER'),
    complaintController.assignComplaintHandler
  );
  router.put(
    '/staff/complaints/:id/status',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN', 'COMPLAINT_OFFICER'),
    complaintController.updateComplaintStatusHandler
  );
  router.post(
    '/staff/complaints/:id/responses',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN', 'COMPLAINT_OFFICER'),
    complaintController.respondToComplaintHandler
  );

  // Financial Management & Reports (SUPER_ADMIN, ADMIN, FINANCE_STAFF)
  router.get(
    '/staff/finance/expenses',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN', 'FINANCE_STAFF'),
    financeController.listExpensesHandler
  );
  router.post(
    '/staff/finance/expenses',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN', 'FINANCE_STAFF'),
    financeController.createExpenseHandler
  );
  router.put(
    '/staff/finance/expenses/:id',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN', 'FINANCE_STAFF'),
    financeController.updateExpenseHandler
  );
  router.get(
    '/staff/finance/reports',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN', 'FINANCE_STAFF'),
    financeController.getFinancialReportHandler
  );
  router.post(
    '/staff/finance/reports',
    authenticateStaff,
    requireStaffRoles('SUPER_ADMIN', 'ADMIN', 'FINANCE_STAFF'),
    financeController.getFinancialReportHandler
  );

  return router;
}

module.exports = { buildApiRouter };
