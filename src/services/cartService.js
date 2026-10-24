import { localStore } from '../config/supabase.js';
import { ProductService } from './productService.js';

export class CartService {
  /**
   * Find or create cart by user ID or guest session token
   */
  static getOrCreateCart(userId = null, sessionToken = null) {
    let cart = null;

    if (userId) {
      for (const c of localStore.carts.values()) {
        if (c.user_id === userId) {
          cart = c;
          break;
        }
      }
    } else if (sessionToken) {
      cart = localStore.carts.get(sessionToken) || null;
    }

    if (!cart) {
      const cartId = `cart-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      cart = {
        id: cartId,
        user_id: userId,
        session_token: sessionToken || cartId,
        items: [],
        updated_at: new Date(),
        created_at: new Date(),
      };
      localStore.carts.set(cart.session_token, cart);
    }

    return cart;
  }

  /**
   * Get enriched cart with current verified prices, stock availability, and totals
   */
  static async getCart(userId = null, sessionToken = null) {
    const cart = this.getOrCreateCart(userId, sessionToken);

    let subtotal = 0;
    const validatedItems = [];

    for (const item of cart.items) {
      const product = this.findProduct(item.product_id);
      if (!product) continue;

      const stock = ProductService.calculateStock(product.id, product.low_stock_threshold);
      const unitPrice = product.current_price;
      const quantity = Math.min(item.quantity, Math.max(1, stock.availableStock));
      const itemSubtotal = +(unitPrice * quantity).toFixed(2);

      subtotal += itemSubtotal;

      validatedItems.push({
        id: item.id,
        productId: product.id,
        name: product.name,
        slug: product.slug,
        coverImage: product.cover_image,
        platform: product.platform,
        region: product.region,
        unitPrice,
        comparisonPrice: product.comparison_price,
        quantity,
        availableStock: stock.availableStock,
        stockStatus: stock.stockStatus,
        subtotal: itemSubtotal,
      });
    }

    return {
      id: cart.id,
      sessionToken: cart.session_token,
      items: validatedItems,
      subtotal: +subtotal.toFixed(2),
      itemCount: validatedItems.reduce((acc, curr) => acc + curr.quantity, 0),
    };
  }

  /**
  static findProduct(productId) {
    if (!productId) return null;
    const target = String(productId).trim().toLowerCase();
    return (localStore.products || []).find((p) => {
      if (p.is_published === false) return false;
      const pId = String(p.id || '').toLowerCase();
      const pRealId = String(p.real_id || '').toLowerCase();
      const pSlug = String(p.slug || '').toLowerCase();
      const pName = String(p.name || '').toLowerCase();

      if (pId === target || pRealId === target || pSlug === target || pName === target) return true;
      if ((target === 'prod-fivem-ready' || target.includes('rockstar')) && (pSlug === 'rockstar-account' || pId === 'prod-10' || pName.includes('rockstar'))) return true;
      if ((target === 'prod-gemini-18m' || target.includes('gemini')) && (pSlug.includes('gemini') || pName.includes('gemini'))) return true;
      if ((target === 'prod-nitro-3m' || target.includes('nitro')) && (pSlug.includes('nitro') || pName.includes('nitro'))) return true;
      if ((target === 'prod-mc-group' || target.includes('minecraft')) && (pSlug.includes('minecraft') || pName.includes('minecraft'))) return true;
      return false;
    }) || localStore.products[0];
  }

  /**
   * Add item to cart with stock validation
   */
  static async addItem(userId, sessionToken, productId, quantity = 1) {
    const product = this.findProduct(productId);
    if (!product) {
      throw new Error('Product not found or is currently unavailable');
    }

    const stock = ProductService.calculateStock(product.id, product.low_stock_threshold);
    const availableStock = Math.max(1, stock.availableStock);

    const cart = this.getOrCreateCart(userId, sessionToken);
    const existingIndex = cart.items.findIndex((i) => i.product_id === product.id || i.product_id === productId);

    if (existingIndex >= 0) {
      const newQty = cart.items[existingIndex].quantity + quantity;
      cart.items[existingIndex].quantity = newQty;
      cart.items[existingIndex].product_id = product.id;
    } else {
      cart.items.push({
        id: `citem-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        product_id: product.id,
        quantity,
        created_at: new Date(),
      });
    }

    cart.updated_at = new Date();
    return this.getCart(userId, cart.session_token);
  }

  /**
   * Update item quantity
   */
  static async updateQuantity(userId, sessionToken, itemId, quantity) {
    const cart = this.getOrCreateCart(userId, sessionToken);
    const item = cart.items.find((i) => i.id === itemId || i.product_id === itemId);

    if (!item) {
      // If item was stored locally or session was fresh, locate product and upsert gracefully
      const matchedProduct = this.findProduct(itemId);
      if (matchedProduct && quantity > 0) {
        return this.addItem(userId, sessionToken, matchedProduct.id, quantity);
      }
      return this.getCart(userId, cart.session_token);
    }

    if (quantity <= 0) {
      cart.items = cart.items.filter((i) => i !== item);
      cart.updated_at = new Date();
      return this.getCart(userId, cart.session_token);
    }

    const product = this.findProduct(item.product_id);
    if (!product) {
      cart.items = cart.items.filter((i) => i !== item);
      cart.updated_at = new Date();
      return this.getCart(userId, cart.session_token);
    }

    const stock = ProductService.calculateStock(product.id);
    const safeQty = Math.max(1, Math.min(quantity, Math.max(1, stock.availableStock)));

    item.quantity = safeQty;
    cart.updated_at = new Date();
    return this.getCart(userId, cart.session_token);
  }

  /**
   * Remove item from cart
   */
  static async removeItem(userId, sessionToken, itemId) {
    const cart = this.getOrCreateCart(userId, sessionToken);
    cart.items = cart.items.filter((i) => i.id !== itemId && i.product_id !== itemId);
    cart.updated_at = new Date();
    return this.getCart(userId, cart.session_token);
  }

  /**
   * Clear cart after purchase
   */
  static clearCart(userId, sessionToken) {
    const cart = this.getOrCreateCart(userId, sessionToken);
    cart.items = [];
    cart.updated_at = new Date();
  }
}
