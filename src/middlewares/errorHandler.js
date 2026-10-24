import { env } from '../config/env.js';

export function errorHandler(err, req, res, next) {
  // Never log raw tokens, passwords, or encryption keys
  console.error(`🚨 [API Error] ${req.method} ${req.originalUrl} [ID: ${req.id || 'N/A'}]:`, err.message || err);

  let status = err.statusCode || err.status;
  if (!status) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('no longer available')) {
      status = 404;
    } else if (msg.includes('already exists') || msg.includes('conflict')) {
      status = 409;
    } else if (msg.includes('stock') || msg.includes('invalid') || msg.includes('required') || msg.includes('cannot') || msg.includes('must be')) {
      status = 400;
    } else if (msg.includes('authentication required') || msg.includes('unauthorized') || msg.includes('not authenticated')) {
      status = 401;
    } else if (msg.includes('access denied') || msg.includes('permission') || msg.includes('forbidden')) {
      status = 403;
    } else {
      status = 500;
    }
  }
  const isProd = env.NODE_ENV === 'production';

  // Sanitize internal database error messages in production
  let userMessage = err.message || 'An unexpected error occurred';
  if (isProd && status === 500) {
    userMessage = 'Internal server error. Please try again later.';
  } else if (isProd && (userMessage.includes('pg_') || userMessage.includes('relation') || userMessage.includes('syntax error'))) {
    userMessage = 'Database service error. Please try again later.';
  }

  res.status(status).json({
    success: false,
    error: userMessage,
    requestId: req.id || null,
    ...(isProd ? {} : { stack: err.stack }),
  });
}
