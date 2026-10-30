const { dbAll, dbGet, dbRun } = require('../database');

/**
 * Generate a comprehensive financial report from real database records:
 * - Gross Revenue from verified SUCCEEDED/PARTIALLY_REFUNDED/REFUNDED payments
 * - Total Refunds from PROCESSED refunds
 * - Net Income after Refunds = Gross Revenue - Total Refunds
 * - Operating Expenses from APPROVED/PAID operating_expenses
 * - Operating Profit / Loss = Net Income after Refunds - Operating Expenses
 *
 * Strictly returns `insufficient_data: true` and `"Insufficient financial data"` when no real
 * payment or expense records exist in the selected period—never invents placeholder numbers.
 */
function generateFinancialReport({
  periodType = 'CUSTOM',
  startDate = null,
  endDate = null,
  staffId = null,
  saveReportRun = false
} = {}) {
  const now = new Date();
  const effectiveEnd = endDate || now.toISOString().slice(0, 10);
  let effectiveStart = startDate;

  if (!effectiveStart) {
    if (periodType === 'DAILY') {
      effectiveStart = effectiveEnd;
    } else if (periodType === 'MONTHLY') {
      effectiveStart = `${effectiveEnd.slice(0, 7)}-01`;
    } else if (periodType === 'ANNUAL') {
      effectiveStart = `${effectiveEnd.slice(0, 4)}-01-01`;
    } else {
      effectiveStart = '2020-01-01';
    }
  }

  // 1. Query verified payments in date range
  const paymentsRows = dbAll(
    `SELECT p.*, b.pnr, b.train_id, b.class_name, b.travel_date,
            t.train_number, t.name AS train_name
     FROM payments p
     JOIN bookings b ON b.id = p.booking_id
     JOIN trains t ON t.id = b.train_id
     WHERE p.status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED')
       AND date(COALESCE(p.verified_at, p.created_at)) >= date(?)
       AND date(COALESCE(p.verified_at, p.created_at)) <= date(?)
     ORDER BY p.created_at DESC`,
    [effectiveStart, effectiveEnd]
  );

  // 2. Query processed refunds in date range
  const refundsRows = dbAll(
    `SELECT r.*, b.pnr, b.train_id, t.train_number, t.name AS train_name
     FROM refunds r
     JOIN bookings b ON b.id = r.booking_id
     JOIN trains t ON t.id = b.train_id
     WHERE r.status = 'PROCESSED'
       AND date(COALESCE(r.processed_at, r.created_at)) >= date(?)
       AND date(COALESCE(r.processed_at, r.created_at)) <= date(?)
     ORDER BY r.created_at DESC`,
    [effectiveStart, effectiveEnd]
  );

  // 3. Query approved/paid operating expenses in date range
  const expensesRows = dbAll(
    `SELECT oe.*, t.train_number, t.name AS train_name, s.code AS station_code, s.name AS station_name
     FROM operating_expenses oe
     LEFT JOIN trains t ON t.id = oe.train_id
     LEFT JOIN stations s ON s.id = oe.station_id
     WHERE oe.status IN ('APPROVED', 'PAID')
       AND date(oe.incurred_date) >= date(?)
       AND date(oe.incurred_date) <= date(?)
     ORDER BY oe.incurred_date DESC, oe.id DESC`,
    [effectiveStart, effectiveEnd]
  );

  // 4. Booking volume stats in date range
  const bookingStatsRow = dbGet(
    `SELECT
       COUNT(*) AS total_bookings,
       SUM(CASE WHEN status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed_bookings,
       SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_bookings,
       SUM(CASE WHEN status = 'PENDING_PAYMENT' THEN 1 ELSE 0 END) AS pending_bookings
     FROM bookings
     WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)`,
    [effectiveStart, effectiveEnd]
  );

  const grossRevenueCents = paymentsRows.reduce((sum, p) => sum + Number(p.amount_cents || 0), 0);
  const totalRefundsCents = refundsRows.reduce((sum, r) => sum + Number(r.amount_cents || 0), 0);
  const netRevenueCents = grossRevenueCents - totalRefundsCents;
  const operatingExpensesCents = expensesRows.reduce((sum, e) => sum + Number(e.amount_cents || 0), 0);
  const netProfitCents = netRevenueCents - operatingExpensesCents;

  const hasFinancialRecords =
    paymentsRows.length > 0 || refundsRows.length > 0 || expensesRows.length > 0;

  // Breakdown by train
  const revenueByTrainMap = new Map();
  for (const p of paymentsRows) {
    const key = p.train_number;
    const item = revenueByTrainMap.get(key) || {
      train_number: p.train_number,
      train_name: p.train_name,
      payment_count: 0,
      gross_revenue_cents: 0,
      refunds_cents: 0,
      net_revenue_cents: 0
    };
    item.payment_count += 1;
    item.gross_revenue_cents += Number(p.amount_cents || 0);
    item.net_revenue_cents = item.gross_revenue_cents - item.refunds_cents;
    revenueByTrainMap.set(key, item);
  }
  for (const r of refundsRows) {
    const key = r.train_number;
    const item = revenueByTrainMap.get(key) || {
      train_number: r.train_number,
      train_name: r.train_name,
      payment_count: 0,
      gross_revenue_cents: 0,
      refunds_cents: 0,
      net_revenue_cents: 0
    };
    item.refunds_cents += Number(r.amount_cents || 0);
    item.net_revenue_cents = item.gross_revenue_cents - item.refunds_cents;
    revenueByTrainMap.set(key, item);
  }

  // Breakdown of expenses by category
  const expensesByCategoryMap = new Map();
  for (const e of expensesRows) {
    const cat = e.category;
    const current = expensesByCategoryMap.get(cat) || { category: cat, count: 0, amount_cents: 0, amount_lkr: 0 };
    current.count += 1;
    current.amount_cents += Number(e.amount_cents || 0);
    current.amount_lkr = Number((current.amount_cents / 100).toFixed(2));
    expensesByCategoryMap.set(cat, current);
  }

  const report = {
    period_type: periodType,
    start_date: effectiveStart,
    end_date: effectiveEnd,
    generated_at: new Date().toISOString(),
    insufficient_data: !hasFinancialRecords,
    status_message: hasFinancialRecords
      ? 'Financial report generated from verified database records.'
      : 'Insufficient financial data for the selected period. No verified payments, refunds, or operating expenses were recorded between these dates.',
    metrics: {
      gross_revenue_cents: grossRevenueCents,
      gross_revenue_lkr: Number((grossRevenueCents / 100).toFixed(2)),
      total_refunds_cents: totalRefundsCents,
      total_refunds_lkr: Number((totalRefundsCents / 100).toFixed(2)),
      net_revenue_cents: netRevenueCents,
      net_revenue_lkr: Number((netRevenueCents / 100).toFixed(2)),
      operating_expenses_cents: operatingExpensesCents,
      operating_expenses_lkr: Number((operatingExpensesCents / 100).toFixed(2)),
      net_profit_cents: netProfitCents,
      net_profit_lkr: Number((netProfitCents / 100).toFixed(2)),
      profit_status: netProfitCents > 0 ? 'PROFIT' : netProfitCents < 0 ? 'LOSS' : 'BREAK_EVEN'
    },
    bookings_summary: {
      total_bookings: bookingStatsRow?.total_bookings || 0,
      confirmed_bookings: bookingStatsRow?.confirmed_bookings || 0,
      cancelled_bookings: bookingStatsRow?.cancelled_bookings || 0,
      pending_bookings: bookingStatsRow?.pending_bookings || 0,
      verified_payments_count: paymentsRows.length,
      processed_refunds_count: refundsRows.length,
      expense_entries_count: expensesRows.length
    },
    revenue_by_train: Array.from(revenueByTrainMap.values()).map((t) => ({
      ...t,
      gross_revenue_lkr: Number((t.gross_revenue_cents / 100).toFixed(2)),
      refunds_lkr: Number((t.refunds_cents / 100).toFixed(2)),
      net_revenue_lkr: Number((t.net_revenue_cents / 100).toFixed(2))
    })),
    expenses_by_category: Array.from(expensesByCategoryMap.values()),
    payments: paymentsRows,
    refunds: refundsRows,
    expenses: expensesRows
  };

  if (saveReportRun && staffId) {
    const runRef = `RPT-${Date.now().toString(36).toUpperCase()}`;
    dbRun(
      `INSERT INTO financial_report_runs (
        report_reference, period_type, start_date, end_date,
        total_bookings_count, confirmed_bookings_count, cancelled_bookings_count,
        gross_revenue_cents, total_refunds_cents, net_revenue_cents,
        operating_expenses_cents, net_profit_cents, has_sufficient_data,
        report_payload_json, generated_by_staff_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runRef,
        periodType,
        effectiveStart,
        effectiveEnd,
        report.bookings_summary.total_bookings,
        report.bookings_summary.confirmed_bookings,
        report.bookings_summary.cancelled_bookings,
        grossRevenueCents,
        totalRefundsCents,
        netRevenueCents,
        operatingExpensesCents,
        netProfitCents,
        hasFinancialRecords ? 1 : 0,
        JSON.stringify({
          metrics: report.metrics,
          bookings_summary: report.bookings_summary,
          revenue_by_train: report.revenue_by_train,
          expenses_by_category: report.expenses_by_category
        }),
        staffId
      ]
    );
    report.report_reference = runRef;
  }

  return report;
}

function exportFinancialReportCsv(report) {
  const lines = [
    ['Ceylon Rail — Official Financial Statement'],
    ['Period Type', report.period_type],
    ['Start Date', report.start_date],
    ['End Date', report.end_date],
    ['Generated At', report.generated_at],
    ['Data Status', report.status_message],
    [],
    ['Metric', 'Amount (Cents)', 'Amount (LKR)'],
    ['Gross Ticket Revenue', report.metrics.gross_revenue_cents, report.metrics.gross_revenue_lkr.toFixed(2)],
    ['Less: Processed Refunds', report.metrics.total_refunds_cents, report.metrics.total_refunds_lkr.toFixed(2)],
    ['Net Income After Refunds', report.metrics.net_revenue_cents, report.metrics.net_revenue_lkr.toFixed(2)],
    ['Less: Operating Expenses', report.metrics.operating_expenses_cents, report.metrics.operating_expenses_lkr.toFixed(2)],
    ['Operating Profit / (Loss)', report.metrics.net_profit_cents, report.metrics.net_profit_lkr.toFixed(2)],
    [],
    ['Train Revenue Breakdown'],
    ['Train Number', 'Train Name', 'Payments Count', 'Gross Revenue (LKR)', 'Refunds (LKR)', 'Net Revenue (LKR)'],
    ...report.revenue_by_train.map((t) => [
      t.train_number,
      `"${String(t.train_name).replace(/"/g, '""')}"`,
      t.payment_count,
      t.gross_revenue_lkr.toFixed(2),
      t.refunds_lkr.toFixed(2),
      t.net_revenue_lkr.toFixed(2)
    ]),
    [],
    ['Operating Expenses by Category'],
    ['Category', 'Entries Count', 'Amount (LKR)'],
    ...report.expenses_by_category.map((c) => [c.category, c.count, c.amount_lkr.toFixed(2)])
  ];

  return lines.map((row) => row.join(',')).join('\n');
}

module.exports = {
  generateFinancialReport,
  exportFinancialReportCsv
};
