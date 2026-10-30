import React, { useState, useEffect } from 'react';
import {
  Shield,
  KeyRound,
  Train,
  FileSpreadsheet,
  MessageSquareWarning,
  Users,
  CheckCircle2,
  AlertTriangle,
  Download,
  Printer,
  QrCode,
  Eye,
  EyeOff,
  Compass,
  MapPin,
  LogOut,
  LayoutDashboard,
  Search
} from 'lucide-react';
import { api, setStaffSession } from '../services/api.js';

const SUPPLIED_IMAGE_OPTIONS = [
  { path: '/images/hero_mountain_train.jpg', label: 'Hero Mountain Train on Nine Arch Bridge' },
  { path: '/images/route_highland.jpg', label: 'Highland Line (Kandy to Ella Viaduct)' },
  { path: '/images/route_coastal.jpg', label: 'Coastal Line (Indian Ocean Beach Track)' },
  { path: '/images/route_cultural.jpg', label: 'Cultural Line (Kandy Lake & Temple of the Tooth)' },
  { path: '/images/route_northern.jpg', label: 'Northern Line (Palmyra & Lagoon Express)' },
  { path: '/images/image_441e3b.jpg', label: 'Highland Train Window & Tea Plantation View' },
  { path: '/images/image_4421da.jpg', label: 'Misty Hill Country Railway Station' },
  { path: '/images/image_442524.jpg', label: 'Historic 1867 Kandy Railway Terminus Archive' },
  { path: '/images/image_441e5f.jpg', label: 'Sri Lanka Railways Network Operational Map' }
];

