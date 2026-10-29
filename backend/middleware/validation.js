/**
 * Request validation and sanitization helpers.
 */
function sanitizeString(value, maxLength = 500) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validateDateISO(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return false;
  const d = new Date(dateStr + 'T00:00:00Z');
  return !Number.isNaN(d.getTime());
}

function validateTimeHHMM(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return false;
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeStr.trim());
}

function parseMonetaryCents(amountLkrOrCents, isAlreadyCents = false) {
  const num = Number(amountLkrOrCents);
  if (!Number.isFinite(num) || num < 0) {
    return null;
  }
  return isAlreadyCents ? Math.round(num) : Math.round(num * 100);
}

function requireFields(fields) {
  return (req, res, next) => {
    const missing = [];
    for (const f of fields) {
      const v = req.body?.[f];
      if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
        missing.push(f);
      }
    }
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`
      });
    }
    next();
  };
}

module.exports = {
  sanitizeString,
  validateEmail,
  validateDateISO,
  validateTimeHHMM,
  parseMonetaryCents,
  requireFields
};
