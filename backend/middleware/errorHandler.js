/**
 * Centralized error-handling middleware.
 */
function errorHandler(err, _req, res, _next) {
  const statusCode = err.statusCode || (err.message && err.message.includes('UNIQUE constraint') ? 409 : 500);
  const safeMessage =
    statusCode === 409
      ? 'A record with the provided unique identifier already exists.'
      : err.expose || statusCode < 500
      ? err.message
      : err.message || 'An unexpected server error occurred.';

  res.status(statusCode).json({
    success: false,
    error: safeMessage
  });
}

module.exports = { errorHandler };
