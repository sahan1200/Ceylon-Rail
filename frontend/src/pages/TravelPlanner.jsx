import React, { useState, useEffect } from 'react';
import {
  Compass, MapPin, Train, Calendar, Plus, Trash2,
  Clock, Sparkles, Mountain, ArrowRight
} from 'lucide-react';
import { api } from '../services/api.js';

export default function TravelPlanner({ user, onSelectTrainFromPlanner, onOpenAuth }) {
  const [destinations, setDestinations] = useState([]);
  const [scenicRoutes, setScenicRoutes] = useState([]);
  const [itineraries, setItineraries] = useState([]);
  const [selectedDest, setSelectedDest] = useState(null);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [companionType, setCompanionType] = useState('COUPLE');
  const [dayTitle, setDayTitle] = useState('Day 1 — Highland Express & Nine Arch Bridge');
  const [estimatedCostLkr, setEstimatedCostLkr] = useState(6500);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    api.getDestinations().then((res) => {
      setDestinations(res.destinations || []);
      setScenicRoutes(res.scenic_routes || []);
      if (res.destinations?.length > 0) setSelectedDest(res.destinations[0]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      api.getMyItineraries().then((res) => setItineraries(res.itineraries || [])).catch(() => {});
    } else {
      setItineraries([]);
    }
  }, [user]);

  const handleSaveItinerary = async (e) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth && onOpenAuth();
      return;
    }
    try {
      const res = await api.createItinerary({
        title: title || `${selectedDest?.name || 'Sri Lanka'} Rail Itinerary`,
        start_date: startDate || new Date().toISOString().slice(0, 10),
        companion_type: companionType,
        days: [
          {
            day_number: 1,
            travel_date: startDate || new Date().toISOString().slice(0, 10),
            title: dayTitle,
            destination_id: selectedDest?.id,
            items: [
              {
                item_type: 'TRAIN_JOURNEY',
                title: selectedDest?.recommended_trains?.[0]
                  ? `${selectedDest.recommended_trains[0].train_number} ${selectedDest.recommended_trains[0].name}`
                  : 'Scenic Express Train Journey',
                train_id: selectedDest?.recommended_trains?.[0]?.id,
                estimated_cost_lkr: Number(estimatedCostLkr) || 3500
              },
              ...(selectedDest?.attractions || []).slice(0, 2).map((att) => ({
                item_type: 'ATTRACTION',
                title: att.name,
                attraction_id: att.id,
                estimated_cost_lkr: att.entry_fee_lkr || 0
              }))
            ]
          }
        ]
      });
      setItineraries([res.itinerary, ...itineraries]);
      setTitle('');
      setStatusMsg('Itinerary saved to your passenger account.');
    } catch (err) {
      setStatusMsg(err.message);
    }
  };

  const handleDeleteItinerary = async (id) => {
    try {
      await api.deleteItinerary(id);
      setItineraries(itineraries.filter((i) => i.id !== id));
    } catch (_e) {}
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 sm:p-8 border border-indigo-500/30 shadow-xl">
        <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
          <Compass className="w-4 h-4" />
          <span>Smart Railway Travel Planner • Browse Without Login</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold">
          Explore Sri Lanka by Rail — Verified Destinations, Station Links & Suggested Itineraries
        </h1>
        <p className="text-slate-300 text-sm mt-2 max-w-3xl">
          Every destination is backed by real Sri Lanka Railways stations, verified transfer distances, attractions with images, and direct connecting trains.
        </p>
      </div>

      {/* Destinations Grid & Detailed View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 space-y-3">
          <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wider">
            Select Destination ({destinations.length})
          </h2>
          {destinations.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedDest(d)}
              className={`w-full text-left rounded-2xl overflow-hidden border transition flex items-center gap-3 p-2.5 ${
                selectedDest?.id === d.id
                  ? 'bg-indigo-950 text-white border-indigo-600 shadow-lg'
                  : 'bg-white text-slate-800 border-slate-200 hover:border-indigo-400'
              }`}
            >
              <img
                src={d.hero_image_url || '/images/route_highland.jpg'}
                alt={d.name}
                className="w-20 h-20 rounded-xl object-cover shrink-0 border border-white/10"
              />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-1">
                  <div className="font-bold text-sm truncate">{d.name}</div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold shrink-0">
                    {d.nearest_station?.station_code}
                  </span>
                </div>
                <div className={`text-[11px] line-clamp-2 mt-1 ${selectedDest?.id === d.id ? 'text-slate-300' : 'text-slate-500'}`}>
                  {d.summary}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Selected Destination Detail */}
        {selectedDest && (
          <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm space-y-6">
            {/* Hero Image Header */}
            <div className="relative h-64 sm:h-72 bg-slate-900">
              <img
                src={selectedDest.hero_image_url || '/images/route_highland.jpg'}
                alt={selectedDest.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent" />
              <div className="absolute bottom-4 left-6 right-6 text-white flex flex-wrap justify-between items-end gap-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    {selectedDest.region} • {selectedDest.category} • Best Season: {selectedDest.best_season || 'Year-round'}
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold mt-0.5">{selectedDest.name}</h2>
                </div>
                {selectedDest.nearest_station && (
                  <div className="bg-slate-900/90 backdrop-blur-md border border-amber-400/40 rounded-xl p-3 text-xs">
                    <div className="font-bold text-amber-300 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      Station: {selectedDest.nearest_station.station_name} ({selectedDest.nearest_station.station_code})
                    </div>
                    <div className="text-slate-200 mt-0.5">
                      {selectedDest.nearest_station.distance_km} km ({selectedDest.nearest_station.travel_time_mins} mins via {selectedDest.nearest_station.transport_mode}) • Est. LKR {selectedDest.nearest_station.estimated_transfer_fare_lkr}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 pt-0 space-y-6">
              <p className="text-sm text-slate-700 leading-relaxed">{selectedDest.description}</p>

              {/* Tourist Attractions with Images */}
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Verified Tourist Attractions & Station Distances
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {selectedDest.attractions?.map((att) => (
                    <div key={att.id} className="rounded-xl bg-slate-50 border border-slate-200 overflow-hidden flex flex-col">
                      <div className="h-36 bg-slate-900 overflow-hidden">
                        <img
                          src={att.image_url || selectedDest.hero_image_url || '/images/route_highland.jpg'}
                          alt={att.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-3.5 text-xs space-y-1 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{att.name}</div>
                          <div className="text-indigo-600 font-semibold">
                            {att.category} • {att.distance_from_station_km} km from station
                          </div>
                          <p className="text-slate-600 mt-1">{att.description}</p>
                        </div>
                        <div className="text-slate-500 pt-2 border-t border-slate-200/80 mt-2 flex justify-between items-center">
                          <span><Clock className="w-3 h-3 inline mr-1" />{att.opening_hours}</span>
                          <span className="font-bold text-slate-800">
                            {att.entry_fee_lkr > 0 ? `LKR ${att.entry_fee_lkr}` : 'Free Entry'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Suggested Itinerary based on Verified Information */}
              {Array.isArray(selectedDest.suggested_itinerary) && selectedDest.suggested_itinerary.length > 0 && (
                <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-indigo-700" />
                    Suggested {selectedDest.recommended_days || 2}-Day Railway Itinerary for {selectedDest.name}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedDest.suggested_itinerary.map((dayPlan) => (
                      <div key={dayPlan.day} className="bg-white p-3.5 rounded-xl border border-indigo-100 text-xs space-y-1.5">
                        <div className="font-bold text-indigo-900">
                          Day {dayPlan.day}: {dayPlan.title}
                        </div>
                        <ul className="list-disc list-inside text-slate-600 space-y-1">
                          {(dayPlan.activities || []).map((act, idx) => (
                            <li key={idx}>{act}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Direct Connecting Trains */}
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-1.5">
                  <Train className="w-4 h-4 text-indigo-600" />
                  Relevant Train Routes Serving {selectedDest.nearest_station?.station_name || selectedDest.name}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedDest.recommended_trains?.map((tr) => (
                    <div key={tr.id} className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between bg-slate-50/60">
                      <div>
                        <div className="font-bold text-sm text-slate-900">#{tr.train_number} {tr.name}</div>
                        <div className="text-xs text-slate-500">
                          {tr.route_name} • Arrives Station: {tr.station_arrival_time || tr.arrival_time}
                        </div>
                      </div>
                      {onSelectTrainFromPlanner && (
                        <button
                          onClick={() => onSelectTrainFromPlanner(tr.id, selectedDest.nearest_station?.station_code)}
                          className="px-3 py-1.5 rounded-lg bg-[#FF6B4A] text-white text-xs font-bold hover:opacity-95 shrink-0"
                        >
                          Book Seats
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Scenic Railway Routes Section */}
      {scenicRoutes.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-600">
            <Mountain className="w-4 h-4" />
            <span>Scenic Railway Routes Across Sri Lanka</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {scenicRoutes.map((sr) => (
              <div key={sr.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                <div className="h-44 bg-slate-900 relative overflow-hidden">
                  <img
                    src={sr.image_url || '/images/route_highland.jpg'}
                    alt={sr.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                  <div className="absolute bottom-2.5 left-3 right-3 text-white text-xs font-bold flex justify-between">
                    <span>{sr.origin_code} → {sr.dest_code}</span>
                    <span className="text-amber-300">{sr.distance_km} km • Max {sr.max_elevation_m}m</span>
                  </div>
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{sr.name}</h3>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-3">{sr.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(sr.highlights || []).map((h, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold">
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save Multi-Day Itinerary Form & Saved Itineraries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handleSaveItinerary} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            Save Custom Multi-Day Rail Itinerary
          </h3>
          {statusMsg && (
            <div className="p-3 rounded-lg bg-indigo-50 text-indigo-900 text-xs font-medium border border-indigo-200">
              {statusMsg}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Itinerary Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Highland Tea & Ella Odyssey"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Day 1 Plan Title</label>
              <input
                type="text"
                value={dayTitle}
                onChange={(e) => setDayTitle(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Estimated Budget (LKR)</label>
              <input
                type="number"
                value={estimatedCostLkr}
                onChange={(e) => setEstimatedCostLkr(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" />
            Save Itinerary
          </button>
        </form>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h3 className="font-bold text-lg text-slate-900">
            My Saved Rail Itineraries ({itineraries.length})
          </h3>
          {itineraries.length === 0 ? (
            <p className="text-xs text-slate-500">
              {user
                ? 'You have no saved itineraries yet. Use the planner on the left to build and save a custom rail trip.'
                : 'You can browse all destinations, attractions, and suggested itineraries above without logging in. Sign in if you wish to save custom itineraries to a personal account.'}
            </p>
          ) : (
            <div className="space-y-3">
              {itineraries.map((it) => (
                <div key={it.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex justify-between items-start">
                  <div>
                    <div className="font-bold text-sm text-slate-900">{it.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {it.start_date || 'Flexible Date'} • {it.total_days} Day(s) • Est. Budget LKR {(it.estimated_budget_cents / 100).toLocaleString()}
                    </div>
                    {it.days?.map((d) => (
                      <div key={d.id} className="mt-2 text-xs text-slate-700">
                        <span className="font-semibold">{d.title}:</span>{' '}
                        {d.items?.map((item) => item.title).join(' → ')}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => handleDeleteItinerary(it.id)}
                    className="text-rose-500 hover:text-rose-700 p-1"
                    title="Delete Itinerary"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
