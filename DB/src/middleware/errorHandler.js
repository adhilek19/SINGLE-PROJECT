import { logger } from '../utils/logger.js';

// ─── Specific error normalizers ────────────────────────────────

const handleDuplicateKey = (err) => {
  const field = Object.keys(err.keyValue)[0];
  return { statusCode: 409, message: `${field} already exists` };
};

const handleValidationError = (err) => {
  const messages = Object.values(err.errors).map((e) => e.message);
  return { statusCode: 422, message: messages.join(', ') };
};

const handleCastError = (err) => ({
  statusCode: 400,
  message: `Invalid ${err.path || 'id'} value`,
});

const handleJWTError    = () => ({ statusCode: 401, message: 'Invalid token. Please log in again.' });
const handleJWTExpired  = () => ({ statusCode: 401, message: 'Token expired. Please log in again.' });

// ─── 404 handler ───────────────────────────────────────────────

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
};

// ─── Global error handler ──────────────────────────────────────

export const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message    = err.message    || 'Something went wrong';

  // FIX #6 – Removed AI-agent telemetry beacon that was POSTing error details
  // to http://127.0.0.1:7712/ingest/... on every error. That code was
  // instrumentation accidentally committed from an agentic debugging session.

  // Normalise known Mongoose / JWT error types
  if (err.code === 11000)               ({ statusCode, message } = handleDuplicateKey(err));
  if (err.name === 'ValidationError')   ({ statusCode, message } = handleValidationError(err));
  if (err.name === 'CastError')         ({ statusCode, message } = handleCastError(err));
  if (err.name === 'JsonWebTokenError') ({ statusCode, message } = handleJWTError());
  if (err.name === 'TokenExpiredError') ({ statusCode, message } = handleJWTExpired());

  const isOperational = err.isOperational === true || statusCode < 500;

  if (isOperational) {
    logger.warn(`[${req.requestId}] ${statusCode} - ${message}`);
  } else {
    logger.error({
      message,
      statusCode,
      requestId: req.requestId,
      path:      req.path,
      method:    req.method,
      stack:     err.stack,
    });
  }

  const isProd = process.env.NODE_ENV === 'production';

  res.status(statusCode).json({
    success: false,
    message: isProd && !isOperational ? 'Server error. Please try again.' : message,
    ...(isProd ? {} : { stack: err.stack }),
  });
};
