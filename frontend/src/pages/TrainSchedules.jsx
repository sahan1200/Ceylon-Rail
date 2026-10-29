import React, { useState } from 'react';
import { Train, Clock, ArrowRight, Filter } from 'lucide-react';

export default function TrainSchedules({
  trains = [],
  stations = [],
  searchFilters = {},
  onSearch,
  onSelectTrain
}) {
  const [fromCode, setFromCode] = useState(searchFilters.from || 'FOT');
  const [toCode, setToCode] = useState(searchFilters.to || 'ELL');
  const [date, setDate] = useState(searchFilters.date || new Date().toISOString().slice(0, 10));
  const [timeSlot, setTimeSlot] = useState('ALL');
  const [classFilter, setClassFilter] = useState('ALL');

  const filteredTrains = trains.filter((t) => {
    if (classFilter !== 'ALL' && !String(t.classes_available).toLowerCase().includes(classFilter.toLowerCase())) {
      return false;
    }
    if (timeSlot !== 'ALL') {
      const hour = parseInt(String(t.segment_departure_time || t.departure_time).split(':')[0], 10);
      if (timeSlot === 'MORNING' && (hour < 4 || hour >= 12)) return false;
      if (timeSlot === 'AFTERNOON' && (hour < 12 || hour >= 17)) return false;
      if (timeSlot === 'EVENING' && hour < 17 && hour >= 4) return false;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Search & Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">From Station</label>
            <select
              value={fromCode}
              onChange={(e) => setFromCode(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold"
            >
              {stations.map((s) => (
                <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">To Station</label>
            <select
              value={toCode}
              onChange={(e) => setToCode(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold"
            >
              {stations.map((s) => (
                <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Travel Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => onSearch && onSearch({ from: fromCode, to: toCode, date })}
              className="w-full py-2 px-4 rounded-xl bg-[#FF6B4A] text-white text-xs font-bold hover:opacity-95"
            >
              Search Route
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            {['ALL', 'MORNING', 'AFTERNOON', 'EVENING'].map((slot) => (
              <button
                key={slot}
                onClick={() => setTimeSlot(slot)}
                className={`px-3 py-1 rounded-lg font-semibold ${
                  timeSlot === slot ? 'bg-[#1E1E38] text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {slot}
              </button>
            ))}
          </div>

          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1 text-xs font-semibold"
          >
            <option value="ALL">All Travel Classes</option>
            <option value="1st Class Observation">1st Class Observation</option>
            <option value="1st Class Air Conditioned">1st Class Air Conditioned</option>
            <option value="2nd Class Reserved">2nd Class Reserved</option>
            <option value="3rd Class Reserved">3rd Class Reserved</option>
          </select>
        </div>
      </div>

      {/* Train Results */}
      <div className="space-y-4">
        {filteredTrains.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-600">
            No scheduled trains match the selected origin, destination, and time filters. Note that stations are validated in travel direction order.
          </div>
        ) : (
          filteredTrains.map((t) => (
            <div
              key={t.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded bg-[#1E1E38] text-white font-mono text-xs font-bold">
                    #{t.train_number}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                    {t.occupancy_status || 'Available'} ({t.available_seats} seats)
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mt-1">{t.name}</h3>
                <p className="text-xs text-slate-500">{t.type} • {t.route_name}</p>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-lg font-bold text-slate-900">
                    {t.segment_departure_time || t.departure_time}
                  </div>
                  <div className="text-xs text-slate-500">{t.segment_from_name || t.origin_name}</div>
                </div>
                <div className="text-center px-3">
                  <div className="text-[11px] font-semibold text-indigo-600 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {t.segment_duration_mins || t.duration_mins} mins • {t.segment_distance_km || 0} km
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 mx-auto my-0.5" />
                </div>
                <div>
                  <div className="text-lg font-bold text-slate-900">
                    {t.segment_arrival_time || t.arrival_time}
                  </div>
                  <div className="text-xs text-slate-500">{t.segment_to_name || t.dest_name}</div>
                </div>
              </div>

              <div className="flex items-center justify-between lg:justify-end gap-3">
                <button
                  onClick={() => onSelectTrain && onSelectTrain(t)}
                  className="px-4 py-2.5 rounded-xl bg-[#FF6B4A] text-white text-xs font-bold flex items-center gap-1.5 hover:opacity-95"
                >
                  <Train className="w-4 h-4" />
                  Select Seats & Book
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
