import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { authLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

// Profile and Session
router.get('/me', requireAuth, AuthController.getMe);
router.post('/login', authLimiter, AuthController.emailLogin);
router.post('/register', authLimiter, AuthController.emailRegister);
router.post('/dev-login', authLimiter, AuthController.devLogin);
router.post('/logout', AuthController.logout);

// Dynamic OAuth URL generation
router.get('/discord/url', AuthController.getDiscordAuthUrl);
router.post('/discord/callback', authLimiter, AuthController.discordCallback);
router.get('/google/url', AuthController.getGoogleAuthUrl);
router.post('/google/callback', authLimiter, AuthController.googleCallback);
router.post('/google/login', authLimiter, AuthController.googleLogin);

// Direct OAuth initiates (redirects to provider authorization screen)
router.get('/discord', AuthController.directDiscordRedirect);
router.get('/google', AuthController.directGoogleRedirect);

// Direct OAuth callbacks (redirects back to SPA)
router.get('/discord/callback', AuthController.directDiscordCallback);
router.get('/google/callback', AuthController.directGoogleCallback);

// Account Linking & Safe Unlinking
router.get('/linked', requireAuth, AuthController.getLinkedAccounts);
router.post('/unlink', requireAuth, AuthController.unlinkAccount);

export default router;

