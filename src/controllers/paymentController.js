import { PaymentService } from '../services/paymentService.js';
import { OrderService } from '../services/orderService.js';
import { CutLuyService } from '../services/cutluyService.js';

export class PaymentController {
  static async createPaymentSession(req, res, next) {
    try {
      const { order_id, customer_email } = req.body;
      const session = await PaymentService.createPaymentSession(order_id, customer_email);
      res.json({ success: true, data: session });
    } catch (err) {
      next(err);
    }
  }

  static async confirmTestPayment(req, res, next) {
    try {
      const { order_id, transaction_id } = req.body;
      const result = await OrderService.completeOrder(order_id, {
        transactionId: transaction_id || `txn_test_${Date.now()}`,
      });

      res.json({
        success: true,
        data: {
          order: result.order,
          keys: result.assignedKeys,
        },
        message: 'Payment confirmed in Test Mode! Digital keys unlocked.',
      });
    } catch (err) {
      next(err);
    }
  }

  static async handleWebhook(req, res, next) {
    try {
      const rawSignature = req.headers['x-payment-signature'] || req.headers['stripe-signature'];
      const rawPayload = JSON.stringify(req.body);

      // Verify signature
      const isValid = PaymentService.verifyWebhookSignature(rawPayload, rawSignature);
      if (!isValid && process.env.NODE_ENV === 'production') {
        return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
      }

      const result = await PaymentService.handleWebhook(req.body, rawSignature);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  // ============================================================================
  // CutLuy KHQR Auto Payment & Wallet Integration
  // ============================================================================

  /**
   * Create KHQR payment for Order Checkout or Wallet Topup
   * POST /api/payments/cutluy/create
   */
  static async createCutLuyPayment(req, res, next) {
    try {
      const { amount, purpose = 'order', order_id, customer_email } = req.body;
      const userId = req.user ? req.user.id : null;
      const email = customer_email || req.user?.email;

      const result = await CutLuyService.createPayment({
        amount: parseFloat(amount),
        purpose,
        orderId: order_id,
        userId,
        customerEmail: email,
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Check KHQR payment status with auto-fulfillment
   * GET /api/payments/cutluy/status/:id
   */
  static async checkCutLuyStatus(req, res, next) {
    try {
      const { id } = req.params;
      const result = await CutLuyService.checkPaymentStatus(id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Simulate instant payment success for testing / dev
   * POST /api/payments/cutluy/simulate/:id
   */
  static async simulateCutLuyPayment(req, res, next) {
    try {
      const { id } = req.params;
      const result = await CutLuyService.simulatePaymentSuccess(id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Quick wallet topup initiation
   * POST /api/payments/cutluy/topup
   */
  static async topUpWallet(req, res, next) {
    try {
      const { amount } = req.body;
      const userId = req.user ? req.user.id : (req.headers['x-cart-session'] || 'guest');
      const email = req.user?.email || null;

      const result = await CutLuyService.createPayment({
        amount: parseFloat(amount),
        purpose: 'topup',
        userId,
        customerEmail: email,
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get user wallet balance & topup history
   * GET /api/payments/wallet
   */
  static async getWallet(req, res, next) {
    try {
      const userId = req.user ? req.user.id : (req.headers['x-cart-session'] || 'guest');
      const email = req.user?.email || null;
      const result = await CutLuyService.getUserWallet(userId, email);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Handle CutLuy Webhook
   * POST /api/payments/webhook/cutluy or /webhooks/cutluy
   */
  static async handleCutLuyWebhook(req, res, next) {
    try {
      const signature = req.headers['x-cutluy-signature'] || '';
      const rawBody = req.rawBody ? req.rawBody.toString('utf8') : req.body;
      const result = await CutLuyService.handleWebhook(rawBody, signature);
      if (!result.success && result.error?.includes('signature')) {
        return res.status(400).send(result.error);
      }
      res.sendStatus(200);
    } catch (err) {
      next(err);
    }
  }
}
