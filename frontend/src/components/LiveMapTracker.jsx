import React, { useState, useEffect } from 'react';
import { Navigation, Layers, Radio, Gauge, Mountain, Clock, MapPin, AlertCircle } from 'lucide-react';
import { api } from '../services/api.js';

const MAP_TILE_LAYERS = {
  GOOGLE_HYBRID: {
    name: 'Google Maps Satellite Hybrid',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps Satellite Hybrid'
  },
  GOOGLE_STREETS: {
    name: 'Google Maps Streets',
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps'
  },
  GOOGLE_TERRAIN: {
    name: 'Google Maps Terrain',
    url: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps Terrain'
  },
  ESRI_SATELLITE: {
    name: 'ESRI World Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri'
  }
};

const FALLBACK_FLEET = [
  { train_id: 1, train_number: '1005', train_name: 'Podi Menike', progress_pct: 64 },
  { train_id: 2, train_number: '1015', train_name: 'Udarata Menike', progress_pct: 42 },
  { train_id: 3, train_number: '8050', train_name: 'Ruhunu Kumari', progress_pct: 78 },
  { train_id: 4, train_number: '4077', train_name: 'Yal Devi', progress_pct: 51 }
];

const FALLBACK_TELEMETRY = {
  train_id: 1,
  train_number: '1005',
  train_name: 'Podi Menike',
  speed_kmh: 48,
  elevation_m: 1285,
  lat: 6.9271,
  lng: 80.5885,
  progress_pct: 64,
  covered_distance_km: 148,
  total_distance_km: 230,
  telemetry_source: 'SCHEDULE_INTERPOLATED_SIMULATION',
  telemetry_notice: 'Schedule-interpolated simulation (no hardware GPS transponder attached).',
  next_station: { name: 'Nanu Oya', code: 'NNO' },
  stops: [
    { stop_order: 1, station_name: 'Colombo Fort', station_code: 'FOT', distance_from_origin_km: 0, elevation_m: 7, platform: 3, departure_time: '05:55', timeline_status: 'COMPLETED' },
    { stop_order: 2, station_name: 'Peradeniya Junction', station_code: 'PDN', distance_from_origin_km: 115, elevation_m: 476, platform: 1, departure_time: '08:30', timeline_status: 'COMPLETED' },
    { stop_order: 3, station_name: 'Kandy', station_code: 'KDT', distance_from_origin_km: 121, elevation_m: 500, platform: 2, departure_time: '08:50', timeline_status: 'COMPLETED' },
    { stop_order: 4, station_name: 'Hatton', station_code: 'HTN', distance_from_origin_km: 174, elevation_m: 1262, platform: 1, departure_time: '11:15', timeline_status: 'ACTIVE' },
    { stop_order: 5, station_name: 'Nanu Oya', station_code: 'NNO', distance_from_origin_km: 206, elevation_m: 1613, platform: 1, departure_time: '12:40', timeline_status: 'UPCOMING' },
    { stop_order: 6, station_name: 'Ella', station_code: 'ELL', distance_from_origin_km: 271, elevation_m: 1041, platform: 1, departure_time: '15:15', timeline_status: 'UPCOMING' },
    { stop_order: 7, station_name: 'Badulla', station_code: 'BAD', distance_from_origin_km: 292, elevation_m: 652, platform: 1, departure_time: '16:10', timeline_status: 'UPCOMING' }
  ]
};

