import React, { useState, useEffect } from 'react';
import {
  MapPin, Calendar, Users, Search, Compass, Ticket,
  Download, Globe, ArrowRight, Sparkles, Mountain, ShieldCheck,
  History, Train, Map
} from 'lucide-react';
import { t } from '../i18n/translations.js';

const FALLBACK_STATIONS = [
  { code: 'FOT', name_en: 'Colombo Fort', name_si: 'කොළඹ කොටුව', name_ta: 'கொழும்பு கோட்டை' },
  { code: 'MDA', name_en: 'Maradana', name_si: 'මරදාන', name_ta: 'மருதானை' },
  { code: 'RAG', name_en: 'Ragama', name_si: 'රාගම', name_ta: 'ராகமை' },
  { code: 'GQ', name_en: 'Gampaha', name_si: 'ගම්පහ', name_ta: 'கம்பஹா' },
  { code: 'PLG', name_en: 'Polgahawela', name_si: 'පොල්ගහවෙල', name_ta: 'பொல்கஹவெல' },
  { code: 'KDT', name_en: 'Peradeniya Junction', name_si: 'පේරාදෙණිය හන්දිය', name_ta: 'பேராதனை சந்தி' },
  { code: 'KDY', name_en: 'Kandy', name_si: 'මහනුවර', name_ta: 'கண்டி' },
  { code: 'HTN', name_en: 'Hatton', name_si: 'හැටන්', name_ta: 'ஹட்டன்' },
  { code: 'NNO', name_en: 'Nanu Oya (Nuwara Eliya)', name_si: 'නානුඔය', name_ta: 'நானுஓயா' },
  { code: 'PTH', name_en: 'Pattipola', name_si: 'පට්ටිපොළ', name_ta: 'பட்டிப்பொல' },
  { code: 'HPT', name_en: 'Haputale', name_si: 'හපුතලේ', name_ta: 'ஹப்புத்தளை' },
  { code: 'ELL', name_en: 'Ella', name_si: 'ඇල්ල', name_ta: 'எல்ல' },
  { code: 'BAD', name_en: 'Badulla', name_si: 'බදුල්ල', name_ta: 'பதுளை' },
  { code: 'GLE', name_en: 'Galle', name_si: 'ගාල්ල', name_ta: 'காலி' },
  { code: 'MTR', name_en: 'Matara', name_si: 'මාතර', name_ta: 'மாத்தறை' },
  { code: 'BLT', name_en: 'Beliatta', name_si: 'බෙලිඅත්ත', name_ta: 'பெலியத்தை' },
  { code: 'PLN', name_en: 'Polonnaruwa', name_si: 'පොළොන්නරුව', name_ta: 'பொலன்னறுவை' },
  { code: 'ANP', name_en: 'Anuradhapura', name_si: 'අනුරාධපුරය', name_ta: 'அனுராதபுரம்' },
  { code: 'KKS', name_en: 'Jaffna', name_si: 'යාපනය', name_ta: 'யாழ்ப்பாணம்' }
];

// Uses the user's supplied images from /images/
const SCENIC_JOURNEYS = [
  {
    id: 'kandy-ella',
    title: 'Kandy to Ella Odyssey',
    subtitle: 'Nine Arch Bridge & Misty Tea Highlands',
    fromCode: 'KDY',
    toCode: 'ELL',
    duration: '6h 35m',
    price: 'LKR 1,500',
    badge: 'World Famous Scenic Route',
    image: '/images/route_highland.jpg',
    alt: 'Blue highland train crossing the Nine Arch stone viaduct through emerald tea estates'
  },
  {
    id: 'colombo-galle',
    title: 'Coastal Express to Galle Fort',
    subtitle: 'Indian Ocean Shoreline & Golden Beaches',
    fromCode: 'FOT',
    toCode: 'GLE',
    duration: '2h 12m',
    price: 'LKR 1,100',
    badge: 'Indian Ocean Coastal Line',
    image: '/images/route_coastal.jpg',
    alt: 'Sri Lanka Coastal Line railway track beside golden beach and Indian Ocean waves at sunset'
  },
  {
    id: 'colombo-kandy',
    title: 'Kandyan Cultural Heritage Express',
    subtitle: 'Temple of the Tooth & Royal Lake Capital',
    fromCode: 'FOT',
    toCode: 'KDY',
    duration: '3h 04m',
    price: 'LKR 1,250',
    badge: 'UNESCO Cultural Line',
    image: '/images/route_cultural.jpg',
    alt: 'Sacred Temple of the Tooth Relic and Kandy Lake surrounded by misty hills'
  },
  {
    id: 'colombo-jaffna',
    title: 'Yal Devi Northern Express',
    subtitle: 'Anuradhapura Stupas & Northern Lagoons',
    fromCode: 'FOT',
    toCode: 'KKS',
    duration: '7h 15m',
    price: 'LKR 2,500',
    badge: 'Northern Palmyra Line',
    image: '/images/route_northern.jpg',
    alt: 'Northern Line express train passing palmyra palms and coastal lagoon waters'
  }
];

