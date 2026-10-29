import React, { useState } from 'react';
import {
  Calendar, Ticket, CheckCircle2, XCircle, Radio, Eye,
  Trash2, Search, ShieldCheck, AlertCircle
} from 'lucide-react';
import { api } from '../services/api.js';

export default function PassengerDashboard({
  user,
  bookings = [],
  onViewTicket,
  onTrackTrain,
  onCancelBooking
}) {
  // Guest Booking Lookup state
  const [lookupPnr, setLookupPnr] = useState('');
  const [lookupVerification, setLookupVerification] = useState('');
  const [lookedUpBooking, setLookedUpBooking] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [lookupMessage, setLookupMessage] = useState('');
  const [lookingUp, setLookingUp] = useState(false);

  const upcomingCount = bookings.filter((b) => b.status === 'CONFIRMED').length;
  const completedCount = bookings.filter((b) => b.status === 'COMPLETED').length;
  const cancelledCount = bookings.filter((b) => b.status === 'CANCELLED').length;

  const handleGuestLookup = async (e) => {
    e.preventDefault();
    setLookupError('');
    setLookupMessage('');
    setLookingUp(true);
    try {
      const res = await api.lookupBooking(lookupPnr.trim(), lookupVerification.trim());
      setLookedUpBooking(res.booking);
    } catch (err) {
      setLookedUpBooking(null);
      setLookupError(err.message || 'Could not verify booking with the provided details.');
    } finally {
      setLookingUp(false);
    }
  };

  const handleCancelLookedUpBooking = async () => {
    if (!lookedUpBooking) return;
    setLookupError('');
    try {
      const res = await api.cancelBooking(
        lookedUpBooking.pnr,
        'Cancelled by passenger via Booking Lookup',
        false,
        lookupVerification.trim()
      );
      setLookedUpBooking(res.booking);
      setLookupMessage(
        res.refund
          ? `Booking ${res.booking.pnr} has been cancelled. Refund of LKR ${Number(res.refund.amount_lkr).toLocaleString()} (${res.refund.refund_reference}) processed.`
          : `Booking ${res.booking.pnr} has been cancelled.`
      );
    } catch (err) {
      setLookupError(err.message || 'Cancellation failed.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Guest & Passenger Booking Lookup Section (Always Accessible Without Login) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-700 mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Secure Booking Lookup & Ticket Retrieval (No Login Required)
            </div>
            <h2 className="text-xl font-extrabold text-slate-900">
              Retrieve, Print, or Cancel Your Booking by PNR
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Enter your Booking Reference (PNR) along with the Contact Phone, Email, or NIC/Passport used during booking.
            </p>
          </div>
        </div>

        <form onSubmit={handleGuestLookup} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Booking Reference (PNR) *
            </label>
            <input
              type="text"
              required
              value={lookupPnr}
              onChange={(e) => setLookupPnr(e.target.value)}
              placeholder="e.g. SLR-..."
              className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono uppercase"
            />
          </div>
          <div className="sm:col-span-5">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Registered Phone, Email, or NIC/Passport *
            </label>
            <input
              type="text"
              required
              value={lookupVerification}
              onChange={(e) => setLookupVerification(e.target.value)}
              placeholder="Enter phone, email, or NIC/Passport"
              className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
            />
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={lookingUp}
              className="w-full py-2.5 px-4 rounded-xl bg-[#FF6B4A] hover:bg-[#FF5722] text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Search className="w-4 h-4" />
              <span>{lookingUp ? 'Verifying...' : 'Retrieve Ticket'}</span>
            </button>
          </div>
        </form>

        {lookupError && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{lookupError}</span>
          </div>
        )}

        {lookupMessage && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{lookupMessage}</span>
          </div>
        )}

        {lookedUpBooking && (
          <div className="p-5 rounded-2xl bg-slate-50 border border-indigo-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs font-mono font-bold text-indigo-800">
                  PNR: {lookedUpBooking.pnr}
                </span>
                <h3 className="text-lg font-extrabold text-slate-900">
                  #{lookedUpBooking.train_number} {lookedUpBooking.train_name} — {lookedUpBooking.from_station_name} → {lookedUpBooking.to_station_name}
                </h3>
                <p className="text-xs text-slate-600">
                  Travel Date: <strong>{lookedUpBooking.travel_date}</strong> • Coach {lookedUpBooking.carriage_code} ({lookedUpBooking.class_name}) • Seats: <strong>{lookedUpBooking.seats_csv}</strong>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  lookedUpBooking.status === 'CONFIRMED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}>
                  {lookedUpBooking.status} ({lookedUpBooking.payment_status})
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 text-xs">
              <div>
                <span className="text-slate-600">Passenger: </span>
                <strong className="text-slate-900">{lookedUpBooking.passenger_name}</strong>
                <span className="mx-2">•</span>
                <span className="text-slate-600">Total Paid: </span>
                <strong className="text-emerald-700">LKR {Number(lookedUpBooking.total_amount_lkr).toLocaleString()}</strong>
                {lookedUpBooking.refunds?.length > 0 && (
                  <span className="ml-2 text-rose-700 font-bold">
                    (Refunded: LKR {Number(lookedUpBooking.refunds[0].amount_lkr).toLocaleString()})
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onViewTicket && onViewTicket(lookedUpBooking)}
                  className="px-3.5 py-2 rounded-xl bg-indigo-900 text-white font-bold flex items-center gap-1.5 hover:bg-indigo-800"
                >
                  <Eye className="w-3.5 h-3.5" /> View / Print E-Ticket
                </button>
                <button
                  type="button"
                  onClick={() => onTrackTrain && onTrackTrain(lookedUpBooking.train_id)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white font-bold flex items-center gap-1.5 hover:bg-emerald-700"
                >
                  <Radio className="w-3.5 h-3.5" /> Track Train
                </button>
                {lookedUpBooking.status === 'CONFIRMED' && (
                  <button
                    type="button"
                    onClick={handleCancelLookedUpBooking}
                    className="px-3.5 py-2 rounded-xl bg-rose-600 text-white font-bold flex items-center gap-1.5 hover:bg-rose-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Cancel Eligible Booking
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Session / Account Bookings List */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <aside className="bg-[#1E1E38] text-white rounded-2xl p-6 space-y-6">
          <div>
            <div className="text-xs uppercase tracking-wider text-amber-400 font-bold">Passenger Portal</div>
            <h2 className="text-xl font-bold mt-1">{user ? user.full_name : 'Guest Passenger Session'}</h2>
            <p className="text-xs text-slate-300 mt-0.5">
              {user ? user.email : 'Bookings made in this browser session or retrieved via PNR lookup appear here.'}
            </p>
            {user?.nic_passport && (
              <div className="text-xs text-slate-400 mt-1">NIC / Passport: {user.nic_passport}</div>
            )}
          </div>
          <div className="border-t border-white/10 pt-4 space-y-2 text-xs text-slate-300">
            <div className="flex justify-between">
              <span>Booking Mode:</span>
              <span className="font-bold text-emerald-400">{user ? 'Registered Account' : 'Guest Booking'}</span>
            </div>
            <div className="flex justify-between">
              <span>Session Reservations:</span>
              <span className="font-bold text-white">{bookings.length}</span>
            </div>
          </div>
        </aside>

        <div className="lg:col-span-3 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" /> Confirmed Journeys
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{upcomingCount}</div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Completed
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{completedCount}</div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5 text-rose-600" /> Cancelled
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{cancelledCount}</div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 flex items-center gap-1">
                <Ticket className="w-3.5 h-3.5 text-amber-600" /> Total Tickets
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{bookings.length}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-lg text-slate-900">Recent Reservations & Refunds</h3>
            {bookings.length === 0 ? (
              <p className="text-xs text-slate-500">
                No reservations in your active session yet. Use the PNR Lookup panel above to retrieve any existing ticket, or search for a train to book as a guest.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 uppercase">
                    <tr>
                      <th className="p-3">PNR</th>
                      <th className="p-3">Train & Route</th>
                      <th className="p-3">Date & Coach</th>
                      <th className="p-3">Total Paid</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {bookings.map((b) => (
                      <tr key={b.id || b.pnr}>
                        <td className="p-3 font-mono font-bold text-slate-900">{b.pnr}</td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900">#{b.train_number} {b.train_name}</div>
                          <div className="text-slate-500">{b.from_station_name} → {b.to_station_name} ({b.distance_km} km)</div>
                        </td>
                        <td className="p-3">
                          <div>{b.travel_date}</div>
                          <div className="text-slate-500">Coach {b.carriage_code} • Seats: {b.seats_csv}</div>
                        </td>
                        <td className="p-3 font-bold text-slate-900">
                          LKR {Number(b.total_amount_lkr).toLocaleString()}
                          {b.refunds?.length > 0 && (
                            <div className="text-[11px] text-emerald-700 font-semibold">
                              Refunded: LKR {Number(b.refunds[0].amount_lkr).toLocaleString()}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            b.status === 'CONFIRMED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : b.status === 'CANCELLED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {b.status}
                          </span>
                        </td>
                        <td className="p-3 flex flex-wrap gap-1.5">
                          <button
                            onClick={() => onViewTicket && onViewTicket(b)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-semibold flex items-center gap-1 hover:bg-indigo-100"
                          >
                            <Eye className="w-3.5 h-3.5" /> E-Ticket
                          </button>
                          <button
                            onClick={() => onTrackTrain && onTrackTrain(b.train_id)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold flex items-center gap-1 hover:bg-emerald-100"
                          >
                            <Radio className="w-3.5 h-3.5" /> Track Live
                          </button>
                          {b.status === 'CONFIRMED' && onCancelBooking && (
                            <button
                              onClick={() => onCancelBooking(b.pnr, b.contact_phone || b.contact_email || b.passenger_nic)}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 font-semibold flex items-center gap-1 hover:bg-rose-100"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Cancel & Refund
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
