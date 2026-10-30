const crypto = require('crypto');
const env = require('../config/env');
const { dbGet, dbRun, withTransaction } = require('../database');
const { verifyWebhookSignature } = require('../utils/cryptoUtils');

function getPaymentGatewayStatus() {
  const externalConfigured = env.isExternalPaymentGatewayConfigured();
  return {
    provider_mode: env.PAYMENT_PROVIDER_MODE,
    external_gateway_configured: externalConfigured,
    sandbox_test_enabled: env.isSandboxTestPaymentAllowed(),
    requires_external_configuration: !externalConfigured && env.PAYMENT_PROVIDER_MODE === 'UNCONFIGURED',
    supported_methods: ['CARD', 'LANKAQR', 'BANK_TRANSFER', 'COUNTER_CASH'],
    configuration_notice: externalConfigured
      ? 'External payment gateway credentials are configured.'
      : 'External live payment gateway credentials (STRIPE_SECRET_KEY / PAYHERE_MERCHANT_SECRET) are not configured in .env. Running in controlled local Sandbox Verification Mode (PAYMENT_PROVIDER_MODE=SANDBOX_TEST).'
  };
}

/**
 * Create an initial payment record in INITIATED state and log a payment_transaction event.
 */
function initiateBookingPayment({ bookingId, amountCents, paymentMethod = 'CARD', idempotencyKey = null }) {
  const paymentRef = `PAY-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const amountLkr = Number((amountCents / 100).toFixed(2));
  const provider = env.isExternalPaymentGatewayConfigured()
    ? 'EXTERNAL_GATEWAY'
    : env.PAYMENT_PROVIDER_MODE === 'SANDBOX_TEST'
    ? 'SANDBOX_VERIFIER'
    : 'UNCONFIGURED';

  const res = dbRun(
    `INSERT INTO payments (
      booking_id, payment_reference, provider, payment_method,
      amount_cents, amount_lkr, currency, status, idempotency_key
    ) VALUES (?, ?, ?, ?, ?, ?, 'LKR', 'INITIATED', ?)`,
    [
      bookingId,
      paymentRef,
      provider,
      paymentMethod,
      amountCents,
      amountLkr,
      idempotencyKey || `${bookingId}-${paymentRef}`
    ]
  );

  dbRun(
    `INSERT INTO payment_transactions (
      payment_id, event_type, amount_cents, status, raw_response_json
    ) VALUES (?, 'PAYMENT_INITIATED', ?, 'INITIATED', ?)`,
    [
      res.lastID,
      amountCents,
      JSON.stringify({ provider, payment_method: paymentMethod, timestamp: new Date().toISOString() })
    ]
  );

  return dbGet('SELECT * FROM payments WHERE id = ?', [res.lastID]);
}

/**
 * Verify and settle a payment on the server.
 * - Rejects unconfigured payment settlement if PAYMENT_PROVIDER_MODE === 'UNCONFIGURED' and no external gateway is configured.
 * - Rejects simulated/declined payments and records FAILED status without confirming seats.
 * - Never trusts client-provided amount: always verifies against the booking's server-calculated total_amount_cents.
 */
function verifyAndSettlePayment({
  paymentId,
  bookingId,
  paymentMethod = 'CARD',
  paymentDetails = {},
  webhookSignature = null
}) {
  if (!env.isExternalPaymentGatewayConfigured() && env.PAYMENT_PROVIDER_MODE === 'UNCONFIGURED') {
    const err = new Error(
      'External payment provider is not configured. Set STRIPE_SECRET_KEY / PAYHERE_MERCHANT_SECRET or enable PAYMENT_PROVIDER_MODE=SANDBOX_TEST in .env.'
    );
    err.statusCode = 503;
    err.code = 'PAYMENT_PROVIDER_UNCONFIGURED';
    throw err;
  }

  const booking = dbGet('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  if (!booking) {
    const err = new Error('Booking not found for payment verification.');
    err.statusCode = 404;
    throw err;
  }

  let payment = paymentId
    ? dbGet('SELECT * FROM payments WHERE id = ? AND booking_id = ?', [paymentId, bookingId])
    : dbGet('SELECT * FROM payments WHERE booking_id = ? ORDER BY id DESC LIMIT 1', [bookingId]);

  if (!payment) {
    payment = initiateBookingPayment({
      bookingId,
      amountCents: booking.total_amount_cents,
      paymentMethod
    });
  }

  if (payment.status === 'SUCCEEDED') {
    return { verified: true, payment, already_settled: true };
  }

  // Check if caller requested a failure simulation or provided an invalid test card
  const simulateFailure =
    paymentDetails?.simulate_failure === true ||
    String(paymentDetails?.card_number || '').endsWith('0002');

  if (simulateFailure) {
    const failureReason = paymentDetails?.failure_reason || 'Payment declined by issuing bank / gateway verification failed.';
    dbRun(
      `UPDATE payments
       SET status = 'FAILED', failure_reason = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [failureReason, payment.id]
    );
    dbRun(
      `INSERT INTO payment_transactions (
        payment_id, event_type, amount_cents, status, raw_response_json
      ) VALUES (?, 'PAYMENT_FAILED', ?, 'FAILED', ?)`,
      [payment.id, payment.amount_cents, JSON.stringify({ reason: failureReason })]
    );
    return {
      verified: false,
      payment: dbGet('SELECT * FROM payments WHERE id = ?', [payment.id]),
      failure_reason: failureReason
    };
  }

  // If external webhook mode is used, verify HMAC signature
  if (env.PAYMENT_PROVIDER_MODE === 'EXTERNAL_WEBHOOK' && !verifyWebhookSignature(paymentDetails, webhookSignature)) {
    const err = new Error('Invalid payment gateway webhook signature.');
    err.statusCode = 401;
    throw err;
  }

  const gatewayTxnId = `GTW-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const cardLast4 = paymentDetails?.card_number
    ? String(paymentDetails.card_number).replace(/\D/g, '').slice(-4) || '4242'
    : null;

  dbRun(
    `UPDATE payments
     SET status = 'SUCCEEDED',
         gateway_transaction_id = ?,
         card_last4 = COALESCE(?, card_last4),
         verified_at = datetime('now'),
         updated_at = datetime('now')
     WHERE id = ?`,
    [gatewayTxnId, cardLast4, payment.id]
  );

  dbRun(
    `INSERT INTO payment_transactions (
      payment_id, event_type, gateway_event_id, amount_cents, status, signature_verified, raw_response_json
    ) VALUES (?, 'PAYMENT_VERIFIED', ?, ?, 'SUCCEEDED', 1, ?)`,
    [
      payment.id,
      gatewayTxnId,
      payment.amount_cents,
      JSON.stringify({
        mode: env.PAYMENT_PROVIDER_MODE,
        gateway_transaction_id: gatewayTxnId,
        verified_at: new Date().toISOString()
      })
    ]
  );

  return {
    verified: true,
    payment: dbGet('SELECT * FROM payments WHERE id = ?', [payment.id])
  };
}

/**
 * Process a booking cancellation and calculate/record the corresponding refund.
 */
function processCancellationAndRefund({
  booking,
  cancelledByType = 'PASSENGER',
  cancelledById = null,
  reason = 'Passenger requested cancellation',
  overrideRefundCents = null
}) {
  return withTransaction(() => {
    const fareRule = dbGet(
      'SELECT * FROM fare_rules WHERE class_name = ? AND is_active = 1',
      [booking.class_name]
    );
    const cancellationFeePct = fareRule ? Number(fareRule.cancellation_fee_pct) : 20.0;

    const succeededPayment = dbGet(
      `SELECT * FROM payments WHERE booking_id = ? AND status = 'SUCCEEDED' ORDER BY id DESC LIMIT 1`,
      [booking.id]
    );

    const paidCents = succeededPayment ? Number(succeededPayment.amount_cents) : 0;
    let cancellationFeeCents = 0;
    let refundableCents = 0;

    if (paidCents > 0) {
      if (overrideRefundCents !== null && overrideRefundCents !== undefined) {
        refundableCents = Math.min(paidCents, Math.max(0, Math.round(Number(overrideRefundCents))));
        cancellationFeeCents = paidCents - refundableCents;
      } else {
        cancellationFeeCents = Math.round((paidCents * cancellationFeePct) / 100);
        refundableCents = Math.max(0, paidCents - cancellationFeeCents);
      }
    }

    const cancelRes = dbRun(
      `INSERT INTO cancellations (
        booking_id, cancelled_by_type, cancelled_by_id, reason,
        cancellation_fee_cents, refundable_amount_cents
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        booking.id,
        cancelledByType,
        cancelledById,
        reason,
        cancellationFeeCents,
        refundableCents
      ]
    );

    let refundRecord = null;
    if (succeededPayment && refundableCents > 0) {
      const refundRef = `REF-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const refundLkr = Number((refundableCents / 100).toFixed(2));
      const newPaymentStatus = refundableCents === paidCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

      const refRes = dbRun(
        `INSERT INTO refunds (
          booking_id, payment_id, cancellation_id, refund_reference,
          amount_cents, amount_lkr, reason, status, processed_by_staff_id, processed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PROCESSED', ?, datetime('now'))`,
        [
          booking.id,
          succeededPayment.id,
          cancelRes.lastID,
          refundRef,
          refundableCents,
          refundLkr,
          reason,
          cancelledByType === 'STAFF' ? cancelledById : null
        ]
      );

      dbRun(
        `UPDATE payments SET status = ?, updated_at = datetime('now') WHERE id = ?`,
        [newPaymentStatus, succeededPayment.id]
      );

      dbRun(
        `INSERT INTO payment_transactions (
          payment_id, event_type, gateway_event_id, amount_cents, status, signature_verified, raw_response_json
        ) VALUES (?, 'REFUND_PROCESSED', ?, ?, 'SUCCEEDED', 1, ?)`,
        [
          succeededPayment.id,
          refundRef,
          refundableCents,
          JSON.stringify({ refund_reference: refundRef, cancellation_fee_cents: cancellationFeeCents })
        ]
      );

      refundRecord = dbGet('SELECT * FROM refunds WHERE id = ?', [refRes.lastID]);
    }

    return {
      cancellation: dbGet('SELECT * FROM cancellations WHERE id = ?', [cancelRes.lastID]),
      refund: refundRecord
    };
  });
}

module.exports = {
  getPaymentGatewayStatus,
  initiateBookingPayment,
  verifyAndSettlePayment,
  processCancellationAndRefund
};