const LANDSCAPE_GALLERY = [
  {
    image: '/images/image_441e3b.jpg',
    badge: 'Highland Tea Slopes',
    title: 'Window View Aboard the Udarata Menike',
    description: 'Experience open-window mountain breezes as the train curves along emerald Ceylon tea terraces between Hatton and Nanu Oya.',
    alt: 'Passenger view from train window curving through lush green Sri Lankan tea plantations'
  },
  {
    image: '/images/image_4421da.jpg',
    badge: 'Summit Mist (1,613m – 1,897m)',
    title: 'Misty Cloud-Forest Railway Stations',
    description: 'Historic colonial hill-country stations along the Main Line shrouded in cool mountain fog and eucalyptus forests.',
    alt: 'Misty Sri Lankan hill country railway station surrounded by cloud forest and curved dual tracks'
  },
  {
    image: '/images/image_442524.jpg',
    badge: '1867 Ceylon Railway Archive',
    title: 'Historic Kandy Railway Terminus',
    description: 'Archival engraving commemorating the arrival of the first Ceylon Government Railway train into Kandy.',
    alt: 'Historic 19th-century engraving of the Kandy Terminus of the Ceylon Railway'
  },
  {
    image: '/images/image_441e5f.jpg',
    badge: 'Official Network Map',
    title: 'Sri Lanka Railways 1,593 km National Network',
    description: 'Comprehensive operational corridor map spanning the Main Line, Coastal Line, Northern Line, and Eastern Line.',
    alt: 'Sri Lanka Railways national network map showing operating passenger train lines and junctions'
  }
];

