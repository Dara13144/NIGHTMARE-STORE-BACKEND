import { OrderService } from '../services/orderService.js';

export class OrderController {
  static async createOrder(req, res, next) {
    try {
      const userId = req.user ? req.user.id : null;
      const sessionToken = req.headers['x-cart-session'] || null;
      const { customer_email, items, coupon_code, payment_method } = req.body;

      const result = await OrderService.createOrder({
        userId,
        customerEmail: customer_email || req.user?.email,
        items,
        couponCode: coupon_code,
        paymentMethod: payment_method || 'test_gateway',
        sessionToken,
      });

      res.status(201).json({
        success: true,
        data: {
          order: result.order,
          items: result.orderItems,
          assignedKeys: result.assignedKeys || [],
          newBalance: result.newBalance !== null ? result.newBalance : undefined,
        },
        message: result.order.status === 'completed'
          ? 'Order completed successfully with wallet balance. Keys delivered!'
          : 'Order created successfully. Keys reserved.',
      });
    } catch (err) {
      next(err);
    }
  }

  static async getOrders(req, res, next) {
    try {
      const userId = req.user ? req.user.id : null;
      const isAdmin = req.user?.role === 'admin';
      const { status, limit = 20, offset = 0 } = req.query;

      const result = await OrderService.getOrders({
        userId,
        status,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        isAdmin,
      });

      res.json({
        success: true,
        data: result.orders,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async getOrderById(req, res, next) {
    try {
      const { id } = req.params;
      const order = await OrderService.getOrderById(id, req.user);

      if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }

      res.json({ success: true, data: order });
    } catch (err) {
      next(err);
    }
  }

  static async getOrderKeys(req, res, next) {
    try {
      const { id } = req.params;
      const result = await OrderService.getOrderKeys(id, req.user);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async validateCoupon(req, res, next) {
    try {
      const { code, subtotal } = req.body;
      const result = OrderService.validateCoupon(code, parseFloat(subtotal) || 0);

      res.json({
        success: true,
        data: {
          code: result.coupon.code,
          discountType: result.coupon.discount_type,
          discountValue: result.coupon.discount_value,
          discountAmount: result.discountAmount,
        },
        message: `Coupon applied: -$${result.discountAmount.toFixed(2)}`,
      });
    } catch (err) {
      next(err);
    }
  }
}
