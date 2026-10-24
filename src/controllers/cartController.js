import { CartService } from '../services/cartService.js';

export class CartController {
  static async getCart(req, res, next) {
    try {
      const userId = req.user ? req.user.id : null;
      const sessionToken = req.headers['x-cart-session'] || null;

      const cart = await CartService.getCart(userId, sessionToken);
      res.json({ success: true, data: cart });
    } catch (err) {
      next(err);
    }
  }

  static async addItem(req, res, next) {
    try {
      const userId = req.user ? req.user.id : null;
      const sessionToken = req.headers['x-cart-session'] || null;
      const { product_id, quantity = 1 } = req.body;

      const cart = await CartService.addItem(userId, sessionToken, product_id, quantity);
      res.json({ success: true, data: cart, message: 'Item added to cart' });
    } catch (err) {
      next(err);
    }
  }

  static async updateQuantity(req, res, next) {
    try {
      const userId = req.user ? req.user.id : null;
      const sessionToken = req.headers['x-cart-session'] || null;
      const { id } = req.params;
      const { quantity } = req.body;

      const cart = await CartService.updateQuantity(userId, sessionToken, id, quantity);
      res.json({ success: true, data: cart });
    } catch (err) {
      next(err);
    }
  }

  static async removeItem(req, res, next) {
    try {
      const userId = req.user ? req.user.id : null;
      const sessionToken = req.headers['x-cart-session'] || null;
      const { id } = req.params;

      const cart = await CartService.removeItem(userId, sessionToken, id);
      res.json({ success: true, data: cart, message: 'Item removed from cart' });
    } catch (err) {
      next(err);
    }
  }
}
