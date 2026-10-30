const {
  createOperatingExpense,
  updateOperatingExpense,
  listOperatingExpenses,
  listReportRuns
} = require('../repositories/financeRepository');
const {
  generateFinancialReport,
  exportFinancialReportCsv
} = require('../services/financialReportService');
const { validateDateISO } = require('../middleware/validation');
const { recordAuditLog } = require('../middleware/auth');

function createExpenseHandler(req, res) {
  const { category, title, amount_cents, amount_lkr, incurred_date } = req.body || {};
  if (!title || !incurred_date || (amount_cents === undefined && amount_lkr === undefined)) {
    return res.status(400).json({
      success: false,
      error: 'title, incurred_date, and amount_lkr (or amount_cents) are required.'
    });
  }
  if (!validateDateISO(incurred_date)) {
    return res.status(400).json({
      success: false,
      error: 'incurred_date must be a valid YYYY-MM-DD date.'
    });
  }

  const validCategories = [
    'FUEL_ENERGY',
    'TRACK_MAINTENANCE',
    'ROLLING_STOCK',
    'STAFF_PAYROLL',
    'STATION_OPERATIONS',
    'SIGNALING_TECH',
    'OTHER'
  ];
  if (category && !validCategories.includes(category)) {
    return res.status(400).json({
      success: false,
      error: `Invalid category. Allowed: ${validCategories.join(', ')}`
    });
  }

  const expense = createOperatingExpense(req.staff.id, req.body);

  recordAuditLog({
    actorType: 'STAFF',
    actorId: req.staff.id,
    actorIdentifier: req.staff.username,
    action: 'OPERATING_EXPENSE_RECORDED',
    entityType: 'operating_expenses',
    entityId: expense.expense_reference,
    details: { category: expense.category, amount_cents: expense.amount_cents },
    ipAddress: req.ip
  });

  return res.status(201).json({
    success: true,
    expense
  });
}

function updateExpenseHandler(req, res) {
  const expense = updateOperatingExpense(Number(req.params.id), req.body || {});
  if (!expense) {
    return res.status(404).json({ success: false, error: 'Operating expense not found.' });
  }
  recordAuditLog({
    actorType: 'STAFF',
    actorId: req.staff.id,
    actorIdentifier: req.staff.username,
    action: 'OPERATING_EXPENSE_UPDATED',
    entityType: 'operating_expenses',
    entityId: expense.expense_reference,
    ipAddress: req.ip
  });
  return res.json({
    success: true,
    expense
  });
}

function listExpensesHandler(req, res) {
  const expenses = listOperatingExpenses({
    startDate: req.query?.start_date,
    endDate: req.query?.end_date,
    category: req.query?.category
  });
  return res.json({
    success: true,
    expenses
  });
}

function getFinancialReportHandler(req, res) {
  const periodType = req.query?.period_type || req.body?.period_type || 'CUSTOM';
  const startDate = req.query?.start_date || req.body?.start_date || null;
  const endDate = req.query?.end_date || req.body?.end_date || null;
  const saveRun = req.query?.save_run === 'true' || req.body?.save_run === true;
  const format = (req.query?.format || 'json').toLowerCase();

  const report = generateFinancialReport({
    periodType,
    startDate,
    endDate,
    staffId: req.staff.id,
    saveReportRun: saveRun
  });

  if (format === 'csv') {
    const csv = exportFinancialReportCsv(report);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="ceylon_rail_financial_report_${report.start_date}_to_${report.end_date}.csv"`);
    return res.send(csv);
  }

  return res.json({
    success: true,
    report,
    recent_report_runs: listReportRuns(10)
  });
}

module.exports = {
  createExpenseHandler,
  updateExpenseHandler,
  listExpensesHandler,
  getFinancialReportHandler
};
