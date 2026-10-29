import React, { useState, useEffect, useCallback } from 'react';
import {
  Train, CheckCircle2, Lock, User, CreditCard, ArrowLeft,
  ChevronRight, AlertCircle, ShieldCheck, RefreshCw, FileText,
  Printer, Eye
} from 'lucide-react';
import { api } from '../services/api.js';

export default function CarriageSeatMap({
  train,
  selectedTrain,
  travelDate,
  fromStation,
  toStation,
  user,
  onBookingComplete,
  onViewTicket,
  onBack
}) {
  const activeTrain = train || selectedTrain || {
    id: 1,
    train_id: 1,
    train_number: '1005',
    name: 'Podi Menike',
    train_name: 'Podi Menike',
    departure_time: '05:55',
    arrival_time: '16:10',
    from_station_name: 'Colombo Fort',
    to_station_name: 'Ella',
    carriages: [
      { id: 1, carriage_code: 'C1', class_name: '1st Class Observation', total_seats: 40 },
      { id: 2, carriage_code: 'C2', class_name: '1st Class Air Conditioned', total_seats: 44 },
      { id: 3, carriage_code: 'C3', class_name: '2nd Class Reserved', total_seats: 48 },
      { id: 4, carriage_code: 'C4', class_name: '3rd Class Reserved', total_seats: 56 }
    ]
  };

  const trainId = activeTrain.id || activeTrain.train_id || 1;
  const trainDisplayName = activeTrain.name || activeTrain.train_name || 'Podi Menike';
  const effectiveDate = travelDate || new Date().toISOString().slice(0, 10);
  const fromStationCode =
    typeof fromStation === 'object' ? (fromStation?.code || fromStation?.id || 'FOT') : (fromStation || 'FOT');
  const toStationCode =
    typeof toStation === 'object' ? (toStation?.code || toStation?.id || 'ELL') : (toStation || 'ELL');

  const carriages = Array.isArray(activeTrain.carriages) && activeTrain.carriages.length > 0
    ? activeTrain.carriages
    : [
        { id: 1, carriage_code: 'C1', class_name: '1st Class Observation', total_seats: 40 },
        { id: 2, carriage_code: 'C2', class_name: '1st Class Air Conditioned', total_seats: 44 },
        { id: 3, carriage_code: 'C3', class_name: '2nd Class Reserved', total_seats: 48 },
        { id: 4, carriage_code: 'C4', class_name: '3rd Class Reserved', total_seats: 56 }
      ];

  const [selectedCarriage, setSelectedCarriage] = useState(carriages[0]);
  const [seats, setSeats] = useState([]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [fareBreakdown, setFareBreakdown] = useState(null);

  // Step-by-step state: 'seats' (Step 3) -> 'passengers' (Step 4) -> 'review' (Step 5) -> 'payment' (Step 6) -> 'confirmation' (Step 7)
  const [step, setStep] = useState('seats');
  const [loading, setLoading] = useState(false);
  const [locking, setLocking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lockExpiresAt, setLockExpiresAt] = useState(null);
  const [error, setError] = useState('');

  // Passenger details & contact info (supports both Guest and Logged-In Passengers)
  const [passengers, setPassengers] = useState([]);
  const [contactEmail, setContactEmail] = useState(user?.email || '');
  const [contactPhone, setContactPhone] = useState(user?.phone || '');
  const [paymentMethod, setPaymentMethod] = useState('CARD');
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [cardHolder, setCardHolder] = useState(user?.full_name || '');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvv, setCardCvv] = useState('123');
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  useEffect(() => {
    if (user) {
      if (!contactEmail && user.email) setContactEmail(user.email);
      if (!contactPhone && user.phone) setContactPhone(user.phone);
      if (!cardHolder && user.full_name) setCardHolder(user.full_name);
    }
  }, [user]);

  const generateFallbackSeats = useCallback((carriage) => {
    const total = carriage?.total_seats || 40;
    const rows = Math.ceil(total / 4);
    const list = [];
    for (let r = 1; r <= rows; r++) {
      ['A', 'B', 'C', 'D'].forEach((col, cIdx) => {
        if (list.length < total) {
          const num = `${r}${col}`;
          list.push({
            id: (carriage?.id || 1) * 100 + list.length + 1,
            seat_number: num,
            row_number: r,
            col_letter: col,
            seat_type: cIdx === 0 || cIdx === 3 ? 'WINDOW' : 'AISLE',
            status: 'AVAILABLE'
          });
        }
      });
    }
    return list;
  }, []);

  const loadSeatMapAndFare = useCallback(async (carriage, customPassengers = null) => {
    if (!carriage) return;
    setLoading(true);
    setError('');
    try {
      const paxPayload =
        Array.isArray(customPassengers) && customPassengers.length > 0
          ? customPassengers
          : selectedSeats.length > 0
          ? selectedSeats.map(() => ({ passenger_type: 'ADULT' }))
          : [{ passenger_type: 'ADULT' }];

      const [seatRes, fareRes] = await Promise.all([
        api.getSeatMap(
          trainId,
          carriage.carriage_code,
          effectiveDate,
          fromStationCode,
          toStationCode
        ),
        api.calculateFare({
          train_id: trainId,
          class_name: carriage.class_name,
          from_station: fromStationCode,
          to_station: toStationCode,
          passengers: paxPayload
        })
      ]);

      const rawSeats = seatRes?.seats || [];
      const reservations = seatRes?.reservations || [];
      const reservedMap = new Map();
      for (const r of reservations) {
        reservedMap.set(String(r.seat_number).toUpperCase(), r.status);
      }

      const mergedSeats =
        rawSeats.length > 0
          ? rawSeats.map((s) => ({
              ...s,
              seat_type: s.is_window ? 'WINDOW' : 'AISLE',
              status: reservedMap.get(String(s.seat_number).toUpperCase()) || 'AVAILABLE'
            }))
          : generateFallbackSeats(carriage);

      setSeats(mergedSeats);
      setFareBreakdown(fareRes?.fare || null);
    } catch (_err) {
      setSeats(generateFallbackSeats(carriage));
    } finally {
      setLoading(false);
    }
  }, [trainId, effectiveDate, fromStationCode, toStationCode, generateFallbackSeats]);

  useEffect(() => {
    loadSeatMapAndFare(selectedCarriage);
  }, [selectedCarriage, loadSeatMapAndFare]);

  const handleCarriageChange = (carriage) => {
    setSelectedCarriage(carriage);
    setSelectedSeats([]);
    setStep('seats');
  };

  const toggleSeat = (seat) => {
    const status = String(seat.status || 'AVAILABLE').toUpperCase();
    if (status === 'BOOKED' || status === 'LOCKED') return;
    setError('');
    const exists = selectedSeats.some((s) => s.seat_number === seat.seat_number);
    if (exists) {
      setSelectedSeats(selectedSeats.filter((s) => s.seat_number !== seat.seat_number));
    } else {
      if (selectedSeats.length >= 6) {
        setError('Maximum 6 seats allowed per reservation.');
        return;
      }
      setSelectedSeats([...selectedSeats, seat]);
    }
  };

  // Server-backed unit fare calculation
  const unitAdultLkr =
    fareBreakdown?.adult_unit_fare_lkr ||
    (selectedCarriage?.class_name?.includes('Observation')
      ? 3500
      : selectedCarriage?.class_name?.includes('Air Conditioned')
      ? 2800
      : selectedCarriage?.class_name?.includes('2nd')
      ? 1600
      : 900);

  const subTotal =
    fareBreakdown && passengers.length === selectedSeats.length
      ? Number((fareBreakdown.subtotal_cents / 100).toFixed(2))
      : selectedSeats.length * unitAdultLkr;
  const totalFee =
    fareBreakdown && passengers.length === selectedSeats.length
      ? Number((fareBreakdown.reservation_fee_cents / 100).toFixed(2))
      : selectedSeats.length * 150;
  const totalTax =
    fareBreakdown && passengers.length === selectedSeats.length
      ? Number((fareBreakdown.tax_cents / 100).toFixed(2))
      : 0;
  const grandTotal =
    fareBreakdown && passengers.length === selectedSeats.length
      ? fareBreakdown.total_amount_lkr
      : subTotal + totalFee + totalTax;

  // Step 3 -> Step 4: Lock seats without requiring login
  const handleProceedToPassengers = async () => {
    if (selectedSeats.length === 0) {
      setError('Please select at least 1 available seat on the carriage diagram.');
      return;
    }

    setLocking(true);
    setError('');
    try {
      const lockRes = await api.lockSeats({
        train_id: trainId,
        carriage_code: selectedCarriage.carriage_code,
        travel_date: effectiveDate,
        from_station: fromStationCode,
        to_station: toStationCode,
        seats: selectedSeats.map((s) => s.seat_number)
      });
      setLockExpiresAt(lockRes?.lock?.expires_at || new Date(Date.now() + 10 * 60000).toISOString());
    } catch (err) {
      setError(err.message || 'Unable to lock selected seats. Another passenger may have just reserved them.');
      loadSeatMapAndFare(selectedCarriage);
      setLocking(false);
      return;
    }
    setLocking(false);

    const initialPax = selectedSeats.map((seat, idx) => ({
      seat_id: seat.id,
      seat_number: seat.seat_number,
      full_name: idx === 0 ? (user?.full_name || '') : '',
      nic_passport: idx === 0 ? (user?.nic_passport || '') : '',
      passenger_type: 'ADULT',
      age: 30
    }));
    setPassengers(initialPax);
    setStep('passengers');
  };

  // Step 4 -> Step 5: Validate passenger details & recalculate server fare
  const handleProceedToReview = async (e) => {
    e.preventDefault();
    setError('');

    for (let i = 0; i < passengers.length; i++) {
      if (!passengers[i].full_name || !passengers[i].full_name.trim()) {
        setError(`Please enter the full name for Passenger #${i + 1} (Seat ${passengers[i].seat_number}).`);
        return;
      }
    }

    if (!contactPhone.trim() && !contactEmail.trim() && !passengers[0]?.nic_passport?.trim()) {
      setError('Please provide a contact phone number, email address, or NIC/Passport number so you can retrieve your ticket.');
      return;
    }

    setLoading(true);
    try {
      const fareRes = await api.calculateFare({
        train_id: trainId,
        class_name: selectedCarriage.class_name,
        from_station: fromStationCode,
        to_station: toStationCode,
        passengers
      });
      if (fareRes?.fare) {
        setFareBreakdown(fareRes.fare);
      }
      if (!cardHolder && passengers[0]?.full_name) {
        setCardHolder(passengers[0].full_name);
      }
      setStep('review');
    } catch (err) {
      setError(err.message || 'Could not calculate fare for the selected journey.');
    } finally {
      setLoading(false);
    }
  };

  // Step 6 -> Step 7: Submit payment & confirm booking (preventing duplicate clicks)
  const handleConfirmBooking = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setLoading(true);
    setError('');
    try {
      const payload = {
        train_id: trainId,
        carriage_code: selectedCarriage.carriage_code,
        travel_date: effectiveDate,
        from_station: fromStationCode,
        to_station: toStationCode,
        seats: selectedSeats.map((s) => s.seat_number),
        passenger_name: passengers[0]?.full_name,
        passenger_nic: passengers[0]?.nic_passport,
        contact_phone: contactPhone.trim(),
        contact_email: contactEmail.trim(),
        payment_method: paymentMethod,
        payment_details: {
          card_holder: cardHolder || passengers[0]?.full_name,
          card_number: cardNumber,
          card_expiry: cardExpiry
        },
        passengers: passengers.map((p) => ({
          seat_number: p.seat_number,
          full_name: p.full_name.trim(),
          nic_passport: p.nic_passport ? p.nic_passport.trim() : '',
          passenger_type: p.passenger_type || 'ADULT',
          age: Number(p.age) || 30
        }))
      };

      const res = await api.createBooking(payload);
      const createdBooking = res?.booking || res?.data || res;
      setConfirmedBooking(createdBooking);
      setStep('confirmation');
      if (onBookingComplete) {
        onBookingComplete(createdBooking);
      }
    } catch (err) {
      setError(err.message || 'Payment verification or reservation failed. Please verify your payment details.');
    } finally {
      setLoading(false);
      setSubmitting(false);
    }
  };

  // Group seats into rows of 4 (2 + aisle + 2)
  const seatRows = [];
  for (let i = 0; i < seats.length; i += 4) {
    seatRows.push(seats.slice(i, i + 4));
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* 7-Step Progress Indicator */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center flex-wrap gap-1.5 text-xs font-semibold">
          <span className="text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> 1. Search Journey
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> 2. Choose Train ({trainDisplayName})
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <button
            type="button"
            disabled={step === 'confirmation'}
            onClick={() => setStep('seats')}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              step === 'seats' ? 'bg-indigo-900 text-white font-bold' : 'text-indigo-900 hover:bg-indigo-50'
            }`}
          >
            3. Choose Seats
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span
            className={`px-2.5 py-1 rounded-lg ${
              step === 'passengers' ? 'bg-indigo-900 text-white font-bold' : 'text-slate-500'
            }`}
          >
            4. Passenger Details
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span
            className={`px-2.5 py-1 rounded-lg ${
              step === 'review' ? 'bg-indigo-900 text-white font-bold' : 'text-slate-500'
            }`}
          >
            5. Review Booking
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span
            className={`px-2.5 py-1 rounded-lg ${
              step === 'payment' ? 'bg-indigo-900 text-white font-bold' : 'text-slate-500'
            }`}
          >
            6. Payment
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span
            className={`px-2.5 py-1 rounded-lg ${
              step === 'confirmation' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-500'
            }`}
          >
            7. Confirmation
          </span>
        </div>

        {onBack && step !== 'confirmation' && (
          <button
            onClick={onBack}
            className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Change Train
          </button>
        )}
      </div>

      {error && (
        <div className="mb-6 bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-center gap-2.5 text-sm font-medium">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 8 Columns */}
        <div className="lg:col-span-8 bg-white rounded-2xl shadow-md border border-slate-200 p-6">
          {/* Carriage Tabs */}
          {step !== 'confirmation' && (
            <div className="flex flex-wrap items-center justify-between gap-4 pb-5 mb-6 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                  <Train className="w-5 h-5 text-indigo-700" />
                  {trainDisplayName} #{activeTrain.train_number} — Interactive Coach
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {fareBreakdown?.from_station_name || fromStationCode} → {fareBreakdown?.to_station_name || toStationCode} • {effectiveDate}
                  {!user && ' • Guest Booking Mode (No Login Required)'}
                </p>
              </div>

              {step === 'seats' && (
                <div className="flex flex-wrap gap-2">
                  {carriages.map((c) => {
                    const isSelected = selectedCarriage?.carriage_code === c.carriage_code;
                    return (
                      <button
                        key={c.carriage_code || c.id}
                        type="button"
                        onClick={() => handleCarriageChange(c)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-[#1E1E38] text-white border-[#1E1E38] shadow-md'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Coach {c.carriage_code} • {c.class_name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: CHOOSE SEATS */}
          {step === 'seats' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                <div className="flex flex-wrap items-center gap-5 text-xs font-bold text-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-[#4CAF50] inline-block shadow-sm border border-emerald-700/20" />
                    <span>Available</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-[#CFD8DC] inline-block shadow-sm border border-slate-400/30" />
                    <span>Booked / Temporarily Reserved</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-[#5B21B6] inline-block shadow-sm border border-purple-900" />
                    <span>Your Selected Seats</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => loadSeatMapAndFare(selectedCarriage)}
                  className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 flex items-center gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Refresh Seat Availability
                </button>
              </div>

              <div className="overflow-x-auto pb-4">
                <div className="min-w-[520px] max-w-[620px] mx-auto bg-slate-100 rounded-[36px] border-4 border-slate-800 p-6 relative shadow-inner">
                  <div className="flex items-center justify-between bg-slate-800 text-white px-5 py-2.5 rounded-t-2xl mb-5 text-xs font-bold uppercase tracking-wider">
                    <span>🚪 Front Entry Door</span>
                    <span className="text-amber-300">
                      Coach {selectedCarriage?.carriage_code} ({selectedCarriage?.class_name})
                    </span>
                    <span>⬆️ Direction of Travel</span>
                  </div>

                  <div className="grid grid-cols-5 gap-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3 px-4">
                    <span>Window (A)</span>
                    <span>Aisle (B)</span>
                    <span className="text-slate-400">Corridor</span>
                    <span>Aisle (C)</span>
                    <span>Window (D)</span>
                  </div>

                  <div className="space-y-3 px-4">
                    {seatRows.map((rowSeats, rIdx) => (
                      <div
                        key={rIdx}
                        className="grid grid-cols-5 gap-3 items-center bg-white/90 py-2 px-3 rounded-xl border border-slate-200/70 shadow-xs"
                      >
                        {[0, 1].map((pos) => {
                          const seat = rowSeats[pos];
                          if (!seat) return <div key={pos} />;
                          const isSelected = selectedSeats.some((s) => s.seat_number === seat.seat_number);
                          const status = String(seat.status || 'AVAILABLE').toUpperCase();
                          const isUnavailable = status === 'BOOKED' || status === 'LOCKED';
                          const fillHex = isSelected
                            ? '#5B21B6'
                            : isUnavailable
                            ? '#CFD8DC'
                            : '#4CAF50';
                          const textHex = isUnavailable ? '#64748B' : '#FFFFFF';

                          return (
                            <button
                              key={seat.seat_number || seat.id}
                              type="button"
                              disabled={isUnavailable}
                              onClick={() => toggleSeat(seat)}
                              className={`group relative flex flex-col items-center justify-center p-1 rounded-xl transition-transform ${
                                isUnavailable
                                  ? 'cursor-not-allowed opacity-75'
                                  : 'cursor-pointer hover:scale-105'
                              }`}
                              title={`Seat ${seat.seat_number} (${seat.seat_type || 'SEAT'}) - ${status}`}
                            >
                              <svg width="54" height="48" viewBox="0 0 54 48" className="drop-shadow-xs">
                                <rect x="9" y="3" width="36" height="8" rx="4" fill={fillHex} stroke="#1E293B" strokeWidth="1.2" />
                                <rect x="4" y="13" width="6" height="24" rx="3" fill={fillHex} stroke="#1E293B" strokeWidth="1" />
                                <rect x="44" y="13" width="6" height="24" rx="3" fill={fillHex} stroke="#1E293B" strokeWidth="1" />
                                <rect x="9" y="10" width="36" height="32" rx="7" fill={fillHex} stroke="#1E293B" strokeWidth="1.5" />
                                <text x="27" y="30" textAnchor="middle" fill={textHex} fontSize="12" fontWeight="800">
                                  {seat.seat_number}
                                </text>
                              </svg>
                            </button>
                          );
                        })}

                        <div className="flex flex-col items-center justify-center text-[10px] font-bold text-slate-400 select-none">
                          <span>ROW {rIdx + 1}</span>
                        </div>

                        {[2, 3].map((pos) => {
                          const seat = rowSeats[pos];
                          if (!seat) return <div key={pos} />;
                          const isSelected = selectedSeats.some((s) => s.seat_number === seat.seat_number);
                          const status = String(seat.status || 'AVAILABLE').toUpperCase();
                          const isUnavailable = status === 'BOOKED' || status === 'LOCKED';
                          const fillHex = isSelected
                            ? '#5B21B6'
                            : isUnavailable
                            ? '#CFD8DC'
                            : '#4CAF50';
                          const textHex = isUnavailable ? '#64748B' : '#FFFFFF';

                          return (
                            <button
                              key={seat.seat_number || seat.id}
                              type="button"
                              disabled={isUnavailable}
                              onClick={() => toggleSeat(seat)}
                              className={`group relative flex flex-col items-center justify-center p-1 rounded-xl transition-transform ${
                                isUnavailable
                                  ? 'cursor-not-allowed opacity-75'
                                  : 'cursor-pointer hover:scale-105'
                              }`}
                              title={`Seat ${seat.seat_number} (${seat.seat_type || 'SEAT'}) - ${status}`}
                            >
                              <svg width="54" height="48" viewBox="0 0 54 48" className="drop-shadow-xs">
                                <rect x="9" y="3" width="36" height="8" rx="4" fill={fillHex} stroke="#1E293B" strokeWidth="1.2" />
                                <rect x="4" y="13" width="6" height="24" rx="3" fill={fillHex} stroke="#1E293B" strokeWidth="1" />
                                <rect x="44" y="13" width="6" height="24" rx="3" fill={fillHex} stroke="#1E293B" strokeWidth="1" />
                                <rect x="9" y="10" width="36" height="32" rx="7" fill={fillHex} stroke="#1E293B" strokeWidth="1.5" />
                                <text x="27" y="30" textAnchor="middle" fill={textHex} fontSize="12" fontWeight="800">
                                  {seat.seat_number}
                                </text>
                              </svg>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between bg-slate-800 text-white px-5 py-2.5 rounded-b-2xl mt-5 text-xs font-bold uppercase tracking-wider">
                    <span>🚪 Rear Vestibule Door</span>
                    <span className="text-emerald-300">Observation Deck</span>
                    <span>Luggage Rack 🧳</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* STEP 4: PASSENGER DETAILS (GUEST OR LOGGED-IN) */}
          {step === 'passengers' && (
            <form onSubmit={handleProceedToReview} className="space-y-5">
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-indigo-950 text-xs sm:text-sm font-semibold">
                  <Lock className="w-4 h-4 text-indigo-700 shrink-0" />
                  <span>
                    Seats {selectedSeats.map((s) => s.seat_number).join(', ')} are held for 10 minutes. Enter passenger details below (no login required).
                  </span>
                </div>
                {lockExpiresAt && (
                  <span className="text-xs font-bold text-indigo-700 bg-white px-2.5 py-1 rounded-md border border-indigo-200">
                    Active Hold
                  </span>
                )}
              </div>

              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <User className="w-5 h-5 text-indigo-700" />
                Step 4: Passenger Details & Contact Verification Info
              </h3>

              {/* Contact info for booking lookup & e-ticket verification */}
              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3">
                <div className="text-xs font-bold text-amber-950">
                  Booking Contact & Verification Details (Used to retrieve or cancel your booking later)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Contact Mobile Phone *
                    </label>
                    <input
                      type="text"
                      required
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="e.g. +94 77 123 4567"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Contact Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="e.g. passenger@example.com"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {passengers.map((p, idx) => (
                  <div key={p.seat_number} className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs font-extrabold uppercase tracking-wider text-indigo-900 mb-3">
                      Passenger #{idx + 1} — Coach {selectedCarriage?.carriage_code}, Seat {p.seat_number}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name *</label>
                        <input
                          type="text"
                          required
                          value={p.full_name}
                          onChange={(e) => {
                            const next = [...passengers];
                            next[idx].full_name = e.target.value;
                            setPassengers(next);
                          }}
                          placeholder="e.g. Kasun Perera"
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">NIC / Passport No. *</label>
                        <input
                          type="text"
                          required
                          value={p.nic_passport}
                          onChange={(e) => {
                            const next = [...passengers];
                            next[idx].nic_passport = e.target.value;
                            setPassengers(next);
                          }}
                          placeholder="199424501234 or N1234567"
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Passenger Category</label>
                        <select
                          value={p.passenger_type}
                          onChange={(e) => {
                            const next = [...passengers];
                            next[idx].passenger_type = e.target.value;
                            setPassengers(next);
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                        >
                          <option value="ADULT">Adult (Full Fare)</option>
                          <option value="CHILD">Child (50% Concession)</option>
                          <option value="SENIOR">Senior Citizen (25% Concession)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setStep('seats')}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100"
                >
                  ← Back to Seat Selection
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-3 rounded-xl bg-indigo-900 hover:bg-indigo-800 text-white text-sm font-bold shadow-md cursor-pointer"
                >
                  {loading ? 'Calculating Fare...' : 'Step 5: Review Booking & Fare →'}
                </button>
              </div>
            </form>
          )}

          {/* STEP 5: REVIEW BOOKING & COMPLETE FARE BREAKDOWN */}
          {step === 'review' && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-700" />
                Step 5: Review Journey, Passengers & Complete Fare Breakdown
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <div className="text-slate-500 font-semibold">Train & Service</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    #{activeTrain.train_number} {trainDisplayName}
                  </div>
                  <div className="text-slate-600 mt-1">
                    {fareBreakdown?.from_station_name || fromStationCode} → {fareBreakdown?.to_station_name || toStationCode} ({fareBreakdown?.distance_km || 0} km)
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 font-semibold">Travel Date, Class & Seats</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {effectiveDate} • Coach {selectedCarriage?.carriage_code} ({selectedCarriage?.class_name})
                  </div>
                  <div className="text-indigo-700 font-bold mt-1">
                    Seats: {selectedSeats.map((s) => s.seat_number).join(', ')}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 font-semibold">Contact Phone</div>
                  <div className="font-bold text-slate-900 mt-0.5">{contactPhone || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-slate-500 font-semibold">Contact Email</div>
                  <div className="font-bold text-slate-900 mt-0.5">{contactEmail || 'N/A'}</div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-bold">
                    <tr>
                      <th className="p-3">Seat</th>
                      <th className="p-3">Passenger Name</th>
                      <th className="p-3">NIC / Passport</th>
                      <th className="p-3">Category</th>
                      <th className="p-3 text-right">Seat Fare (LKR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {passengers.map((p, idx) => {
                      const paxFare = fareBreakdown?.passengers?.[idx];
                      return (
                        <tr key={p.seat_number}>
                          <td className="p-3 font-mono font-bold text-indigo-900">{p.seat_number}</td>
                          <td className="p-3 font-semibold text-slate-900">{p.full_name}</td>
                          <td className="p-3 text-slate-600">{p.nic_passport || '—'}</td>
                          <td className="p-3">{p.passenger_type}</td>
                          <td className="p-3 text-right font-bold text-slate-900">
                            LKR {(paxFare ? paxFare.fare_lkr : unitAdultLkr).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-emerald-900">Total Verified Payable Amount</div>
                  <div className="text-[11px] text-emerald-700">
                    Includes base distance fare ({fareBreakdown?.distance_km || 0} km) and seat reservation fee. Cancellation fee: {fareBreakdown?.cancellation_fee_pct || 20}%.
                  </div>
                </div>
                <div className="text-xl font-black text-emerald-900">
                  LKR {grandTotal.toLocaleString()}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep('passengers')}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100"
                >
                  ← Edit Passenger Details
                </button>
                <button
                  type="button"
                  onClick={() => setStep('payment')}
                  className="px-6 py-3 rounded-xl bg-indigo-900 hover:bg-indigo-800 text-white text-sm font-bold shadow-md cursor-pointer"
                >
                  Step 6: Proceed to Payment →
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: PAYMENT */}
          {step === 'payment' && (
            <form onSubmit={handleConfirmBooking} className="space-y-5">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                Step 6: Complete Payment (LKR {grandTotal.toLocaleString()})
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { id: 'CARD', label: 'Visa / MasterCard' },
                  { id: 'LANKAQR', label: 'LankaQR Instant Pay' },
                  { id: 'BANK_TRANSFER', label: 'Online Bank Transfer' }
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={`p-3.5 rounded-xl border text-xs font-bold text-left transition-all ${
                      paymentMethod === m.id
                        ? 'border-indigo-700 bg-indigo-50 text-indigo-950'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {paymentMethod === 'CARD' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Cardholder Name</label>
                    <input
                      type="text"
                      required
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Card Number</label>
                    <input
                      type="text"
                      required
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Expiry Date (MM/YY)</label>
                    <input
                      type="text"
                      required
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Security Code (CVV)</label>
                    <input
                      type="password"
                      required
                      maxLength={4}
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm bg-white font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-4">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setStep('review')}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100"
                >
                  ← Back to Review
                </button>
                <button
                  type="submit"
                  disabled={loading || submitting}
                  className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white text-sm font-extrabold shadow-lg cursor-pointer flex items-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {submitting
                    ? 'Verifying Payment & Issuing Ticket...'
                    : `Pay LKR ${grandTotal.toLocaleString()} & Confirm Booking`}
                </button>
              </div>
            </form>
          )}

          {/* STEP 7: CONFIRMATION */}
          {step === 'confirmation' && confirmedBooking && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800">
                      Step 7: Booking Confirmed & Payment Verified
                    </span>
                    <h3 className="text-2xl font-black text-slate-900 mt-0.5">
                      Booking Reference (PNR): <span className="font-mono text-indigo-900">{confirmedBooking.pnr}</span>
                    </h3>
                    <p className="text-xs text-slate-700 mt-1">
                      Save your PNR (<strong>{confirmedBooking.pnr}</strong>) and contact details ({confirmedBooking.contact_phone || confirmedBooking.contact_email || confirmedBooking.passenger_nic}) to retrieve or manage your ticket anytime without logging in.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {onViewTicket && (
                    <button
                      type="button"
                      onClick={() => onViewTicket(confirmedBooking)}
                      className="px-4 py-2.5 rounded-xl bg-[#5C1D24] text-white text-xs font-bold flex items-center gap-1.5 shadow hover:opacity-95"
                    >
                      <Eye className="w-4 h-4" /> Open Printable E-Ticket
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50"
                  >
                    <Printer className="w-4 h-4" /> Print Confirmation
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-5 rounded-xl border border-slate-200 text-xs">
                <div>
                  <div className="text-slate-500">Train & Route</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    #{confirmedBooking.train_number} {confirmedBooking.train_name}
                  </div>
                  <div className="text-slate-600">
                    {confirmedBooking.from_station_name} → {confirmedBooking.to_station_name}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Travel Date & Reserved Seats</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    {confirmedBooking.travel_date}
                  </div>
                  <div className="text-indigo-700 font-bold">
                    Coach {confirmedBooking.carriage_code} ({confirmedBooking.class_name}) • Seats {confirmedBooking.seats_csv}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Lead Passenger & Total Paid</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    {confirmedBooking.passenger_name}
                  </div>
                  <div className="text-emerald-700 font-extrabold">
                    LKR {Number(confirmedBooking.total_amount_lkr).toLocaleString()} ({confirmedBooking.payment_status})
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right 4 Columns: Live Summary Sidebar */}
        <div className="lg:col-span-4 bg-[#1E1E38] text-white rounded-2xl p-6 shadow-xl sticky top-24">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/15">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-amber-300 font-bold">
                Reservation Summary
              </span>
              <h3 className="text-lg font-extrabold">{trainDisplayName}</h3>
            </div>
            <span className="bg-white/10 px-3 py-1 rounded-full text-xs font-bold text-emerald-300">
              #{activeTrain.train_number}
            </span>
          </div>

          <div className="space-y-3 text-xs text-slate-300 mb-6">
            <div className="flex justify-between">
              <span>Route Segment</span>
              <span className="font-bold text-white">
                {fareBreakdown?.from_station_name || fromStationCode} → {fareBreakdown?.to_station_name || toStationCode}
              </span>
            </div>
            {fareBreakdown?.distance_km && (
              <div className="flex justify-between">
                <span>Segment Distance</span>
                <span className="font-bold text-emerald-300">{fareBreakdown.distance_km} km</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Travel Date</span>
              <span className="font-bold text-white">{effectiveDate}</span>
            </div>
            <div className="flex justify-between">
              <span>Coach / Class</span>
              <span className="font-bold text-amber-300">
                {selectedCarriage?.carriage_code} ({selectedCarriage?.class_name})
              </span>
            </div>
            <div className="flex justify-between">
              <span>Selected Seats ({selectedSeats.length})</span>
              <span className="font-bold text-white">
                {selectedSeats.length > 0
                  ? selectedSeats.map((s) => s.seat_number).join(', ')
                  : 'None selected'}
              </span>
            </div>
          </div>

          <div className="border-t border-white/15 pt-4 space-y-2 text-xs mb-6">
            <div className="flex justify-between text-slate-300">
              <span>Ticket Base Fare ({selectedSeats.length} seat{selectedSeats.length === 1 ? '' : 's'})</span>
              <span className="font-semibold text-white">LKR {subTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Seat Reservation Fee</span>
              <span className="font-semibold text-white">LKR {totalFee.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Taxes & Levies</span>
              <span className="font-semibold text-white">LKR {totalTax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-base font-extrabold text-amber-300 pt-3 border-t border-white/15">
              <span>Total Payable</span>
              <span>LKR {grandTotal.toLocaleString()}</span>
            </div>
          </div>

          {step === 'seats' && (
            <button
              type="button"
              disabled={selectedSeats.length === 0 || locking}
              onClick={handleProceedToPassengers}
              className={`w-full py-3.5 px-5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                selectedSeats.length > 0
                  ? 'bg-gradient-to-r from-[#FF6B4A] to-[#FF5722] hover:from-[#FF5722] hover:to-[#E64A19] text-white shadow-lg cursor-pointer'
                  : 'bg-white/10 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>
                {locking
                  ? 'Locking Selected Seats...'
                  : 'Continue to Passenger Details (No Login Needed)'}
              </span>
            </button>
          )}

          <p className="text-[11px] text-slate-400 mt-4 text-center">
            Server-side ACID seat lock holds your selected seats for 10 minutes while you complete checkout.
          </p>
        </div>
      </div>
    </div>
  );
}