export default function LiveMapTracker({ initialTrainId = 1 }) {
  const [fleet, setFleet] = useState(FALLBACK_FLEET);
  const [selectedTrainId, setSelectedTrainId] = useState(initialTrainId);
  const [telemetry, setTelemetry] = useState(FALLBACK_TELEMETRY);
  const [mapLayer, setMapLayer] = useState('GOOGLE_HYBRID');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const fleetRes = await api.getFleetTelemetry();
        if (mounted && Array.isArray(fleetRes.fleet) && fleetRes.fleet.length > 0) {
          setFleet(fleetRes.fleet);
        }
        const singleRes = await api.getTrainTelemetry(selectedTrainId);
        if (mounted && singleRes.telemetry) {
          setTelemetry(singleRes.telemetry);
        }
      } catch (_e) {}
    };
    load();
    const timer = setInterval(load, 4000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [selectedTrainId]);

  const activeTelemetry = telemetry || FALLBACK_TELEMETRY;
  const lat = Number(activeTelemetry.lat || 6.9271);
  const lng = Number(activeTelemetry.lng || 80.5885);
  const googleEmbedType = mapLayer === 'GOOGLE_STREETS' ? 'm' : mapLayer === 'GOOGLE_TERRAIN' ? 'p' : 'k';

  return (
    <div className="bg-slate-950 text-white rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
      {/* Header & Layer Switcher */}
      <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
            <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <h2 className="font-bold text-base">GIS Railway Telemetry & Google Maps Radar</h2>
            <p className="text-xs text-amber-300 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>
                {activeTelemetry.telemetry_notice ||
                  'Schedule-interpolated simulation (no hardware GPS transponder attached).'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedTrainId}
            onChange={(e) => setSelectedTrainId(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
          >
            {fleet.map((tr) => (
              <option key={tr.train_id} value={tr.train_id}>
                #{tr.train_number} {tr.train_name} ({tr.progress_pct}%)
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs">
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <select
              value={mapLayer}
              onChange={(e) => setMapLayer(e.target.value)}
              className="bg-transparent text-white font-medium focus:outline-none"
            >
              {Object.entries(MAP_TILE_LAYERS).map(([key, cfg]) => (
                <option key={key} value={key} className="bg-slate-900">
                  {cfg.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2 p-6 bg-slate-900/50 flex flex-col justify-between min-h-[460px] space-y-4">
          {/* Interactive Google Maps / Satellite Live Viewport */}
          <div className="relative w-full h-72 sm:h-80 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-inner">
            <iframe
              title="Ceylon Rail Google Maps Live Radar"
              className="w-full h-full border-0"
              loading="lazy"
              src={`https://maps.google.com/maps?q=${lat},${lng}&t=${googleEmbedType}&z=11&output=embed`}
            />
            <div className="absolute top-3 left-3 bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-emerald-500/40 text-xs font-bold flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span>
                #{activeTelemetry.train_number} {activeTelemetry.train_name} — {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-emerald-400" /> Speed
              </div>
              <div className="text-lg font-bold mt-0.5">{activeTelemetry.speed_kmh} km/h</div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <Mountain className="w-3.5 h-3.5 text-amber-400" /> Elevation
              </div>
              <div className="text-lg font-bold mt-0.5">{activeTelemetry.elevation_m} m</div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <Navigation className="w-3.5 h-3.5 text-sky-400" /> Coordinates
              </div>
              <div className="text-sm font-mono font-semibold mt-1">
                {lat.toFixed(4)}, {lng.toFixed(4)}
              </div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-purple-400" /> Next Stop
              </div>
              <div className="text-sm font-bold mt-0.5 truncate">
                {activeTelemetry.next_station?.name || 'Nanu Oya'}
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex justify-between text-xs text-slate-300 mb-1.5">
              <span>
                Journey Progress ({activeTelemetry.covered_distance_km} / {activeTelemetry.total_distance_km} km)
              </span>
              <span className="font-bold text-emerald-400">{activeTelemetry.progress_pct}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-all duration-500"
                style={{ width: `${activeTelemetry.progress_pct}%` }}
              />
            </div>
            <div className="mt-2 text-[11px] text-slate-400 flex justify-between">
              <span>Active Tile Source: {MAP_TILE_LAYERS[mapLayer].name}</span>
              <span>Telemetry Mode: {activeTelemetry.telemetry_source}</span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-900 border-l border-slate-800 max-h-[520px] overflow-y-auto">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
            Ordered Route Stops Timeline
          </h3>
          <div className="space-y-2.5">
            {activeTelemetry.stops?.map((stop) => (
              <div
                key={stop.stop_order}
                className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                  stop.timeline_status === 'ACTIVE'
                    ? 'bg-emerald-950/60 border-emerald-500/60 text-white'
                    : stop.timeline_status === 'COMPLETED'
                    ? 'bg-slate-800/40 border-slate-800 text-slate-400'
                    : 'bg-slate-900 border-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-amber-400" />
                  <div>
                    <div className="font-semibold">
                      #{stop.stop_order} {stop.station_name} ({stop.station_code})
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {stop.distance_from_origin_km} km • Elev {stop.elevation_m}m • Plat {stop.platform}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-semibold">{stop.departure_time}</div>
                  <div className="text-[10px] uppercase">{stop.timeline_status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
