import { verifyAnyAuthToken } from '../services/sessionService.js';
import { localStore } from '../config/supabase.js';
import { env } from '../config/env.js';

export async function requireAuth(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.headers.cookie) {
      const match = req.headers.cookie.match(/dara_admin_session=([^;]+)/);
      if (match) token = match[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in.',
        requestId: req.id || null,
      });
    }

    const isProduction = env.NODE_ENV === 'production';
    if (isProduction && (token === 'demo-admin-token' || token === 'demo-user-token')) {
      return res.status(401).json({
        success: false,
        error: 'Demo tokens are strictly disabled in production environments.',
        requestId: req.id || null,
      });
    }

    const user = await verifyAnyAuthToken(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session. Please log in again.',
        requestId: req.id || null,
      });
    }

    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Authentication processing failed',
      requestId: req.id || null,
    });
  }
}

export async function optionalAuth(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.headers.cookie) {
      const match = req.headers.cookie.match(/dara_admin_session=([^;]+)/);
      if (match) token = match[1];
    }

    if (token) {
      req.user = await verifyAnyAuthToken(token);
    } else {
      req.user = null;
    }
  } catch (err) {
    req.user = null;
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please log in.',
      requestId: req.id || null,
    });
  }

  if (req.user.role !== 'admin') {
    localStore.logAudit({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'UNAUTHORIZED_ADMIN_ACCESS_ATTEMPT',
      targetResource: req.originalUrl,
      details: { method: req.method },
      ipAddress: req.ip,
    });

    return res.status(403).json({
      success: false,
      error: 'Access denied: Administrator privileges required',
      requestId: req.id || null,
    });
  }

  next();
}