export default function StaffPortal({ staffUser, setStaffUser }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Password change state (mandatory first-login or voluntary)
  const [mustChangePassword, setMustChangePassword] = useState(
    Boolean(staffUser?.must_change_password)
  );
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMessage, setPwdMessage] = useState('');

  // Active staff module tab
  const [subTab, setSubTab] = useState('overview');

  // Module data states
  const [report, setReport] = useState(null);
  const [periodType, setPeriodType] = useState('CUSTOM');
  const [startDate, setStartDate] = useState('2025-01-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const [expenseCategory, setExpenseCategory] = useState('FUEL_ENERGY');
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmountLkr, setExpenseAmountLkr] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [expensesList, setExpensesList] = useState([]);

  const [stations, setStations] = useState([]);
  const [trains, setTrains] = useState([]);
  const [fareRules, setFareRules] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [staffComplaints, setStaffComplaints] = useState([]);
  const [staffBookings, setStaffBookings] = useState([]);
  const [bookingSearch, setBookingSearch] = useState('');
  const [staffList, setStaffList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  // Operations forms
  const [stationCode, setStationCode] = useState('');
  const [stationName, setStationName] = useState('');
  const [stationLine, setStationLine] = useState('Main Line');
  const [stationProvince, setStationProvince] = useState('Central');
  const [stationElev, setStationElev] = useState('500');
  const [stationDist, setStationDist] = useState('120');

  const [trainNumber, setTrainNumber] = useState('');
  const [trainName, setTrainName] = useState('');
  const [trainType, setTrainType] = useState('Intercity Express');
  const [trainRoute, setTrainRoute] = useState('Main Line (Colombo Fort - Badulla)');
  const [trainOriginId, setTrainOriginId] = useState(1);
  const [trainDestId, setTrainDestId] = useState(16);
  const [trainDep, setTrainDep] = useState('06:30');
  const [trainArr, setTrainArr] = useState('15:45');

  const [fareClass, setFareClass] = useState('2nd Class Reserved');
  const [fareBaseLkr, setFareBaseLkr] = useState('500');
  const [farePerKmLkr, setFarePerKmLkr] = useState('5');
  const [fareResFeeLkr, setFareResFeeLkr] = useState('150');

  // Travel Planner Management forms
  const [destName, setDestName] = useState('');
  const [destRegion, setDestRegion] = useState('Uva Province');
  const [destCategory, setDestCategory] = useState('Hill Country & Nature');
  const [destStationCode, setDestStationCode] = useState('ELL');
  const [destImage, setDestImage] = useState('/images/route_highland.jpg');
  const [destSummary, setDestSummary] = useState('');
  const [destDesc, setDestDesc] = useState('');

  const [attrDestId, setAttrDestId] = useState('');
  const [attrName, setAttrName] = useState('');
  const [attrCategory, setAttrCategory] = useState('Heritage Site');
  const [attrImage, setAttrImage] = useState('/images/hero_mountain_train.jpg');
  const [attrDistKm, setAttrDistKm] = useState('2.5');
  const [attrFeeLkr, setAttrFeeLkr] = useState('0');
  const [attrDesc, setAttrDesc] = useState('');

  // Complaint reply state
  const [replyTextMap, setReplyTextMap] = useState({});
  const [internalFlagMap, setInternalFlagMap] = useState({});

  // Staff Account creation
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffFullName, setNewStaffFullName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('FINANCE_STAFF');
  const [newStaffPassword, setNewStaffPassword] = useState('');

  const [qrInput, setQrInput] = useState('');
  const [qrResult, setQrResult] = useState(null);
  const [statusBanner, setStatusBanner] = useState('');

  // Redirect staff to default module based on role permissions
  const getDefaultTabForRole = (roleCode) => {
    if (roleCode === 'FINANCE_STAFF') return 'finance';
    if (roleCode === 'COMPLAINT_OFFICER') return 'complaints';
    if (roleCode === 'STATION_STAFF') return 'bookings';
    return 'overview';
  };

  const handleStaffLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const res = await api.staffLogin({ username: username.trim(), password });
      setStaffSession(res.token, res.staff);
      setStaffUser(res.staff);
      setMustChangePassword(Boolean(res.must_change_password));
      setCurrentPassword(password);
      setPassword('');
      setSubTab(getDefaultTabForRole(res.staff?.role_code));
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleStaffLogout = async () => {
    try {
      await api.staffLogout();
    } catch (_e) {}
    setStaffSession(null, null);
    setStaffUser(null);
    setMustChangePassword(false);
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwdMessage('');
    try {
      const res = await api.changeStaffPassword({
        current_password: currentPassword,
        new_password: newPassword
      });
      setMustChangePassword(false);
      setShowPasswordModal(false);
      setStaffSession(localStorage.getItem('ceylon_rail_staff_token'), res.staff);
      setStaffUser(res.staff);
      setCurrentPassword('');
      setNewPassword('');
      setStatusBanner('Staff password updated successfully.');
    } catch (err) {
      setPwdMessage(err.message);
    }
  };

  const loadModuleData = async () => {
    if (!staffUser || mustChangePassword) return;
    try {
      const [stRes, trRes, frRes, dstRes] = await Promise.all([
        api.getStations().catch(() => ({ stations: [] })),
        api.searchTrains().catch(() => ({ trains: [] })),
        api.getFareRules().catch(() => ({ fare_rules: [] })),
        api.getDestinations().catch(() => ({ destinations: [] }))
      ]);
      setStations(stRes.stations || []);
      setTrains(trRes.trains || []);
      setFareRules(frRes.fare_rules || []);
      setDestinations(dstRes.destinations || []);
      if (!attrDestId && dstRes.destinations?.length > 0) {
        setAttrDestId(String(dstRes.destinations[0].id));
      }

      const role = staffUser.role_code;
      if (['SUPER_ADMIN', 'ADMIN', 'FINANCE_STAFF'].includes(role)) {
        const [r, exp] = await Promise.all([
          api.getFinancialReport({ period_type: periodType, start_date: startDate, end_date: endDate }).catch(() => ({})),
          api.getOperatingExpenses().catch(() => ({ expenses: [] }))
        ]);
        if (r.report) setReport(r.report);
        setExpensesList(exp.expenses || []);
      }
      if (['SUPER_ADMIN', 'ADMIN', 'COMPLAINT_OFFICER'].includes(role)) {
        const c = await api.getStaffComplaints().catch(() => ({ complaints: [] }));
        setStaffComplaints(c.complaints || []);
      }
      if (['SUPER_ADMIN', 'ADMIN', 'FINANCE_STAFF', 'STATION_STAFF'].includes(role)) {
        const b = await api.getStaffBookings({ search: bookingSearch }).catch(() => ({ bookings: [] }));
        setStaffBookings(b.bookings || []);
      }
      if (['SUPER_ADMIN', 'ADMIN'].includes(role)) {
        const [s, a] = await Promise.all([
          api.listStaffUsers().catch(() => ({ staff: [] })),
          api.getAuditLogs().catch(() => ({ audit_logs: [] }))
        ]);
        setStaffList(s.staff || []);
        setAuditLogs(a.audit_logs || []);
      }
    } catch (err) {
      setStatusBanner(err.message);
    }
  };

  useEffect(() => {
    loadModuleData();
  }, [staffUser, mustChangePassword, subTab]);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    try {
      await api.createOperatingExpense({
        category: expenseCategory,
        title: expenseTitle,
        amount_lkr: Number(expenseAmountLkr),
        incurred_date: expenseDate
      });
      setExpenseTitle('');
      setExpenseAmountLkr('');
      setStatusBanner('Operating expense recorded.');
      loadModuleData();
    } catch (err) {
      setStatusBanner(err.message);
    }
  };

  const handleSaveStation = async (e) => {
    e.preventDefault();
    try {
      await api.saveStation({
        code: stationCode,
        name: stationName,
        line_name: stationLine,
        province: stationProvince,
        elevation_m: Number(stationElev) || 0,
        distance_from_fort_km: Number(stationDist) || 0
      });
      setStationCode('');
      setStationName('');
      setStatusBanner('Railway station saved.');
      loadModuleData();
    } catch (err) {
      setStatusBanner(err.message);
    }
  };

  const handleSaveTrain = async (e) => {
    e.preventDefault();
    try {
      await api.saveTrain({
        train_number: trainNumber,
        name: trainName,
        type: trainType,
        route_name: trainRoute,
        origin_station_id: Number(trainOriginId),
        destination_station_id: Number(trainDestId),
        departure_time: trainDep,
        arrival_time: trainArr
      });
      setTrainNumber('');
      setTrainName('');
      setStatusBanner('Train schedule saved.');
      loadModuleData();
    } catch (err) {
      setStatusBanner(err.message);
    }
  };

  const handleSaveFareRule = async (e) => {
    e.preventDefault();
    try {
      await api.saveFareRule({
        class_name: fareClass,
        base_fare_cents: Math.round(Number(fareBaseLkr) * 100),
        per_km_rate_cents: Math.round(Number(farePerKmLkr) * 100),
        reservation_fee_cents: Math.round(Number(fareResFeeLkr) * 100)
      });
      setStatusBanner(`Fare rule updated for ${fareClass}.`);
      loadModuleData();
    } catch (err) {
      setStatusBanner(err.message);
    }
  };

  const handleSaveDestination = async (e) => {
    e.preventDefault();
    try {
      await api.saveDestination({
        name: destName,
        region: destRegion,
        category: destCategory,
        station_code: destStationCode,
        hero_image_url: destImage,
        summary: destSummary,
        description: destDesc || destSummary
      });
      setDestName('');
      setDestSummary('');
      setDestDesc('');
      setStatusBanner('Travel Planner destination saved.');
      loadModuleData();
    } catch (err) {
      setStatusBanner(err.message);
    }
  };

  const handleSaveAttraction = async (e) => {
    e.preventDefault();
    try {
      await api.saveAttraction({
        destination_id: Number(attrDestId),
        name: attrName,
        category: attrCategory,
        image_url: attrImage,
        distance_from_station_km: Number(attrDistKm) || 1.5,
        entry_fee_lkr: Number(attrFeeLkr) || 0,
        description: attrDesc
      });
      setAttrName('');
      setAttrDesc('');
      setStatusBanner('Tourist attraction added to destination.');
      loadModuleData();
    } catch (err) {
      setStatusBanner(err.message);
    }
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    try {
      await api.createStaffUser({
        username: newStaffUsername,
        email: newStaffEmail,
        full_name: newStaffFullName,
        role_code: newStaffRole,
        password: newStaffPassword,
        must_change_password: false
      });
      setNewStaffUsername('');
      setNewStaffEmail('');
      setNewStaffFullName('');
      setNewStaffPassword('');
      setStatusBanner('New railway staff account provisioned.');
      loadModuleData();
    } catch (err) {
      setStatusBanner(err.message);
    }
  };

  // ===========================================================================
  // 1. UNAUTHENTICATED STAFF LOGIN PAGE (Railway-Themed Design + Show/Hide Password)
  // ===========================================================================
  if (!staffUser) {
    return (
      <div className="min-h-[calc(100vh-70px)] relative flex items-center justify-center p-4 overflow-hidden bg-slate-950">
        <img
          src="/images/hero_mountain_train.jpg"
          alt="Ceylon Rail Staff Portal Background"
          className="absolute inset-0 w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-indigo-950/85 to-slate-950/95" />

        <div className="relative z-10 max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 shadow-2xl space-y-6">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-950 text-amber-400 flex items-center justify-center shadow-lg">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600">
                Sri Lanka Railways • Official Portal
              </span>
              <h1 className="font-extrabold text-xl text-slate-900">Railway Staff Login</h1>
              <p className="text-xs text-slate-500">Protected Management, Operations & Finance Console</p>
            </div>
          </div>

          {loginError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleStaffLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Staff Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin"
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter staff password"
                  className="w-full border border-slate-300 rounded-xl pl-3.5 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-3 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-white text-sm font-bold shadow-lg transition cursor-pointer"
            >
              {loggingIn ? 'Authenticating...' : 'Login to Staff Portal'}
            </button>
          </form>

          <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 text-center">
            Protected by Role-Based Access Control (SUPER_ADMIN, ADMIN, FINANCE_STAFF, COMPLAINT_OFFICER, STATION_STAFF).
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 2. MANDATORY FIRST-LOGIN PASSWORD CHANGE SCREEN (If Flagged)
  // ===========================================================================
  if (mustChangePassword) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white rounded-2xl border border-amber-300 p-8 shadow-xl space-y-5">
        <div className="flex items-center gap-3 text-amber-700">
          <KeyRound className="w-7 h-7" />
          <div>
            <h2 className="font-bold text-lg text-slate-900">Change Initial Password</h2>
            <p className="text-xs text-slate-600">
              Welcome, {staffUser.full_name} ({staffUser.role_code}). Please set a new password to continue.
            </p>
          </div>
        </div>
        {pwdMessage && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
            {pwdMessage}
          </div>
        )}
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              New Password (minimum 6 characters)
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
            >
              Update Password
            </button>
            <button
              type="button"
              onClick={handleStaffLogout}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold"
            >
              Logout
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Filter visible modules by staff role
  const role = staffUser.role_code;
  const availableTabs = [
    { id: 'overview', label: 'Dashboard Overview', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'ADMIN', 'FINANCE_STAFF', 'COMPLAINT_OFFICER', 'STATION_STAFF'] },
    { id: 'operations', label: 'Trains, Stations & Fares', icon: Train, roles: ['SUPER_ADMIN', 'ADMIN', 'STATION_STAFF'] },
    { id: 'bookings', label: 'Bookings & Lookup', icon: Search, roles: ['SUPER_ADMIN', 'ADMIN', 'FINANCE_STAFF', 'STATION_STAFF'] },
    { id: 'complaints', label: 'Complaints & Feedback', icon: MessageSquareWarning, roles: ['SUPER_ADMIN', 'ADMIN', 'COMPLAINT_OFFICER'] },
    { id: 'planner', label: 'Travel Planner Content', icon: Compass, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { id: 'finance', label: 'Expenses & Financial Reports', icon: FileSpreadsheet, roles: ['SUPER_ADMIN', 'ADMIN', 'FINANCE_STAFF'] },
    { id: 'staff', label: 'Staff Accounts & Audit Logs', icon: Users, roles: ['SUPER_ADMIN', 'ADMIN'] }
  ].filter((t) => t.roles.includes(role));

  // ===========================================================================
  // 3. AUTHENTICATED STAFF OPERATIONS DASHBOARD
  // ===========================================================================
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Top Staff Header with Password Change & Logout */}
      <div className="bg-[#1E1E38] text-white rounded-2xl p-6 space-y-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-400 text-slate-950">
                {staffUser.role_code}
              </span>
              <span className="text-xs text-emerald-300 font-semibold">
                Employee Code: {staffUser.employee_code || 'SLR-STAFF'}
              </span>
            </div>
            <h1 className="text-2xl font-bold mt-1">{staffUser.full_name} — Railway Management Portal</h1>
            <p className="text-xs text-slate-300">
              Username: <strong>{staffUser.username}</strong> • Email: {staffUser.email} • Department: {staffUser.department}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPasswordModal(true)}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-300" />
              Change Password
            </button>
            <button
              onClick={handleStaffLogout}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </button>
          </div>
        </div>

        {/* Role-Filtered Navigation Modules */}
        <div className="flex flex-wrap gap-2">
          {availableTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                  subTab === tab.id ? 'bg-[#FF6B4A] text-white shadow' : 'bg-white/10 text-slate-200 hover:bg-white/20'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {statusBanner && (
        <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 text-xs font-semibold flex justify-between items-center">
          <span>{statusBanner}</span>
          <button onClick={() => setStatusBanner('')} className="font-bold text-base">×</button>
        </div>
      )}

      {/* MODULE 0: DASHBOARD OVERVIEW */}
      {subTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-semibold">Active Stations</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{stations.length}</div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-semibold">Active Trains</div>
              <div className="text-2xl font-black text-indigo-900 mt-1">{trains.length}</div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-semibold">Total Bookings</div>
              <div className="text-2xl font-black text-emerald-700 mt-1">{staffBookings.length}</div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-semibold">Open Complaints</div>
              <div className="text-2xl font-black text-amber-700 mt-1">
                {staffComplaints.filter((c) => c.status !== 'RESOLVED' && c.status !== 'CLOSED').length}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
              <h3 className="font-bold text-base text-slate-900">Quick Ticket & QR Verification</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  placeholder="Enter PNR (SLR-...) or paste QR payload"
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono"
                />
                <button
                  onClick={async () => {
                    const r = await api.verifyQrTicket(qrInput);
                    setQrResult(r.verification);
                  }}
                  className="px-4 py-2 rounded-lg bg-indigo-900 text-white text-xs font-semibold"
                >
                  Verify
                </button>
              </div>
              {qrResult && (
                <div className={`p-3 rounded-lg text-xs font-semibold ${qrResult.valid ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'}`}>
                  {qrResult.reason} — PNR: {qrResult.pnr || 'N/A'} (HMAC Verified: {String(qrResult.signature_verified)})
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
              <h3 className="font-bold text-base text-slate-900">Sri Lanka Railways Operational Corridors</h3>
              <div className="flex items-center gap-4">
                <img
                  src="/images/image_441e5f.jpg"
                  alt="Sri Lanka Railways Operational Map"
                  className="w-24 h-28 object-cover rounded-xl border border-slate-200 shrink-0"
                />
                <div className="text-xs text-slate-600 space-y-1.5">
                  <p className="font-bold text-slate-900">1,593 km National Track Network</p>
                  <p>
                    Includes Main Line (Colombo Fort – Kandy – Nanu Oya – Ella – Badulla), Coastal Line (Maradana – Galle – Matara – Beliatta), Northern Line (Polgahawela – Anuradhapura – Jaffna), and Eastern Line (Maho – Habarana – Polonnaruwa).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODULE 1: TRAINS, STATIONS & FARE RULES MANAGEMENT */}
      {subTab === 'operations' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Add / Update Station */}
            <form onSubmit={handleSaveStation} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-indigo-600" />
                Add / Update Railway Station
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  value={stationCode}
                  onChange={(e) => setStationCode(e.target.value)}
                  placeholder="Code (e.g. BND)"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-xs uppercase font-mono"
                />
                <input
                  type="text"
                  required
                  value={stationName}
                  onChange={(e) => setStationName(e.target.value)}
                  placeholder="Station Name"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={stationLine}
                  onChange={(e) => setStationLine(e.target.value)}
                  placeholder="Line Name"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={stationProvince}
                  onChange={(e) => setStationProvince(e.target.value)}
                  placeholder="Province"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={stationElev}
                  onChange={(e) => setStationElev(e.target.value)}
                  placeholder="Elevation (m)"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
                <input
                  type="number"
                  step="0.1"
                  value={stationDist}
                  onChange={(e) => setStationDist(e.target.value)}
                  placeholder="Dist from Fort (km)"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>
              <button type="submit" className="w-full py-2 rounded-lg bg-indigo-900 text-white text-xs font-bold">
                Save Station
              </button>
            </form>

            {/* Add / Update Train & Schedule */}
            <form onSubmit={handleSaveTrain} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <Train className="w-4 h-4 text-indigo-600" />
                Add / Update Train & Schedule
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  value={trainNumber}
                  onChange={(e) => setTrainNumber(e.target.value)}
                  placeholder="Train # (e.g. 1025)"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono"
                />
                <input
                  type="text"
                  required
                  value={trainName}
                  onChange={(e) => setTrainName(e.target.value)}
                  placeholder="Train Name"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={trainOriginId}
                  onChange={(e) => setTrainOriginId(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2 py-2 text-xs"
                >
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>Origin: {s.name} ({s.code})</option>
                  ))}
                </select>
                <select
                  value={trainDestId}
                  onChange={(e) => setTrainDestId(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2 py-2 text-xs"
                >
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>Dest: {s.name} ({s.code})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  value={trainDep}
                  onChange={(e) => setTrainDep(e.target.value)}
                  placeholder="Dep HH:MM"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  required
                  value={trainArr}
                  onChange={(e) => setTrainArr(e.target.value)}
                  placeholder="Arr HH:MM"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>
              <button type="submit" className="w-full py-2 rounded-lg bg-indigo-900 text-white text-xs font-bold">
                Save Train Schedule
              </button>
            </form>

            {/* Route & Fare Rules Management */}
            <form onSubmit={handleSaveFareRule} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Route & Class Fare Rules (LKR)
              </h3>
              <select
                value={fareClass}
                onChange={(e) => setFareClass(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold"
              >
                <option value="1st Class Observation">1st Class Observation</option>
                <option value="1st Class Air Conditioned">1st Class Air Conditioned</option>
                <option value="2nd Class Reserved">2nd Class Reserved</option>
                <option value="3rd Class Reserved">3rd Class Reserved</option>
              </select>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500">Base (LKR)</label>
                  <input
                    type="number"
                    required
                    value={fareBaseLkr}
                    onChange={(e) => setFareBaseLkr(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500">Per KM (LKR)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={farePerKmLkr}
                    onChange={(e) => setFarePerKmLkr(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500">Seat Fee (LKR)</label>
                  <input
                    type="number"
                    required
                    value={fareResFeeLkr}
                    onChange={(e) => setFareResFeeLkr(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                  />
                </div>
              </div>
              <button type="submit" className="w-full py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold">
                Update Fare Rule
              </button>
            </form>
          </div>

          {/* Configured Fare Rules & Trains Table */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-bold text-base text-slate-900">Active Database Fare Rules ({fareRules.length})</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              {fareRules.map((fr) => (
                <div key={fr.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="font-bold text-indigo-950">{fr.class_name}</div>
                  <div className="text-slate-600 mt-1">
                    Base: <strong>LKR {(fr.base_fare_cents / 100).toFixed(0)}</strong> • Per km: <strong>LKR {(fr.per_km_rate_cents / 100).toFixed(2)}</strong>
                  </div>
                  <div className="text-slate-500">
                    Reservation Fee: LKR {(fr.reservation_fee_cents / 100).toFixed(0)} • Cancel Fee: {fr.cancellation_fee_pct}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODULE 2: BOOKINGS, PASSENGER LOOKUP, QR VERIFICATION & REFUNDS */}
      {subTab === 'bookings' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-indigo-600" />
              Verify Passenger QR E-Ticket Signature or PNR
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                placeholder="Paste SLR-ETICKET-V2|... payload or enter PNR"
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono"
              />
              <button
                onClick={async () => {
                  const r = await api.verifyQrTicket(qrInput);
                  setQrResult(r.verification);
                }}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
              >
                Verify Ticket
              </button>
            </div>
            {qrResult && (
              <div className={`p-3 rounded-lg text-xs font-semibold ${qrResult.valid ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'}`}>
                Status: {qrResult.reason} (PNR: {qrResult.pnr || 'N/A'} • Cryptographic Signature Verified: {String(qrResult.signature_verified)})
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold text-base text-slate-900">
                Passenger Booking Lookup & Manifest ({staffBookings.length})
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={bookingSearch}
                  onChange={(e) => setBookingSearch(e.target.value)}
                  placeholder="Search PNR, passenger name, phone, email..."
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-64"
                />
                <button
                  onClick={loadModuleData}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                >
                  Search
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase">
                  <tr>
                    <th className="p-2.5">PNR</th>
                    <th className="p-2.5">Passenger & Type</th>
                    <th className="p-2.5">Contact</th>
                    <th className="p-2.5">Train & Route</th>
                    <th className="p-2.5">Date & Seats</th>
                    <th className="p-2.5">Amount</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {staffBookings.map((b) => (
                    <tr key={b.id}>
                      <td className="p-2.5 font-mono font-bold">{b.pnr}</td>
                      <td className="p-2.5">
                        <div className="font-bold">{b.passenger_name}</div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {b.is_guest_booking ? 'Guest Booking' : 'Account Booking'}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-600">
                        <div>{b.contact_phone || '—'}</div>
                        <div>{b.contact_email || b.account_email || '—'}</div>
                      </td>
                      <td className="p-2.5">#{b.train_number} ({b.from_code} → {b.to_code})</td>
                      <td className="p-2.5">{b.travel_date} • {b.carriage_code} [{b.seats_csv}]</td>
                      <td className="p-2.5 font-semibold">LKR {Number(b.total_amount_lkr).toLocaleString()}</td>
                      <td className="p-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          b.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="p-2.5">
                        {b.status === 'CONFIRMED' && (
                          <button
                            onClick={async () => {
                              await api.cancelBooking(b.pnr, 'Administrative cancellation & refund', true);
                              loadModuleData();
                            }}
                            className="px-2.5 py-1 rounded bg-rose-600 text-white text-[11px] font-semibold"
                          >
                            Cancel & Refund
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODULE 3: COMPLAINTS & FEEDBACK MANAGEMENT */}
      {subTab === 'complaints' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h3 className="font-bold text-base text-slate-900">Passenger Complaints Queue ({staffComplaints.length})</h3>
          {staffComplaints.length === 0 ? (
            <p className="text-xs text-slate-500">No complaints recorded yet.</p>
          ) : (
            staffComplaints.map((c) => (
              <div key={c.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <div>
                    <span className="font-mono font-bold text-xs text-indigo-800 mr-2">[{c.complaint_reference}]</span>
                    <span className="font-bold text-sm text-slate-900">{c.subject}</span>
                    <span className="text-xs text-slate-600 ml-2">
                      — {c.passenger_name} ({c.passenger_email || c.passenger_phone || 'Guest'})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((st) => (
                      <button
                        key={st}
                        onClick={async () => {
                          await api.updateComplaintStatus(c.id, {
                            status: st,
                            resolution_summary:
                              st === 'RESOLVED' ? 'Investigated and resolved by Railway Operations team.' : undefined
                          });
                          loadModuleData();
                        }}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold ${
                          c.status === st ? 'bg-indigo-900 text-white' : 'bg-white border border-slate-300 text-slate-700'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-slate-700">{c.description}</p>

                {/* Existing Responses (Internal & Public) */}
                {c.responses?.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-200">
                    {c.responses.map((r) => (
                      <div
                        key={r.id}
                        className={`p-2 rounded text-xs border ${
                          r.is_internal_note ? 'bg-amber-50 border-amber-300 text-amber-950' : 'bg-white border-slate-200'
                        }`}
                      >
                        <span className="font-bold">
                          {r.is_internal_note ? '[INTERNAL STAFF NOTE] ' : '[PASSENGER VISIBLE] '}
                          {r.author_name}:{' '}
                        </span>
                        <span>{r.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Staff Response or Private Internal Note */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <input
                    type="text"
                    value={replyTextMap[c.id] || ''}
                    onChange={(e) => setReplyTextMap({ ...replyTextMap, [c.id]: e.target.value })}
                    placeholder="Write official passenger reply or private internal note..."
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-xs bg-white"
                  />
                  <label className="flex items-center gap-1 text-xs font-semibold text-amber-900">
                    <input
                      type="checkbox"
                      checked={Boolean(internalFlagMap[c.id])}
                      onChange={(e) => setInternalFlagMap({ ...internalFlagMap, [c.id]: e.target.checked })}
                    />
                    Internal Note Only
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      const msg = replyTextMap[c.id];
                      if (!msg) return;
                      await api.staffReplyComplaint(c.id, {
                        message: msg,
                        is_internal_note: Boolean(internalFlagMap[c.id])
                      });
                      setReplyTextMap({ ...replyTextMap, [c.id]: '' });
                      loadModuleData();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-indigo-900 text-white text-xs font-bold"
                  >
                    Post Note / Reply
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* MODULE 4: TRAVEL PLANNER CONTENT MANAGEMENT */}
      {subTab === 'planner' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleSaveDestination} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <Compass className="w-4 h-4 text-indigo-600" />
              Create / Update Travel Planner Destination
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={destName}
                onChange={(e) => setDestName(e.target.value)}
                placeholder="Destination Name (e.g. Haputale)"
                className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
              <input
                type="text"
                required
                value={destRegion}
                onChange={(e) => setDestRegion(e.target.value)}
                placeholder="Province / Region"
                className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={destCategory}
                onChange={(e) => setDestCategory(e.target.value)}
                placeholder="Category"
                className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
              <select
                value={destStationCode}
                onChange={(e) => setDestStationCode(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
              >
                {stations.map((s) => (
                  <option key={s.code} value={s.code}>Linked Station: {s.name} ({s.code})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Select Supplied Image</label>
              <select
                value={destImage}
                onChange={(e) => setDestImage(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              >
                {SUPPLIED_IMAGE_OPTIONS.map((img) => (
                  <option key={img.path} value={img.path}>{img.label} ({img.path})</option>
                ))}
              </select>
            </div>
            <input
              type="text"
              required
              value={destSummary}
              onChange={(e) => setDestSummary(e.target.value)}
              placeholder="Short summary..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
            />
            <textarea
              rows={2}
              value={destDesc}
              onChange={(e) => setDestDesc(e.target.value)}
              placeholder="Detailed verified description..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
            />
            <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-900 text-white text-xs font-bold">
              Save Destination
            </button>
          </form>

          <form onSubmit={handleSaveAttraction} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
            <h3 className="font-bold text-base text-slate-900">Add Tourist Attraction to Destination</h3>
            <select
              value={attrDestId}
              onChange={(e) => setAttrDestId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold"
            >
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={attrName}
                onChange={(e) => setAttrName(e.target.value)}
                placeholder="Attraction Name"
                className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={attrCategory}
                onChange={(e) => setAttrCategory(e.target.value)}
                placeholder="Category"
                className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                step="0.1"
                value={attrDistKm}
                onChange={(e) => setAttrDistKm(e.target.value)}
                placeholder="Dist from Station (km)"
                className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
              <input
                type="number"
                value={attrFeeLkr}
                onChange={(e) => setAttrFeeLkr(e.target.value)}
                placeholder="Entry Fee (LKR)"
                className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
            </div>
            <select
              value={attrImage}
              onChange={(e) => setAttrImage(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
            >
              {SUPPLIED_IMAGE_OPTIONS.map((img) => (
                <option key={img.path} value={img.path}>{img.label} ({img.path})</option>
              ))}
            </select>
            <textarea
              rows={2}
              required
              value={attrDesc}
              onChange={(e) => setAttrDesc(e.target.value)}
              placeholder="Attraction description..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
            />
            <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold">
              Add Attraction
            </button>
          </form>
        </div>
      )}

      {/* MODULE 5: FINANCIAL MANAGEMENT & REPORTS */}
      {subTab === 'finance' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Period</label>
                  <select
                    value={periodType}
                    onChange={(e) => setPeriodType(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
                  >
                    <option value="DAILY">Daily</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="ANNUAL">Annual</option>
                    <option value="CUSTOM">Custom Range</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
                  />
                </div>
                <button
                  onClick={loadModuleData}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
                >
                  Generate Report
                </button>
              </div>

              <div className="flex gap-2">
                <a
                  href={api.getFinancialReportCsvUrl(startDate, endDate, periodType)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold flex items-center gap-1 hover:bg-slate-50"
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </a>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold flex items-center gap-1 hover:bg-slate-50"
                >
                  <Printer className="w-3.5 h-3.5" /> Print / PDF
                </button>
              </div>
            </div>

            {report && (
              <>
                {report.insufficient_data && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{report.status_message}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">Gross Ticket Revenue</div>
                    <div className="text-lg font-bold text-slate-900 mt-1">
                      LKR {report.metrics.gross_revenue_lkr.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
                    <div className="text-xs text-rose-700">Processed Refunds</div>
                    <div className="text-lg font-bold text-rose-900 mt-1">
                      LKR {report.metrics.total_refunds_lkr.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200">
                    <div className="text-xs text-indigo-700">Net Income (After Refunds)</div>
                    <div className="text-lg font-bold text-indigo-950 mt-1">
                      LKR {report.metrics.net_revenue_lkr.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                    <div className="text-xs text-amber-800">Operating Expenses</div>
                    <div className="text-lg font-bold text-amber-950 mt-1">
                      LKR {report.metrics.operating_expenses_lkr.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                    <div className="text-xs text-emerald-800">
                      Operating {report.metrics.profit_status}
                    </div>
                    <div className="text-lg font-bold text-emerald-950 mt-1">
                      LKR {report.metrics.net_profit_lkr.toLocaleString()}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <form onSubmit={handleAddExpense} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-bold text-base text-slate-900">Record Railway Operating Expense</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <select
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
              >
                <option value="FUEL_ENERGY">Fuel & Traction Energy</option>
                <option value="TRACK_MAINTENANCE">Track & Viaduct Maintenance</option>
                <option value="ROLLING_STOCK">Rolling Stock & Carriages</option>
                <option value="STAFF_PAYROLL">Staff Operations & Payroll</option>
                <option value="STATION_OPERATIONS">Station Operations</option>
                <option value="SIGNALING_TECH">Signaling & Telecom</option>
              </select>
              <input
                type="text"
                value={expenseTitle}
                onChange={(e) => setExpenseTitle(e.target.value)}
                placeholder="Expense title / voucher description"
                className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
                required
              />
              <input
                type="number"
                step="0.01"
                value={expenseAmountLkr}
                onChange={(e) => setExpenseAmountLkr(e.target.value)}
                placeholder="Amount (LKR)"
                className="border border-slate-300 rounded-lg px-3 py-2 text-xs"
                required
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
              >
                Add Expense Record
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODULE 6: STAFF ACCOUNTS & AUDIT LOGS */}
      {subTab === 'staff' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <form onSubmit={handleCreateStaff} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
              <h3 className="font-bold text-base text-slate-900">Provision Railway Staff Account</h3>
              <input
                type="text"
                value={newStaffUsername}
                onChange={(e) => setNewStaffUsername(e.target.value)}
                placeholder="Username"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                required
              />
              <input
                type="email"
                value={newStaffEmail}
                onChange={(e) => setNewStaffEmail(e.target.value)}
                placeholder="Official Email"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                required
              />
              <input
                type="text"
                value={newStaffFullName}
                onChange={(e) => setNewStaffFullName(e.target.value)}
                placeholder="Full Name"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                required
              />
              <select
                value={newStaffRole}
                onChange={(e) => setNewStaffRole(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              >
                <option value="ADMIN">ADMIN</option>
                <option value="FINANCE_STAFF">FINANCE_STAFF</option>
                <option value="COMPLAINT_OFFICER">COMPLAINT_OFFICER</option>
                <option value="STATION_STAFF">STATION_STAFF</option>
              </select>
              <input
                type="password"
                value={newStaffPassword}
                onChange={(e) => setNewStaffPassword(e.target.value)}
                placeholder="Initial Password (min 6 chars)"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                required
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-indigo-950 text-white text-xs font-semibold"
              >
                Create Staff Account
              </button>
            </form>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
              <h3 className="font-bold text-base text-slate-900">Active Staff Accounts ({staffList.length})</h3>
              <div className="space-y-2 text-xs">
                {staffList.map((st) => (
                  <div key={st.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-slate-900">{st.full_name} ({st.username})</div>
                      <div className="text-slate-500">{st.email} • {st.role_code}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${st.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                      {st.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3 max-h-[620px] overflow-y-auto">
            <h3 className="font-bold text-base text-slate-900">Security & Operational Audit Logs ({auditLogs.length})</h3>
            {auditLogs.slice(0, 40).map((log) => (
              <div key={log.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                <div className="font-bold text-slate-800">
                  [{log.actor_type}] {log.actor_identifier || 'System'} → {log.action}
                </div>
                <div className="text-[11px] text-slate-500">
                  Entity: {log.entity_type} #{log.entity_id} • {log.created_at}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Voluntary Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-base text-slate-900">Change Staff Password</h3>
              <button onClick={() => setShowPasswordModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">×</button>
            </div>
            {pwdMessage && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {pwdMessage}
              </div>
            )}
            <form onSubmit={handlePasswordChange} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Password (min 6 chars)</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <button type="submit" className="w-full py-2.5 rounded-xl bg-indigo-900 text-white text-sm font-bold">
                Save New Password
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
