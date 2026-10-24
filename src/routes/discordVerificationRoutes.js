import { Router } from 'express';
import { DiscordVerificationController } from '../controllers/discordVerificationController.js';
import { requireAuth, optionalAuth, requireAdmin } from '../middlewares/authMiddleware.js';
import { authLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

// Member Verification Endpoints
router.get('/verification/status', optionalAuth, DiscordVerificationController.getVerificationStatus);
router.post('/verification/start', optionalAuth, authLimiter, DiscordVerificationController.startVerification);
router.post('/verification/complete', optionalAuth, authLimiter, DiscordVerificationController.completeVerification);

// Admin Management Endpoints
router.get('/admin/verifications', requireAuth, requireAdmin, DiscordVerificationController.getAdminVerifications);
router.post('/admin/panel', requireAuth, requireAdmin, DiscordVerificationController.postAdminPanel);

export default router;