export default function HeroSearch({
  stations = [],
  searchFilters,
  searchParams,
  setSearchParams,
  onSearch,
  onSearchSubmit,
  onSelectRoute,
  onSelectScenicRoute,
  onOpenLookup,
  onOpenPlanner,
  language = 'en'
}) {
  const stationList = Array.isArray(stations) && stations.length > 0 ? stations : FALLBACK_STATIONS;

  const initialFilters = searchFilters || searchParams || {};
  const [from, setFrom] = useState(initialFilters.from || 'FOT');
  const [to, setTo] = useState(initialFilters.to || 'ELL');
  const [date, setDate] = useState(initialFilters.date || new Date().toISOString().slice(0, 10));
  const [passengers, setPassengers] = useState(initialFilters.passengers || 1);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    const incoming = searchFilters || searchParams;
    if (incoming) {
      if (incoming.from) setFrom(incoming.from);
      if (incoming.to) setTo(incoming.to);
      if (incoming.date) setDate(incoming.date);
      if (incoming.passengers) setPassengers(incoming.passengers);
    }
  }, [searchFilters, searchParams]);

  const getStationLabel = (st) => {
    if (!st) return '';
    const langCode = String(language || 'EN').toUpperCase();
    if (langCode === 'SI' && st.name_si) return `${st.name_si} (${st.code})`;
    if (langCode === 'TA' && st.name_ta) return `${st.name_ta} (${st.code})`;
    const enName = st.name_en || st.name || st.code;
    return `${enName} (${st.code})`;
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    setSearchError('');
    if (from === to) {
      setSearchError('Departure station and destination station cannot be the same.');
      return;
    }
    const payload = { from, to, date, passengers: Number(passengers) || 1 };
    if (setSearchParams) setSearchParams(payload);
    if (onSearch) onSearch(payload);
    else if (onSearchSubmit) onSearchSubmit(payload);
  };

  const handleScenicClick = (journey) => {
    const payload = {
      from: journey.fromCode,
      to: journey.toCode,
      date,
      passengers: Number(passengers) || 1
    };
    setFrom(journey.fromCode);
    setTo(journey.toCode);
    if (onSelectRoute) onSelectRoute(journey.fromCode, journey.toCode);
    else if (onSelectScenicRoute) onSelectScenicRoute({ from: journey.fromCode, to: journey.toCode });
    else if (onSearch) onSearch(payload);
  };

  return (
    <div>
      {/* Hero Banner with Supplied hero_mountain_train.jpg */}
      <section className="relative min-h-[620px] flex items-center justify-center overflow-hidden">
        <img
          src="/images/hero_mountain_train.jpg"
          alt="Sri Lanka Railways blue mountain train crossing the Nine Arch Bridge at sunrise"
          className="absolute inset-0 w-full h-full object-cover object-center transform scale-105 transition-transform duration-1000"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0F172A]/80 via-[#0F172A]/60 to-[#0F172A]/95" />

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16 w-full text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-amber-300 text-xs font-semibold tracking-wider uppercase mb-5 shadow-lg">
            <Sparkles className="w-3.5 h-3.5" />
            Instant Guest Booking • No Account Required • Official Sri Lanka Railways Fares
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-tight mb-4 drop-shadow-lg">
            {t(language, 'heroTitle')}
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-slate-200 max-w-2xl mx-auto mb-8 font-normal drop-shadow">
            {t(language, 'heroSubtitle')}
          </p>

          {/* Prominent Train Search Panel */}
          <form
            onSubmit={handleFormSubmit}
            className="bg-white/15 backdrop-blur-xl border border-white/30 rounded-2xl p-4 sm:p-6 shadow-2xl max-w-5xl mx-auto text-left"
          >
            {searchError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/90 text-white text-xs font-bold">
                {searchError}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-end">
              {/* From Station */}
              <div className="lg:col-span-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-amber-200 mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-orange-400" />
                  {t(language, 'fromStation')}
                </label>
                <select
                  aria-label="Departure Station"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full bg-white/95 text-slate-900 font-semibold text-sm rounded-xl px-3.5 py-3 border border-white/40 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-sm"
                >
                  {stationList.map((st) => (
                    <option key={st.code || st.id} value={st.code}>
                      {getStationLabel(st)}
                    </option>
                  ))}
                </select>
              </div>

              {/* To Station */}
              <div className="lg:col-span-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-amber-200 mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                  {t(language, 'toStation')}
                </label>
                <select
                  aria-label="Destination Station"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full bg-white/95 text-slate-900 font-semibold text-sm rounded-xl px-3.5 py-3 border border-white/40 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-sm"
                >
                  {stationList.map((st) => (
                    <option key={st.code || st.id} value={st.code}>
                      {getStationLabel(st)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Travel Date */}
              <div className="lg:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-amber-200 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-sky-400" />
                  {t(language, 'travelDate')}
                </label>
                <input
                  aria-label="Travel Date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-white/95 text-slate-900 font-semibold text-sm rounded-xl px-3.5 py-3 border border-white/40 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-sm"
                />
              </div>

              {/* Passengers */}
              <div className="lg:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-amber-200 mb-1.5 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-purple-300" />
                  {t(language, 'passengers')}
                </label>
                <select
                  aria-label="Number of Passengers"
                  value={passengers}
                  onChange={(e) => setPassengers(Number(e.target.value))}
                  className="w-full bg-white/95 text-slate-900 font-semibold text-sm rounded-xl px-3.5 py-3 border border-white/40 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-sm"
                >
                  {[1, 2, 3, 4, 5, 6].map((num) => (
                    <option key={num} value={num}>
                      {num} {num === 1 ? 'Passenger' : 'Passengers'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search Button */}
              <div className="lg:col-span-2">
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-[#FF6B4A] to-[#FF5722] hover:from-[#FF5722] hover:to-[#E64A19] text-white font-bold text-sm py-3.5 px-5 rounded-xl shadow-lg shadow-orange-600/30 hover:shadow-orange-600/50 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                  <span>{t(language, 'searchTrains')}</span>
                </button>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/20 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-200">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Book directly as a Guest Passenger — no account registration or login required.</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {onOpenLookup && (
                  <button
                    type="button"
                    onClick={onOpenLookup}
                    className="text-amber-300 hover:text-amber-200 font-semibold underline underline-offset-4"
                  >
                    Retrieve / Cancel Existing Booking →
                  </button>
                )}
                {onOpenPlanner && (
                  <button
                    type="button"
                    onClick={onOpenPlanner}
                    className="text-emerald-300 hover:text-emerald-200 font-semibold underline underline-offset-4"
                  >
                    Explore Smart Travel Planner →
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </section>

      {/* 4 Rounded Feature Cards Below Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 -mt-10 relative z-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {
              icon: Ticket,
              title: 'No-Login Guest Booking',
              desc: 'Select seats, enter passenger details, and receive yourconfirmed PNR & QR ticket without creating an account.',
              color: 'bg-indigo-500/10 text-indigo-600 border-indigo-200'
            },
            {
              icon: Compass,
              title: 'Live GIS Train Radar',
              desc: 'Track schedule-interpolated train positions, elevation profiles, and ordered station stops across Sri Lanka.',
              color: 'bg-emerald-500/10 text-emerald-600 border-emerald-200'
            },
            {
              icon: Download,
              title: 'HMAC Signed e-Tickets',
              desc: 'Download or print your Ceylon Rail voucher with tamper-proof cryptographic QR verification.',
              color: 'bg-amber-500/10 text-amber-700 border-amber-200'
            },
            {
              icon: Globe,
              title: 'Smart Travel Planner',
              desc: 'Browse Ella, Badulla, Nuwara Eliya, Kandy, Galle, Anuradhapura & Polonnaruwa with verified rail links.',
              color: 'bg-rose-500/10 text-rose-600 border-rose-200'
            }
          ].map((feat, idx) => {
            const Icon = feat.icon;
            return (
              <div
                key={idx}
                className="bg-white rounded-2xl p-5 shadow-xl shadow-slate-900/5 border border-slate-100 hover:-translate-y-1 transition-all duration-200 flex items-start gap-4"
              >
                <div className={`p-3 rounded-xl border ${feat.color} shrink-0`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base mb-1">{feat.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Popular Scenic Journeys Section (Using Supplied Route Images) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-orange-600 mb-2">
              <Mountain className="w-4 h-4" />
              Iconic Heritage Rail Corridors
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Popular Scenic Railway Journeys in Sri Lanka
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-200 px-3.5 py-2 rounded-lg shadow-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Click any route card to load live schedules & interactive seat maps
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {SCENIC_JOURNEYS.map((item) => (
            <div
              key={item.id}
              onClick={() => handleScenicClick(item)}
              className="group bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-2xl border border-slate-200/80 transition-all duration-300 cursor-pointer flex flex-col"
            >
              <div className="relative h-52 overflow-hidden bg-slate-900">
                <img
                  src={item.image}
                  alt={item.alt}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />
                <span className="absolute top-3 left-3 bg-slate-900/85 backdrop-blur-md text-amber-300 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-white/15">
                  {item.badge}
                </span>
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white">
                  <span className="text-xs font-medium bg-white/20 backdrop-blur-sm px-2.5 py-0.5 rounded-md">
                    {item.duration}
                  </span>
                  <span className="text-sm font-extrabold text-amber-300">
                    From {item.price}
                  </span>
                </div>
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-base group-hover:text-orange-600 transition-colors mb-1">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">{item.subtitle}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-900 group-hover:text-orange-600">
                  <span>Search Trains & Seats ({item.fromCode} → {item.toCode})</span>
                  <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Station, Train, Heritage & Network Gallery Section (Using Supplied Images) */}
      <section className="bg-slate-900 text-white py-16 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">
                <Train className="w-4 h-4" />
                Stations, Landscapes & Network Heritage
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold">
                Discover Ceylon Rail Across the Island
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 max-w-md">
              From 19th-century colonial stone viaducts and misty hill stations to the 1,593 km national network.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {LANDSCAPE_GALLERY.map((card, idx) => (
              <div
                key={idx}
                className="bg-slate-800/80 border border-slate-700/80 rounded-2xl overflow-hidden flex flex-col shadow-xl hover:border-amber-400/50 transition"
              >
                <div className="relative h-52 bg-slate-950 overflow-hidden">
                  <img
                    src={card.image}
                    alt={card.alt}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                  />
                  <span className="absolute top-3 left-3 bg-slate-950/85 text-amber-300 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-white/15">
                    {card.badge}
                  </span>
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-white text-base mb-1.5">{card.title}</h3>
                    <p className="text-xs text-slate-300 leading-relaxed">{card.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
