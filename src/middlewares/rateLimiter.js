import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Helper to safely extract client IP behind Cloudflare or reverse proxies
 */
export function getClientIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) return cfIp.toString().split(',')[0].trim();

  const xRealIp = req.headers['x-real-ip'];
  if (xRealIp) return xRealIp.toString().split(',')[0].trim();

  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) return xForwardedFor.toString().split(',')[0].trim();

  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Standard security response payload for rate-limit breaches
 */
function createRateLimitHandler(message, retrySeconds) {
  return (req, res) => {
    res.setHeader('Retry-After', retrySeconds);
    return res.status(429).json({
      success: false,
      error: message,
      retryAfterSeconds: retrySeconds,
      requestId: req.id || req.headers['x-request-id'] || null,
    });
  };
}

/**
 * 1. General API Rate Limiter
 * 300 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  handler: createRateLimitHandler(
    'Too many requests from this IP address. Please slow down and try again later.',
    900
  ),
  skip: (req) => {
    // Health, readiness, and public read-only catalog browsing should never be throttled
    if (req.path === '/health' || req.path === '/ready' || req.path === '/api/health') return true;
    if (req.method === 'GET' && (req.path.includes('/products') || req.path.includes('/categories'))) return true;
    return false;
  },
});

/**
 * 2. Strict Authentication Rate Limiter (Login, Register, Password Reset)
 * 10 attempts per 15 minutes per IP to prevent credential stuffing & brute-force
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  handler: createRateLimitHandler(
    'Too many authentication attempts. For your security, this IP has been temporarily throttled. Please try again in 15 minutes.',
    900
  ),
});

/**
 * 3. 2FA / OTP Verification Limiter
 * 5 attempts per 5 minutes to prevent OTP brute-forcing
 */
export const otpVerificationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  handler: createRateLimitHandler(
    'Too many invalid 2FA verification attempts. Verification challenge locked for 5 minutes.',
    300
  ),
});

/**
 * 4. Payment & Checkout Limiter
 * Generous window to prevent automated flood while allowing active users and polling
 */
export const checkoutLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  handler: createRateLimitHandler(
    'Too many transaction requests. Please wait a moment before trying again.',
    60
  ),
});

/**
 * 5. Strict Administrator API Limiter
 * 100 requests per 15 minutes per IP on privileged /api/admin/* endpoints
 */
export const adminApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  handler: createRateLimitHandler(
    'Excessive administrative requests detected. Administrator interface temporarily throttled.',
    900
  ),
});
