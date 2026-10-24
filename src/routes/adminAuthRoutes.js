import express from 'express';
import { adminAuthService } from '../services/adminAuthService.js';
import { authLimiter, otpVerificationLimiter } from '../middlewares/rateLimiter.js';
import { env } from '../config/env.js';

const router = express.Router();

/**
 * Helper to extract admin session token from header or cookie
 */
function extractSessionToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  if (req.headers.cookie) {
    const match = req.headers.cookie.match(/dara_admin_session=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

/**
 * POST /api/admin/auth/login
 * Step 1: Verify email + password -> Generates & sends 6-digit OTP to admin email
 * Rate limited to 10 attempts per 15 minutes per IP
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    const result = await adminAuthService.login({ email, password, ipAddress });
    return res.json(result);
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: err.message || 'Authentication failed',
    });
  }
});

/**
 * POST /api/admin/auth/verify-otp
 * Step 2: Verify 6-digit OTP code -> Issues cryptographically signed admin session token
 * Rate limited to 5 attempts per 5 minutes per IP
 */
router.post('/verify-otp', otpVerificationLimiter, async (req, res) => {
  try {
    const { challengeId, email, otp } = req.body;
    const ipAddress = req.ip || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || '';

    const result = await adminAuthService.verifyOtp({ challengeId, email, otp, ipAddress, userAgent });

    // Set secure HttpOnly cookie
    const isProduction = env.NODE_ENV === 'production';
    res.cookie('dara_admin_session', result.token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
      path: '/',
    });

    return res.json(result);
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message || 'OTP verification failed',
    });
  }
});

/**
 * POST /api/admin/auth/resend-otp
 * Request new 6-digit OTP (subject to 60s cooldown and rate limiter)
 */
router.post('/resend-otp', otpVerificationLimiter, async (req, res) => {
  try {
    const { challengeId } = req.body;
    const ipAddress = req.ip || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    const result = await adminAuthService.resendOtp({ challengeId, ipAddress });
    return res.json(result);
  } catch (err) {
    return res.status(429).json({
      success: false,
      error: err.message || 'Resend cooldown in effect',
    });
  }
});

/**
 * GET /api/admin/auth/me
 * Validate current active admin session
 */
router.get('/me', async (req, res) => {
  try {
    const token = extractSessionToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: 'No admin session active' });
    }

    const isProduction = env.NODE_ENV === 'production';

    // Support legacy demo token only in non-production
    if (token === 'demo-admin-token') {
      if (isProduction) {
        return res.status(401).json({ success: false, error: 'Demo tokens disabled in production' });
      }
      return res.json({
        success: true,
        user: {
          id: 'usr-admin-1',
          email: 'admin@darastore.gg',
          username: 'dara_admin',
          role: 'admin',
        },
      });
    }

    const user = await adminAuthService.getSession(token);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid or expired admin session' });
    }

    return res.json({ success: true, user });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Session check failed' });
  }
});

/**
 * POST /api/admin/auth/logout
 * Destroy admin session and clear cookies
 */
router.post('/logout', async (req, res) => {
  try {
    const token = extractSessionToken(req);
    if (token) {
      await adminAuthService.logout(token);
    }
    res.clearCookie('dara_admin_session', { path: '/' });
    return res.json({ success: true, message: 'Admin logged out' });
  } catch (err) {
    res.clearCookie('dara_admin_session', { path: '/' });
    return res.json({ success: true });
  }
});

export default router;
