import crypto from 'crypto';
import { env } from '../config/env.js';
import { localStore } from '../config/supabase.js';
import { OrderService } from './orderService.js';

export class PaymentService {
  /**
   * Create payment intent / checkout session (clearly labeled Test Mode Gateway)
   */
  static async createPaymentSession(orderId, customerEmail) {
    const order = localStore.orders.find((o) => o.id === orderId || o.order_number === orderId);
    if (!order) throw new Error('Order not found');

    if (order.status === 'completed') {
      throw new Error('Order is already paid and completed');
    }

    const transactionId = `txn_test_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;

    // In production this returns Stripe/PayPal clientSecret or checkout URL.
    // For test mode, we provide a deterministic simulated signature and checkout session token.
    const paymentRecord = {
      id: `pay-${Date.now()}`,
      order_id: order.id,
      payment_provider: 'test_gateway_cyberpunk',
      transaction_id: transactionId,
      amount: order.total_amount,
      currency: order.currency,
      status: 'pending',
      signature_verified: false,
      payload: { mode: 'test_mode', customer_email: customerEmail },
      created_at: new Date(),
    };

    // Calculate signed token for test confirmation
    const signature = crypto
      .createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET)
      .update(`${order.id}:${transactionId}:${order.total_amount}`)
      .digest('hex');

    return {
      testMode: true,
      transactionId,
      amount: order.total_amount,
      currency: order.currency,
      signature,
      message: 'Test Mode Payment Gateway ready. Complete payment with one click.',
    };
  }

  /**
   * Verify HMAC signature of a webhook payload
   */
  static verifyWebhookSignature(payloadString, signatureHeader) {
    if (!signatureHeader) return false;
    try {
      const computed = crypto
        .createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET)
        .update(payloadString)
        .digest('hex');

      return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signatureHeader));
    } catch (err) {
      return false;
    }
  }

  /**
   * Process payment webhook with idempotency check
   */
  static async handleWebhook(payload, rawSignature) {
    const { event, orderId, transactionId, status } = payload;

    // Idempotency check: see if this transaction was already processed
    const existingPayment = localStore.orders.find(
      (o) => o.id === orderId && o.status === 'completed'
    );

    if (existingPayment) {
      return { success: true, message: 'Event already processed (idempotent)', order: existingPayment };
    }

    if (event === 'payment.succeeded' || status === 'succeeded') {
      const result = await OrderService.completeOrder(orderId, { transactionId });
      return { success: true, message: 'Order completed and keys assigned', order: result.order };
    } else if (event === 'payment.failed' || status === 'failed') {
      const result = await OrderService.cancelOrder(orderId, 'Payment failed via webhook');
      return { success: true, message: 'Order cancelled and stock released', order: result };
    }

    return { success: true, message: 'Event ignored' };
  }
}
