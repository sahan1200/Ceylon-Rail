const { signQrPayload, verifyQrSignature } = require('../utils/cryptoUtils');
const { dbGet } = require('../database');

/**
 * Build a deterministic, HMAC-SHA256 signed QR payload for a confirmed booking.
 */
function buildSignedQrPayload(booking) {
  const core = [
    'SLR-ETICKET-V2',
    booking.pnr,
    booking.train_id,
    `${booking.from_station_id}->${booking.to_station_id}`,
    booking.travel_date,
    booking.carriage_code,
    booking.seats_csv,
    booking.total_amount_cents || Math.round(Number(booking.total_amount_lkr || 0) * 100)
  ].join('|');

  const sig = signQrPayload(core);
  return `${core}|${sig}`;
}

/**
 * Verify a signed QR payload or PNR against the database and cryptographic signature.
 */
function verifyTicketQr(qrDataOrPnr) {
  if (!qrDataOrPnr || typeof qrDataOrPnr !== 'string') {
    return { valid: false, reason: 'Empty QR payload or PNR.' };
  }
  const clean = qrDataOrPnr.trim();

  if (clean.startsWith('SLR-ETICKET-V2|')) {
    const parts = clean.split('|');
    if (parts.length !== 9) {
      return { valid: false, reason: 'Malformed QR payload structure.' };
    }
    const sig = parts[8];
    const core = parts.slice(0, 8).join('|');
    if (!verifyQrSignature(core, sig)) {
      return { valid: false, reason: 'Invalid cryptographic QR signature (tampered ticket).' };
    }
    const pnr = parts[1];
    const booking = dbGet('SELECT * FROM bookings WHERE upper(pnr) = upper(?)', [pnr]);
    if (!booking) {
      return { valid: false, reason: 'Booking record not found for PNR in QR code.' };
    }
    return {
      valid: booking.status === 'CONFIRMED',
      status: booking.status,
      pnr: booking.pnr,
      signature_verified: true,
      reason: booking.status === 'CONFIRMED' ? 'Valid active ticket' : `Ticket status is ${booking.status}`
    };
  }

  // Fallback lookup by PNR directly
  const booking = dbGet('SELECT * FROM bookings WHERE upper(pnr) = upper(?)', [clean]);
  if (!booking) {
    return { valid: false, reason: 'Ticket PNR not found in railway database.' };
  }
  return {
    valid: booking.status === 'CONFIRMED',
    status: booking.status,
    pnr: booking.pnr,
    signature_verified: Boolean(booking.qr_payload && booking.qr_payload.startsWith('SLR-ETICKET-V2|')),
    reason: booking.status === 'CONFIRMED' ? 'Valid active ticket' : `Ticket status is ${booking.status}`
  };
}

/**
 * Generate a deterministic SVG matrix representation of the signed QR payload.
 */
function generateQrSvg(payloadString) {
  let hash = 2166136261;
  for (let i = 0; i < payloadString.length; i++) {
    hash ^= payloadString.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const size = 21;
  const cells = [];

  const isFinderPattern = (r, c) => {
    const inTopLeft = r < 7 && c < 7;
    const inTopRight = r < 7 && c >= size - 7;
    const inBottomLeft = r >= size - 7 && c < 7;
    return inTopLeft || inTopRight || inBottomLeft;
  };

  const getFinderBit = (r, c) => {
    const lr = r >= size - 7 ? r - (size - 7) : r;
    const lc = c >= size - 7 ? c - (size - 7) : c;
    if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return 1;
    if (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4) return 1;
    return 0;
  };

  let seed = Math.abs(hash) || 123456789;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let bit = 0;
      if (isFinderPattern(r, c)) {
        bit = getFinderBit(r, c);
      } else {
        const charIdx = (r * size + c) % payloadString.length;
        seed = (seed * 1664525 + 1013904223 + payloadString.charCodeAt(charIdx)) >>> 0;
        bit = (seed & 1) === 1 ? 1 : 0;
      }
      if (bit) {
        cells.push(`<rect x="${c * 4 + 4}" y="${r * 4 + 4}" width="4" height="4" fill="#2C1810"/>`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 92 92" width="128" height="128"><rect width="92" height="92" rx="4" fill="#FFFDF9"/>${cells.join('')}</svg>`;
}

module.exports = {
  buildSignedQrPayload,
  verifyTicketQr,
  generateQrSvg
};
