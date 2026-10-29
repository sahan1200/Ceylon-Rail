export const TRANSLATIONS = {
  EN: {
    brandSubtitle: 'Sri Lanka Railways',
    navHome: 'Home',
    navSchedules: 'Train Schedules',
    navLiveTracking: 'Live Radar',
    navTravelPlanner: 'Smart Travel Planner',
    navComplaints: 'Complaints & Feedback',
    navMyBookings: 'Booking Lookup & Tickets',
    navStaffPortal: 'Staff Portal',
    signIn: 'Optional Sign In',
    signOut: 'Sign Out',
    heroBadge: 'Official Sri Lanka Railway Reservation & Operations Platform',
    heroTitle: 'Journey Through the Emerald Highlands & Coastal Shores',
    heroSubtitle: 'Instant guest seat reservation without login, dynamic route-stop fare calculation, smart travel planning, and live GIS train tracking across Sri Lanka.',
    fromStation: 'From Station',
    toStation: 'To Station',
    travelDate: 'Travel Date',
    passengers: 'Passengers',
    searchTrains: 'Search Trains',
    telemetryNotice: 'Schedule-Interpolated Telemetry (No Live GPS Transponder Attached)',
    googleMapsLayer: 'Google Maps Satellite / Hybrid'
  },
  SI: {
    brandSubtitle: 'ශ්‍රී ලංකා දුම්රිය සේවය',
    navHome: 'මුල් පිටුව',
    navSchedules: 'දුම්රිය කාලසටහන්',
    navLiveTracking: 'සජීවී දුම්රිය සිතියම',
    navTravelPlanner: 'සංචාරක සැලසුම්කරු',
    navComplaints: 'පැමිණිලි සහ ප්‍රතිචාර',
    navMyBookings: 'වෙන්කිරීම් පරීක්ෂාව',
    navStaffPortal: 'කාර්ය මණ්ඩල පිවිසුම',
    signIn: 'මගී පිවිසුම (අත්‍යවශ්‍ය නොවේ)',
    signOut: 'ඉවත් වන්න',
    heroBadge: 'ශ්‍රී ලංකා දුම්රිය ආසන වෙන්කිරීමේ සහ මෙහෙයුම් පද්ධතිය',
    heroTitle: 'කඳුකර තේ වතු සහ වෙරළ තීරය හරහා සුන්දර දුම්රිය චාරිකා',
    heroSubtitle: 'ගිණුමක් නොමැතිව ක්ෂණික ආසන වෙන්කිරීම, ගාස්තු ගණනය කිරීම, සංචාරක සැලසුම් සහ සජීවී දුම්රිය ධාවන සිතියම.',
    fromStation: 'ආරම්භක දුම්රිය ස්ථානය',
    toStation: 'ගමනාන්ත දුම්රිය ස්ථානය',
    travelDate: 'ගමන් දිනය',
    passengers: 'මගීන් ගණන',
    searchTrains: 'දුම්රිය සොයන්න',
    telemetryNotice: 'කාලසටහන මත පදම් වූ අනුමාන පිහිටීම (සජීවී GPS උපාංග සම්බන්ධ කර නොමැත)',
    googleMapsLayer: 'ගූගල් චන්ද්‍රිකා සිතියම (Google Maps)'
  },
  TA: {
    brandSubtitle: 'இலங்கை புகையிரத சேவை',
    navHome: 'முகப்பு',
    navSchedules: 'ரயில் நேர அட்டவணை',
    navLiveTracking: 'நேரடி ரயில் வரைபடம்',
    navTravelPlanner: 'சுற்றுலா திட்டமிடல்',
    navComplaints: 'புகார்கள் & கருத்துகள்',
    navMyBookings: 'முன்பதிவு தேடல்',
    navStaffPortal: 'பணியாளர் தளம்',
    signIn: 'பயணி உள்நுழைவு',
    signOut: 'வெளியேறு',
    heroBadge: 'இலங்கை புகையிரத ஆசன முன்பதிவு மற்றும் செயல்பாட்டு தளம்',
    heroTitle: 'பசுமையான மலைநாட்டு தேயிலைத் தோட்டங்கள் மற்றும் கடற்கரை ரயில் பயணம்',
    heroSubtitle: 'கணக்கு இன்றி உடனடி இருக்கை முன்பதிவு, கட்டணக் கணக்கீடு, சுற்றுலாத் திட்டமிடல் மற்றும் நேரடி ரயில் கண்காணிப்பு.',
    fromStation: 'புறப்படும் நிலையம்',
    toStation: 'சேரும் நிலையம்',
    travelDate: 'பயண தேதி',
    passengers: 'பயணிகள்',
    searchTrains: 'ரயில்களைத் தேடுங்கள்',
    telemetryNotice: 'நேர அட்டவணை அடிப்படையிலான இருப்பிடம் (நேரடி GPS இணைக்கப்படவில்லை)',
    googleMapsLayer: 'கூகிள் செயற்கைக்கோள் வரைபடம் (Google Maps)'
  }
};

export function t(lang = 'EN', key = '') {
  const code = String(lang || 'EN').toUpperCase();
  return TRANSLATIONS[code]?.[key] || TRANSLATIONS.EN?.[key] || key;
}

export function formatStationName(station, lang = 'EN') {
  if (!station) return '';
  const code = String(lang || 'EN').toUpperCase();
  const baseName = station.name || station.name_en || station.code || '';
  if (code === 'SI' && station.name_si) return `${station.name_si} (${baseName})`;
  if (code === 'TA' && station.name_ta) return `${station.name_ta} (${baseName})`;
  return baseName;
}
