const { getTrainById } = require('../repositories/railwayRepository');
const { dbAll } = require('../database');
const env = require('../config/env');

/**
 * Compute live/interpolated telemetry for all active trains or a single train.
 * Clearly distinguishes schedule-interpolated simulation from hardware GPS feeds.
 */
function computeTrainTelemetry(trainId, customProgressRatio = null) {
  const train = getTrainById(Number(trainId));
  if (!train || !train.stops || train.stops.length < 2) return null;

  const stops = train.stops;
  const now = new Date();
  // Determine progress along schedule or smooth cycle if outside scheduled window
  const [depH, depM] = String(train.departure_time || '06:00').split(':').map(Number);
  const depMinutesOfDay = (depH || 6) * 60 + (depM || 0);
  const currentMinutesOfDay = (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440; // Sri Lanka UTC+5:30
  const totalDuration = Math.max(30, Number(train.duration_mins) || 300);

  let progressRatio;
  let scheduleState = 'IN_TRANSIT';
  if (customProgressRatio !== null && customProgressRatio !== undefined) {
    progressRatio = Math.max(0, Math.min(1, Number(customProgressRatio)));
  } else {
    const elapsed = currentMinutesOfDay - depMinutesOfDay;
    if (elapsed >= 0 && elapsed <= totalDuration) {
      progressRatio = elapsed / totalDuration;
      scheduleState = 'SCHEDULED_IN_TRANSIT';
    } else {
      // Smooth continuous demonstration cycle when outside live departure window
      const cycleSeconds = 300;
      const offset = (train.id * 47) % cycleSeconds;
      progressRatio = (((Math.floor(Date.now() / 1000) + offset) % cycleSeconds) / cycleSeconds);
      scheduleState = 'TIMETABLE_SIMULATION';
    }
  }

  const totalDistanceKm = stops[stops.length - 1].distance_from_origin_km || 100;
  const coveredDistanceKm = Number((progressRatio * totalDistanceKm).toFixed(1));

  // Locate current segment between two consecutive route stops
  let currentStopIdx = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    const d0 = stops[i].distance_from_origin_km;
    const d1 = stops[i + 1].distance_from_origin_km;
    if (coveredDistanceKm >= d0 && coveredDistanceKm <= d1) {
      currentStopIdx = i;
      break;
    }
  }

  const prevStop = stops[currentStopIdx];
  const nextStop = stops[Math.min(stops.length - 1, currentStopIdx + 1)];
  const segSpan = Math.max(0.1, nextStop.distance_from_origin_km - prevStop.distance_from_origin_km);
  const segRatio = Math.max(0, Math.min(1, (coveredDistanceKm - prevStop.distance_from_origin_km) / segSpan));

  const currentLat = Number((prevStop.lat + (nextStop.lat - prevStop.lat) * segRatio).toFixed(5));
  const currentLng = Number((prevStop.lng + (nextStop.lng - prevStop.lng) * segRatio).toFixed(5));
  const currentElevationM = Math.round(prevStop.elevation_m + (nextStop.elevation_m - prevStop.elevation_m) * segRatio);

  // Calculate heading bearing in degrees
  const dLat = nextStop.lat - prevStop.lat;
  const dLng = nextStop.lng - prevStop.lng;
  const bearingDeg = Math.round(((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360);

  const enrichedStops = stops.map((s, idx) => {
    let status = 'UPCOMING';
    if (idx < currentStopIdx) status = 'COMPLETED';
    else if (idx === currentStopIdx) status = 'ACTIVE';
    return {
      ...s,
      timeline_status: status
    };
  });

  return {
    train_id: train.id,
    train_number: train.train_number,
    train_name: train.name,
    train_name_si: train.name_si,
    train_name_ta: train.name_ta,
    train_type: train.type,
    route_name: train.route_name,
    telemetry_source: train.has_gps_hardware ? 'LIVE_GPS_HARDWARE' : 'SCHEDULE_INTERPOLATED_SIMULATION',
    telemetry_notice: train.has_gps_hardware
      ? 'Connected to onboard GPS transponder.'
      : 'Position interpolated from official Sri Lanka Railways timetable & route GeoJSON (no live onboard GPS feed attached).',
    schedule_state: scheduleState,
    google_maps_configured: env.isGoogleMapsConfigured(),
    lat: currentLat,
    lng: currentLng,
    bearing_deg: bearingDeg,
    elevation_m: currentElevationM,
    speed_kmh: train.base_speed_kmh || 45,
    delay_mins: 0,
    status_label: 'On Time',
    progress_pct: Math.round(progressRatio * 100),
    covered_distance_km: coveredDistanceKm,
    total_distance_km: totalDistanceKm,
    previous_station: {
      code: prevStop.station_code,
      name: prevStop.station_name,
      departure_time: prevStop.departure_time
    },
    next_station: {
      code: nextStop.station_code,
      name: nextStop.station_name,
      arrival_time: nextStop.arrival_time,
      platform: nextStop.platform
    },
    polyline: stops.map((s) => [s.lat, s.lng]),
    stops: enrichedStops
  };
}

function getAllActiveTrainTelemetry() {
  const trainIds = dbAll('SELECT id FROM trains WHERE is_active = 1 ORDER BY departure_time ASC');
  return trainIds.map((r) => computeTrainTelemetry(r.id)).filter(Boolean);
}

module.exports = {
  computeTrainTelemetry,
  getAllActiveTrainTelemetry
};
