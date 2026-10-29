import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar.jsx';
import HeroSearch from './components/HeroSearch.jsx';
import CarriageSeatMap from './components/CarriageSeatMap.jsx';
import LiveMapTracker from './components/LiveMapTracker.jsx';
import ETicketModal from './components/ETicketModal.jsx';
import PassengerDashboard from './pages/PassengerDashboard.jsx';
import TrainSchedules from './pages/TrainSchedules.jsx';
import TravelPlanner from './pages/TravelPlanner.jsx';
import ComplaintsPortal from './pages/ComplaintsPortal.jsx';
import StaffPortal from './pages/StaffPortal.jsx';
import { api, setPassengerSession } from './services/api.js';

const DEFAULT_STATIONS = [
  { id: 1, code: 'FOT', name: 'Colombo Fort', name_en: 'Colombo Fort', name_si: 'කොළඹ කොටුව', name_ta: 'கொழும்பு கோட்டை' },
  { id: 2, code: 'MDA', name: 'Maradana', name_en: 'Maradana', name_si: 'මරදාන', name_ta: 'மருதானை' },
  { id: 3, code: 'RAG', name: 'Ragama', name_en: 'Ragama', name_si: 'රාගම', name_ta: 'ராகமை' },
  { id: 4, code: 'GQ', name: 'Gampaha', name_en: 'Gampaha', name_si: 'ගම්පහ', name_ta: 'கம்பஹா' },
  { id: 5, code: 'PLG', name: 'Polgahawela', name_en: 'Polgahawela', name_si: 'පොල්ගහවෙල', name_ta: 'பொல்கஹவெல' },
  { id: 6, code: 'KDT', name: 'Peradeniya Junction', name_en: 'Peradeniya Junction', name_si: 'පේරාදෙණිය හන්දිය', name_ta: 'பேராதனை சந்தி' },
  { id: 7, code: 'KDY', name: 'Kandy', name_en: 'Kandy', name_si: 'මහනුවර', name_ta: 'கண்டி' },
  { id: 8, code: 'HTN', name: 'Hatton', name_en: 'Hatton', name_si: 'හැටන්', name_ta: 'ஹட்டன்' },
  { id: 9, code: 'NNO', name: 'Nanu Oya (Nuwara Eliya)', name_en: 'Nanu Oya', name_si: 'නානුඔය', name_ta: 'நானுஓயா' },
  { id: 10, code: 'HPT', name: 'Haputale', name_en: 'Haputale', name_si: 'හපුතලේ', name_ta: 'ஹப்புத்தளை' },
  { id: 11, code: 'ELL', name: 'Ella', name_en: 'Ella', name_si: 'ඇල්ල', name_ta: 'எல்ல' },
  { id: 12, code: 'BAD', name: 'Badulla', name_en: 'Badulla', name_si: 'බදුල්ල', name_ta: 'பதுளை' },
  { id: 13, code: 'GLE', name: 'Galle', name_en: 'Galle', name_si: 'ගාල්ල', name_ta: 'காலி' },
  { id: 14, code: 'MTR', name: 'Matara', name_en: 'Matara', name_si: 'මාතර', name_ta: 'மாத்தறை' },
  { id: 15, code: 'PLN', name: 'Polonnaruwa', name_en: 'Polonnaruwa', name_si: 'පොළොන්නරුව', name_ta: 'பொலன்னறுவை' },
  { id: 16, code: 'ANP', name: 'Anuradhapura', name_en: 'Anuradhapura', name_si: 'අනුරාධපුරය', name_ta: 'அனுராதபுரம்' },
  { id: 17, code: 'KKS', name: 'Jaffna', name_en: 'Jaffna', name_si: 'යාපනය', name_ta: 'யாழ்ப்பாணம்' }
];

