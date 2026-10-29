import React from 'react';
import { Train, Shield, Globe, User, LogOut, Compass, MessageSquareWarning } from 'lucide-react';
import { TRANSLATIONS } from '../i18n/translations.js';

export default function Navbar({
  activeTab,
  setActiveTab,
  user,
  staffUser,
  onOpenAuth,
  onLogoutPassenger,
  language = 'EN',
  setLanguage
}) {
  const t = TRANSLATIONS[language] || TRANSLATIONS.EN;

  const navItems = [
    { id: 'home', label: t.navHome },
    { id: 'schedules', label: t.navSchedules },
    { id: 'tracking', label: t.navLiveTracking },
    { id: 'planner', label: t.navTravelPlanner, icon: Compass },
    { id: 'complaints', label: t.navComplaints, icon: MessageSquareWarning },
    { id: 'dashboard', label: t.navMyBookings }
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#0F172A]/95 backdrop-blur-md border-b border-white/10 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => setActiveTab('home')}
          className="flex items-center gap-3 text-left group"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF6B4A] to-[#D84315] flex items-center justify-center shadow-lg">
            <Train className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-lg tracking-tight leading-none">CEYLON RAIL</div>
            <div className="text-[11px] text-amber-300/90 font-medium mt-0.5">{t.brandSubtitle}</div>
          </div>
        </button>

        <nav className="flex flex-wrap items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
                  active
                    ? 'bg-[#FF6B4A] text-white shadow'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {/* Language Switcher (EN / SI / TA) */}
          <div className="flex items-center bg-slate-800/90 border border-slate-700 rounded-lg p-0.5 text-xs">
            <Globe className="w-3.5 h-3.5 text-amber-400 ml-1.5 mr-1" />
            {['EN', 'SI', 'TA'].map((code) => (
              <button
                key={code}
                onClick={() => setLanguage && setLanguage(code)}
                className={`px-2 py-1 rounded-md font-semibold transition ${
                  language === code ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                {code === 'EN' ? 'EN' : code === 'SI' ? 'සිං' : 'தமிழ்'}
              </button>
            ))}
          </div>

          {/* Separate Staff Portal Button */}
          <button
            onClick={() => setActiveTab('staff')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 ${
              activeTab === 'staff'
                ? 'bg-indigo-600 border-indigo-400 text-white'
                : 'bg-slate-800/80 border-slate-700 text-indigo-300 hover:bg-slate-700'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>{staffUser ? `Staff: ${staffUser.username}` : t.navStaffPortal}</span>
          </button>

          {/* Passenger Account Button */}
          {user ? (
            <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 px-2.5 py-1.5 rounded-lg">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-medium text-slate-200 max-w-[120px] truncate">
                {user.full_name}
              </span>
              <button
                onClick={onLogoutPassenger}
                title={t.signOut}
                className="text-slate-400 hover:text-rose-400 ml-1"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-[#FF6B4A] to-[#FF5722] text-white shadow hover:opacity-95"
            >
              {t.signIn}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
