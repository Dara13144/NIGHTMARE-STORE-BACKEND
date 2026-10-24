import { Router } from 'express';
import { PaymentController } from '../controllers/paymentController.js';
import { optionalAuth } from '../middlewares/authMiddleware.js';
import { checkoutLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

// Test & generic payments
router.post('/create-session', checkoutLimiter, optionalAuth, PaymentController.createPaymentSession);
router.post('/confirm-test', checkoutLimiter, optionalAuth, PaymentController.confirmTestPayment);
router.post('/webhook', PaymentController.handleWebhook);

// CutLuy KHQR Auto Payments & Wallet Top-up
router.post('/cutluy/create', checkoutLimiter, optionalAuth, PaymentController.createCutLuyPayment);
router.get('/cutluy/status/:id', PaymentController.checkCutLuyStatus);
router.post('/cutluy/simulate/:id', PaymentController.simulateCutLuyPayment);
router.post('/cutluy/topup', checkoutLimiter, optionalAuth, PaymentController.topUpWallet);
router.get('/wallet', optionalAuth, PaymentController.getWallet);
router.post('/webhook/cutluy', PaymentController.handleCutLuyWebhook);

export default router;