const DEFAULT_TRAINS = [
  {
    id: 1,
    train_number: '1005',
    name: 'Podi Menike',
    type: 'Intercity Express',
    route_name: 'Main Line (Colombo Fort → Badulla)',
    origin_name: 'Colombo Fort',
    dest_name: 'Badulla',
    departure_time: '05:55',
    arrival_time: '16:10',
    duration_mins: 615,
    segment_distance_km: 271.6,
    available_seats: 188,
    occupancy_status: 'Available',
    classes_available: '1st Class Observation,1st Class Air Conditioned,2nd Class Reserved,3rd Class Reserved'
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [language, setLanguage] = useState('EN');

  const [stations, setStations] = useState(DEFAULT_STATIONS);
  const [trains, setTrains] = useState(DEFAULT_TRAINS);
  const [selectedTrain, setSelectedTrain] = useState(DEFAULT_TRAINS[0]);
  const [searchFilters, setSearchFilters] = useState({
    from: 'FOT',
    to: 'ELL',
    date: new Date().toISOString().slice(0, 10),
    passengers: 1
  });

  // Optional Passenger Account state (Not required for ordinary booking)
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ceylon_rail_passenger_user') || 'null');
    } catch (_e) {
      return null;
    }
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    nic_passport: '',
    password: ''
  });
  const [authError, setAuthError] = useState('');

  // Separate Staff Portal Auth State
  const [staffUser, setStaffUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ceylon_rail_staff_user') || 'null');
    } catch (_e) {
      return null;
    }
  });

  // Bookings in current session (both guest bookings and logged-in passenger bookings)
  const [bookings, setBookings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ceylon_rail_guest_bookings') || '[]');
    } catch (_e) {
      return [];
    }
  });
  const [activeTicket, setActiveTicket] = useState(null);

  useEffect(() => {
    api
      .getStations()
      .then((res) => {
        if (Array.isArray(res.stations) && res.stations.length > 0) {
          setStations(res.stations);
        }
      })
      .catch(() => {});

    api
      .searchTrains()
      .then((res) => {
        if (Array.isArray(res.trains) && res.trains.length > 0) {
          setTrains(res.trains);
          setSelectedTrain(res.trains[0]);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      api.getMyBookings().then((res) => {
        if (Array.isArray(res.bookings)) {
          setBookings(res.bookings);
        }
      }).catch(() => {});
    }
  }, [user]);

  const handleSearch = async (params) => {
    const merged = { ...searchFilters, ...params };
    setSearchFilters(merged);
    try {
      const res = await api.searchTrains({
        from: merged.from,
        to: merged.to,
        date: merged.date
      });
      if (Array.isArray(res.trains)) {
        setTrains(res.trains);
      }
    } catch (_e) {}
    setActiveTab('schedules');
  };

  const handlePassengerAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res =
        authMode === 'login'
          ? await api.loginPassenger({ email: authForm.email, password: authForm.password })
          : await api.registerPassenger({ ...authForm, preferred_language: language });
      setPassengerSession(res.token, res.user);
      setUser(res.user);
      setShowAuthModal(false);
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleLogoutPassenger = async () => {
    try {
      await api.logoutPassenger();
    } catch (_e) {}
    setPassengerSession(null, null);
    setUser(null);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        staffUser={staffUser}
        onOpenAuth={() => setShowAuthModal(true)}
        onLogoutPassenger={handleLogoutPassenger}
        language={language}
        setLanguage={setLanguage}
      />

      <main className="flex-1">
        {activeTab === 'home' && (
          <HeroSearch
            stations={stations}
            searchFilters={searchFilters}
            onSearch={handleSearch}
            onSelectRoute={(fromCode, toCode) => handleSearch({ from: fromCode, to: toCode })}
            onOpenLookup={() => setActiveTab('dashboard')}
            onOpenPlanner={() => setActiveTab('planner')}
            language={language}
          />
        )}

        {activeTab === 'schedules' && (
          <TrainSchedules
            trains={trains}
            stations={stations}
            searchFilters={searchFilters}
            onSearch={handleSearch}
            onSelectTrain={(train) => {
              setSelectedTrain(train);
              setActiveTab('seat-selection');
            }}
          />
        )}

        {activeTab === 'seat-selection' && (
          <CarriageSeatMap
            train={selectedTrain || DEFAULT_TRAINS[0]}
            travelDate={searchFilters.date}
            fromStation={searchFilters.from}
            toStation={searchFilters.to}
            user={user}
            onBack={() => setActiveTab('schedules')}
            onViewTicket={(ticket) => setActiveTicket(ticket)}
            onBookingComplete={(newBooking) => {
              const updated = [newBooking, ...bookings.filter((b) => b.pnr !== newBooking.pnr)];
              setBookings(updated);
              try {
                localStorage.setItem('ceylon_rail_guest_bookings', JSON.stringify(updated.slice(0, 15)));
              } catch (_e) {}
              setActiveTicket(newBooking);
            }}
          />
        )}

        {activeTab === 'tracking' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
            <LiveMapTracker initialTrainId={selectedTrain?.id || 1} />
          </div>
        )}

        {activeTab === 'planner' && (
          <TravelPlanner
            user={user}
            onOpenAuth={() => setShowAuthModal(true)}
            onSelectTrainFromPlanner={(trainId, destStationCode) => {
              const found = trains.find((t) => t.id === trainId) || trains[0];
              if (found) {
                setSelectedTrain(found);
                setSearchFilters((prev) => ({ ...prev, to: destStationCode || prev.to }));
                setActiveTab('seat-selection');
              }
            }}
          />
        )}

        {activeTab === 'complaints' && (
          <ComplaintsPortal
            user={user}
            trains={trains}
            onOpenAuth={() => setShowAuthModal(true)}
          />
        )}

        {activeTab === 'dashboard' && (
          <PassengerDashboard
            user={user}
            bookings={bookings}
            onViewTicket={(b) => setActiveTicket(b)}
            onTrackTrain={(trainId) => {
              const found = trains.find((t) => t.id === trainId);
              if (found) setSelectedTrain(found);
              setActiveTab('tracking');
            }}
            onCancelBooking={async (pnr, verification = '') => {
              const res = await api.cancelBooking(pnr, 'Cancelled by passenger', false, verification);
              const updated = bookings.map((b) => (b.pnr === pnr ? res.booking : b));
              setBookings(updated);
              try {
                localStorage.setItem('ceylon_rail_guest_bookings', JSON.stringify(updated.slice(0, 15)));
              } catch (_e) {}
            }}
          />
        )}

        {activeTab === 'staff' && (
          <StaffPortal staffUser={staffUser} setStaffUser={setStaffUser} />
        )}
      </main>

      {activeTicket && (
        <ETicketModal
          booking={activeTicket}
          onClose={() => setActiveTicket(null)}
        />
      )}

      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold">
                  {authMode === 'login' ? 'Optional Passenger Sign In' : 'Create Optional Passenger Account'}
                </h2>
                <p className="text-xs text-slate-500">
                  Note: You can book tickets and retrieve bookings as a Guest without signing in.
                </p>
              </div>
              <button onClick={() => setShowAuthModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">
                ×
              </button>
            </div>
            {authError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                {authError}
              </div>
            )}
            <form onSubmit={handlePassengerAuth} className="space-y-3">
              {authMode === 'register' && (
                <>
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={authForm.full_name}
                    onChange={(e) => setAuthForm({ ...authForm, full_name: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    required
                  />
                  <input
                    type="text"
                    placeholder="NIC or Passport Number"
                    value={authForm.nic_passport}
                    onChange={(e) => setAuthForm({ ...authForm, nic_passport: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Mobile Phone (+94 ...)"
                    value={authForm.phone}
                    onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </>
              )}
              <input
                type="email"
                placeholder="Email Address"
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                required
              />
              <input
                type="password"
                placeholder="Password (min 6 characters)"
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                required
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-[#FF6B4A] text-white font-semibold text-sm"
              >
                {authMode === 'login' ? 'Sign In' : 'Register & Continue'}
              </button>
            </form>
            <div className="text-xs text-center text-slate-600">
              {authMode === 'login' ? (
                <button onClick={() => setAuthMode('register')} className="text-indigo-600 font-semibold">
                  Want an optional account? Register here
                </button>
              ) : (
                <button onClick={() => setAuthMode('login')} className="text-indigo-600 font-semibold">
                  Already have an account? Sign in
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
