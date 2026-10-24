import { localStore } from '../config/supabase.js';

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
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
    });
  }

  next();
}
