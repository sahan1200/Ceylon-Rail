const { dbAll, dbGet, dbRun } = require('../database');

function createOperatingExpense(staffId, payload) {
  const amountCents = payload.amount_cents !== undefined
    ? Math.round(Number(payload.amount_cents))
    : Math.round(Number(payload.amount_lkr) * 100);
  const amountLkr = Number((amountCents / 100).toFixed(2));
  const ref = payload.expense_reference || `EXP-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

  const res = dbRun(
    `INSERT INTO operating_expenses (
      expense_reference, category, title, description, amount_cents, amount_lkr,
      incurred_date, train_id, station_id, vendor_name, recorded_by_staff_id, approved_by_staff_id, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ref,
      payload.category || 'STATION_OPERATIONS',
      String(payload.title).trim(),
      payload.description ? String(payload.description).trim() : null,
      amountCents,
      amountLkr,
      payload.incurred_date,
      payload.train_id ? Number(payload.train_id) : null,
      payload.station_id ? Number(payload.station_id) : null,
      payload.vendor_name || null,
      staffId,
      staffId,
      payload.status || 'APPROVED'
    ]
  );

  return getOperatingExpenseById(res.lastID);
}

function getOperatingExpenseById(expenseId) {
  return dbGet(
    `SELECT oe.*,
            su.full_name AS recorded_by_name,
            t.train_number, t.name AS train_name,
            s.code AS station_code, s.name AS station_name
     FROM operating_expenses oe
     JOIN staff_users su ON su.id = oe.recorded_by_staff_id
     LEFT JOIN trains t ON t.id = oe.train_id
     LEFT JOIN stations s ON s.id = oe.station_id
     WHERE oe.id = ?`,
    [expenseId]
  );
}

function updateOperatingExpense(expenseId, payload) {
  const existing = getOperatingExpenseById(expenseId);
  if (!existing) return null;

  let amountCents = existing.amount_cents;
  if (payload.amount_cents !== undefined) {
    amountCents = Math.round(Number(payload.amount_cents));
  } else if (payload.amount_lkr !== undefined) {
    amountCents = Math.round(Number(payload.amount_lkr) * 100);
  }
  const amountLkr = Number((amountCents / 100).toFixed(2));

  dbRun(
    `UPDATE operating_expenses
     SET category = COALESCE(?, category),
         title = COALESCE(?, title),
         description = COALESCE(?, description),
         amount_cents = ?,
         amount_lkr = ?,
         incurred_date = COALESCE(?, incurred_date),
         vendor_name = COALESCE(?, vendor_name),
         status = COALESCE(?, status),
         updated_at = datetime('now')
     WHERE id = ?`,
    [
      payload.category ?? null,
      payload.title ?? null,
      payload.description ?? null,
      amountCents,
      amountLkr,
      payload.incurred_date ?? null,
      payload.vendor_name ?? null,
      payload.status ?? null,
      expenseId
    ]
  );

  return getOperatingExpenseById(expenseId);
}

function listOperatingExpenses({ startDate, endDate, category } = {}) {
  const conditions = ['1 = 1'];
  const params = [];

  if (startDate) {
    conditions.push('oe.incurred_date >= ?');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('oe.incurred_date <= ?');
    params.push(endDate);
  }
  if (category && category !== 'ALL') {
    conditions.push('oe.category = ?');
    params.push(category);
  }

  return dbAll(
    `SELECT oe.*,
            su.full_name AS recorded_by_name,
            t.train_number, t.name AS train_name,
            s.code AS station_code, s.name AS station_name
     FROM operating_expenses oe
     JOIN staff_users su ON su.id = oe.recorded_by_staff_id
     LEFT JOIN trains t ON t.id = oe.train_id
     LEFT JOIN stations s ON s.id = oe.station_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY oe.incurred_date DESC, oe.id DESC`,
    params
  );
}

function listReportRuns(limit = 25) {
  return dbAll(
    `SELECT r.*, su.full_name AS generated_by_name, su.username AS generated_by_username
     FROM financial_report_runs r
     JOIN staff_users su ON su.id = r.generated_by_staff_id
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT ?`,
    [limit]
  );
}

module.exports = {
  createOperatingExpense,
  getOperatingExpenseById,
  updateOperatingExpense,
  listOperatingExpenses,
  listReportRuns
};
