import React from 'react';
import { X, Printer, Download, Share2, ShieldCheck, Train, QrCode, CheckCircle2 } from 'lucide-react';

export default function ETicketModal({ booking, ticket, onClose }) {
  const data = booking || ticket;
  if (!data) return null;

  const pnr = data.pnr || data.ref || 'CR-2025-88412';
  const trainName = data.train_name || data.trainName || 'Podi Menike';
  const trainNumber = data.train_number || data.trainNo || '1005';
  const fromStation = data.from_station_name || data.from || 'Colombo Fort';
  const toStation = data.to_station_name || data.to || 'Ella';
  const travelDate = data.travel_date || data.date || new Date().toISOString().slice(0, 10);
  const departureTime = data.departure_time || data.depTime || '05:55';
  const arrivalTime = data.arrival_time || data.arrTime || '16:10';
  const carriageCode = data.carriage_code || data.coach || 'C1';
  const className = data.class_name || data.travelClass || '1st Class Observation';
  const seatsText =
    data.seats_csv ||
    (Array.isArray(data.seats)
      ? data.seats.map((s) => (typeof s === 'object' ? s.seat_number : s)).join(', ')
      : '1A, 1B');
  const totalAmount = Number(data.total_amount_lkr || data.amount || data.totalFare || 5000);
  const status = data.booking_status || data.status || 'CONFIRMED';

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const shareText = `Ceylon Rail e-Ticket ${pnr}: ${trainName} (#${trainNumber}) from ${fromStation} to ${toStation} on ${travelDate}, Coach ${carriageCode} Seats ${seatsText}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Ceylon Rail Ticket ${pnr}`, text: shareText });
      } catch (_) {}
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareText);
      alert('Ticket summary copied to clipboard!');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl my-8">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-11 right-0 bg-white/15 hover:bg-white/25 text-white rounded-full p-2 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Vintage Sri Lankan E-Ticket Voucher with Ornate Maroon/Cinnamon Border (#5C1D24 / #7F4F24) */}
        <div className="bg-[#FDFBF7] rounded-2xl shadow-2xl border-8 border-[#5C1D24] overflow-hidden relative">
          {/* Inner Gold/Cinnamon Filigree Frame */}
          <div className="m-2 border-2 border-dashed border-[#7F4F24]/60 rounded-xl p-6 relative">
            {/* Heritage Watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.04]">
              <Train className="w-72 h-72 text-[#5C1D24]" />
            </div>

            {/* Ticket Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b-2 border-[#7F4F24]/30 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#5C1D24] text-amber-200 flex items-center justify-center font-black text-lg shadow-md">
                  CR
                </div>
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#7F4F24]">
                    Sri Lanka Railways • දුම්රිය දෙපාර්තමේන්තුව • இலங்கை புகையிரத சேவை
                  </div>
                  <h2 className="text-xl font-black text-[#5C1D24] tracking-tight">
                    CEYLON RAIL HERITAGE E-TICKET VOUCHER
                  </h2>
                </div>
              </div>

              <div className="text-left sm:text-right">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {status}
                </span>
                <div className="text-sm font-mono font-black text-[#5C1D24] mt-1">PNR: {pnr}</div>
              </div>
            </div>

            {/* Route & Timestamps */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-5 border-b-2 border-dashed border-[#7F4F24]/30 relative z-10">
              <div>
                <div className="text-[11px] uppercase font-bold text-[#7F4F24]">Departure Station</div>
                <div className="text-lg font-extrabold text-slate-900">{fromStation}</div>
                <div className="text-sm font-bold text-[#5C1D24]">{departureTime} HRS</div>
              </div>

              <div className="flex flex-col items-center justify-center text-center">
                <div className="text-xs font-extrabold text-[#7F4F24] uppercase tracking-wider">
                  {trainName} (#{trainNumber})
                </div>
                <div className="w-full flex items-center gap-2 my-1.5">
                  <div className="h-0.5 flex-1 bg-[#7F4F24]/40" />
                  <Train className="w-4 h-4 text-[#5C1D24]" />
                  <div className="h-0.5 flex-1 bg-[#7F4F24]/40" />
                </div>
                <div className="text-[11px] font-semibold text-slate-600">Travel Date: {travelDate}</div>
              </div>

              <div className="sm:text-right">
                <div className="text-[11px] uppercase font-bold text-[#7F4F24]">Arrival Station</div>
                <div className="text-lg font-extrabold text-slate-900">{toStation}</div>
                <div className="text-sm font-bold text-[#5C1D24]">{arrivalTime} HRS</div>
              </div>
            </div>

            {/* Coach, Seats, Fare & Cryptographic QR Code */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 pt-5 items-center relative z-10">
              <div className="sm:col-span-8 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-[#5C1D24]/5 p-3.5 rounded-xl border border-[#7F4F24]/25">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-[#7F4F24]">Coach / Class</div>
                    <div className="text-xs font-extrabold text-slate-900">
                      {carriageCode} • {className}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-[#7F4F24]">Reserved Seats</div>
                    <div className="text-sm font-black text-[#5C1D24]">{seatsText}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-[#7F4F24]">Total Paid</div>
                    <div className="text-sm font-black text-emerald-800">
                      LKR {totalAmount.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-600">
                  <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>
                    Cryptographically signed with HMAC-SHA256. Present this QR voucher and NIC/Passport to the Conductor on board.
                  </span>
                </div>
              </div>

              {/* QR Code Box */}
              <div className="sm:col-span-4 flex flex-col items-center justify-center bg-white p-3 rounded-xl border-2 border-[#7F4F24]/40 shadow-xs">
                {data.qr_svg ? (
                  <div
                    className="w-28 h-28 flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: data.qr_svg }}
                  />
                ) : (
                  <QrCode className="w-24 h-24 text-[#5C1D24]" />
                )}
                <span className="text-[10px] font-mono font-bold text-[#5C1D24] mt-1">
                  VERIFIED QR • {pnr}
                </span>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="bg-[#5C1D24] px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-white">
            <span className="text-xs text-amber-200 font-medium">
              Official Ceylon Rail Digital Pass
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handlePrint}
                className="px-3.5 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Download PDF
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="px-3.5 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" /> Print Ticket
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" /> Share Ticket
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
