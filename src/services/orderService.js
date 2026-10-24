import crypto from 'crypto';
import { supabase, localStore, saveOrderToSupabase } from '../config/supabase.js';
import { InventoryService } from './inventoryService.js';
import { decryptGameKey } from './encryptionService.js';
import { CartService } from './cartService.js';

export class OrderService {
  /**
   * Validate coupon code and calculate discount amount
   */
  static validateCoupon(code, subtotal) {
    if (!code) return { coupon: null, discountAmount: 0 };

    const coupon = localStore.coupons.find(
      (c) => c.code.toUpperCase() === code.trim().toUpperCase() && c.is_active
    );

    if (!coupon) {
      throw new Error(`Coupon code "${code}" is invalid or inactive`);
    }

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      throw new Error(`Coupon code "${code}" has expired`);
    }

    if (coupon.max_uses && coupon.times_used >= coupon.max_uses) {
      throw new Error(`Coupon code "${code}" has reached its maximum redemptions`);
    }

    if (subtotal < coupon.min_spend) {
      throw new Error(
        `Coupon code requires a minimum order subtotal of $${coupon.min_spend.toFixed(2)}`
      );
    }

    let discountAmount = 0;
    if (coupon.discount_type === 'percentage') {
      discountAmount = +(subtotal * (coupon.discount_value / 100)).toFixed(2);
    } else {
      discountAmount = Math.min(coupon.discount_value, subtotal);
    }

    return { coupon, discountAmount: +discountAmount.toFixed(2) };
  }

  /**
   * Create an order with atomic key reservation
   * Never trusts prices or quantities from the frontend!
   */
  static async createOrder({ userId, customerEmail, items, couponCode, paymentMethod = 'test_gateway', sessionToken = null }) {
    if (!items || items.length === 0) {
      throw new Error('Order must contain at least one product');
    }

    // 1. Calculate and verify real prices and stock
    let subtotal = 0;
    const validatedItems = [];

    for (const reqItem of items) {
      const reqId = String(reqItem.product_id || '').toLowerCase();
      const reqName = String(reqItem.product_name || '').toLowerCase();

      const product = localStore.products.find((p) => {
        if (p.is_published === false) return false;
        const pId = String(p.id || '').toLowerCase();
        const pRealId = String(p.real_id || '').toLowerCase();
        const pSlug = String(p.slug || '').toLowerCase();
        const pName = String(p.name || '').toLowerCase();

        if (pId === reqId || pRealId === reqId || pSlug === reqId) return true;
        if (reqItem.slug && pSlug === String(reqItem.slug).toLowerCase()) return true;
        if (reqName && pName === reqName) return true;

        // FiveM Ready / Rockstar Account alias
        if (
          (reqId === 'prod-fivem-ready' || reqId === 'prod-10' || reqId.includes('fivem-ready') || reqId.includes('rockstar')) &&
          (pId === 'prod-10' || pRealId === '10000000-0000-0000-0000-000000000010' || pSlug === 'rockstar-account' || pName.includes('rockstar'))
        ) {
          return true;
        }

        // Minecraft Account alias
        if (
          (reqId === 'prod-mc' || reqId === 'prod-20') &&
          (pSlug.includes('minecraft') || pName.includes('minecraft'))
        ) {
          return true;
        }

        return false;
      }) || (reqItem.product_id === 'prod-1' ? localStore.products[0] : null);

      if (!product) {
        throw new Error(`Product ${reqItem.product_id} is no longer available`);
      }

      const qty = Math.max(1, parseInt(reqItem.quantity, 10));
      const lineSubtotal = +(product.current_price * qty).toFixed(2);
      subtotal += lineSubtotal;

      validatedItems.push({
        product_id: product.id,
        product_name: product.name,
        unit_price: product.current_price,
        quantity: qty,
        subtotal: lineSubtotal,
      });
    }

    subtotal = +subtotal.toFixed(2);

    // 2. Validate coupon and calculate discount
    const { coupon, discountAmount } = this.validateCoupon(couponCode, subtotal);
    const totalAmount = Math.max(0, +(subtotal - discountAmount).toFixed(2));

    // 3. Atomically reserve keys with a reservation token
    const reservationToken = `resv-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    await InventoryService.reserveKeysForOrder(validatedItems, reservationToken);

    // 4. Create Order Record
    const orderId = crypto.randomUUID();
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const orderNumber = `DARA-${randomSuffix}`;

    const isWalletPayment = paymentMethod === 'balance' || paymentMethod === 'wallet_balance';
    let newWalletBalance = null;

    if (isWalletPayment) {
      const { CutLuyService } = await import('./cutluyService.js');
      const deductRes = await CutLuyService.deductUserWallet({
        userId,
        email: customerEmail,
        amount: totalAmount,
        orderId,
        description: `Purchase: ${validatedItems[0]?.product_name || 'Store Item'} (${orderNumber})`,
      });
      newWalletBalance = deductRes.newBalance;
    }

    const order = {
      id: orderId,
      order_number: orderNumber,
      user_id: userId || null,
      customer_email: customerEmail,
      subtotal,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      currency: 'USD',
      status: isWalletPayment ? 'completed' : 'pending',
      payment_method: isWalletPayment ? 'wallet_balance' : paymentMethod,
      coupon_id: coupon ? coupon.id : null,
      reservation_token: reservationToken,
      created_at: new Date(),
      updated_at: new Date(),
    };

    // 5. Create Order Items
    const createdItems = [];
    for (const vi of validatedItems) {
      const orderItemId = crypto.randomUUID();
      const orderItem = {
        id: orderItemId,
        order_id: orderId,
        product_id: vi.product_id,
        product_name: vi.product_name,
        unit_price: vi.unit_price,
        quantity: vi.quantity,
        subtotal: vi.subtotal,
        created_at: new Date(),
      };
      localStore.orderItems.push(orderItem);
      createdItems.push(orderItem);
    }

    let assignedKeys = [];
    if (isWalletPayment) {
      assignedKeys = await InventoryService.completeKeyAssignment(reservationToken, createdItems);
      localStore.orders.push(order);
      await saveOrderToSupabase(order, createdItems, assignedKeys);

      localStore.logAudit({
        actorId: userId,
        actorRole: 'customer',
        action: 'ORDER_COMPLETED',
        targetResource: 'orders',
        targetId: order.id,
        details: {
          orderNumber: order.order_number,
          totalAmount: order.total_amount,
          keysAssigned: assignedKeys.length,
          paymentMethod: 'wallet_balance',
        },
      });
    } else {
      localStore.orders.push(order);
      await saveOrderToSupabase(order, createdItems);
    }

    if (coupon) {
      coupon.times_used += 1;
    }

    // Clear user cart upon successful order creation
    if (sessionToken) {
      CartService.clearCart(userId, sessionToken);
    }

    return {
      order,
      orderItems: createdItems,
      assignedKeys,
      newBalance: newWalletBalance,
      reservationToken,
    };
  }

  /**
   * Finalize order after verified payment
   */
  static async completeOrder(orderId, paymentDetails = {}) {
    const order = localStore.orders.find((o) => o.id === orderId || o.order_number === orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status === 'completed') {
      return { order, alreadyCompleted: true };
    }

    const orderItems = localStore.orderItems.filter((i) => i.order_id === order.id);

    // Complete key assignment atomically
    const assignedKeys = await InventoryService.completeKeyAssignment(order.reservation_token, orderItems);

    order.status = 'completed';
    order.updated_at = new Date();

    await saveOrderToSupabase(order, orderItems, assignedKeys);

    localStore.logAudit({
      actorId: order.user_id,
      actorRole: 'customer',
      action: 'ORDER_COMPLETED',
      targetResource: 'orders',
      targetId: order.id,
      details: {
        orderNumber: order.order_number,
        totalAmount: order.total_amount,
        keysAssigned: assignedKeys.length,
      },
    });

    return { order, assignedKeys };
  }

  /**
   * Cancel order and release reserved stock
   */
  static async cancelOrder(orderId, reason = 'Customer cancelled or payment expired') {
    const order = localStore.orders.find((o) => o.id === orderId || o.order_number === orderId);
    if (!order) throw new Error('Order not found');

    if (order.status === 'completed') {
      throw new Error('Cannot cancel a completed order');
    }

    if (order.reservation_token) {
      await InventoryService.releaseReservation(order.reservation_token);
    }

    order.status = 'cancelled';
    order.updated_at = new Date();

    localStore.logAudit({
      actorId: order.user_id,
      actorRole: 'customer',
      action: 'ORDER_CANCELLED',
      targetResource: 'orders',
      targetId: order.id,
      details: { reason },
    });

    return order;
  }

  /**
   * Get orders for a user or admin
   */
  static async getOrders({ userId = null, userEmail = null, status = null, limit = 50, offset = 0, isAdmin = false }) {
    let list = [...localStore.orders];

    if (!isAdmin) {
      if (!userId && !userEmail) return { orders: [], total: 0 };
      list = list.filter((o) => (userId && o.user_id === userId) || (userEmail && o.customer_email === userEmail));
    } else if (userId || userEmail) {
      list = list.filter((o) => (userId && o.user_id === userId) || (userEmail && o.customer_email === userEmail));
    }

    if (status && status !== 'all') {
      list = list.filter((o) => o.status === status);
    }

    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = list.length;
    const paginated = list.slice(offset, offset + limit);

    const enriched = await Promise.all(
      paginated.map(async (ord) => {
        const items = localStore.orderItems.filter((i) => i.order_id === ord.id);
        let deliveredKeys = [];
        if (ord.status === 'completed' || ord.status === 'paid') {
          try {
            const keyResult = await OrderService.getOrderKeys(ord.id, {
              id: ord.user_id,
              email: ord.customer_email,
              role: 'admin',
            });
            deliveredKeys = keyResult?.keys || [];
          } catch (e) {
            // ignore
          }
        }
        return {
          ...ord,
          items,
          keys: deliveredKeys,
          itemCount: items.reduce((acc, curr) => acc + curr.quantity, 0),
        };
      })
    );

    return { orders: enriched, total, limit, offset };
  }

  /**
   * Get order by ID with ownership verification
   */
  static async getOrderById(orderId, user = null) {
    const order = localStore.orders.find((o) => o.id === orderId || o.order_number === orderId);
    if (!order) return null;

    // Security check: only order owner or admin can view
    const isOwner = user && (user.id === order.user_id || user.email === order.customer_email);
    const isAdmin = user && user.role === 'admin';
    const isGuest = !order.user_id;

    if (!isOwner && !isAdmin && !isGuest) {
      const err = new Error('Access denied: You do not have permission to view this order');
      err.statusCode = 403;
      throw err;
    }

    const items = localStore.orderItems.filter((i) => i.order_id === order.id);

    return {
      ...order,
      items,
    };
  }

  /**
   * Retrieve purchased digital keys for an order (Strict authorization!)
   */
  static async getOrderKeys(orderId, user) {
    const order = localStore.orders.find((o) => o.id === orderId || o.order_number === orderId);
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    const isOwner = user && (user.id === order.user_id || user.email === order.customer_email);
    const isAdmin = user && user.role === 'admin';
    const isGuest = !order.user_id;

    if (!isOwner && !isAdmin && !isGuest) {
      const err = new Error('Forbidden: You can only access digital keys from your own paid orders');
      err.statusCode = 403;
      throw err;
    }

    if (order.status !== 'completed' && order.status !== 'paid') {
      const err = new Error('Digital keys are only accessible after order payment is verified and completed');
      err.statusCode = 400;
      throw err;
    }

    const orderItems = localStore.orderItems.filter((i) => i.order_id === order.id);
    const deliveredKeys = [];

    for (const item of orderItems) {
      const product = (localStore.products || []).find((p) => p.id === item.product_id || p.real_id === item.product_id);
      let inventoryRows = (localStore.inventory || []).filter((inv) => inv.order_item_id === item.id);

      // Fallback query to Supabase if not in local memory
      if (inventoryRows.length === 0 && supabase) {
        try {
          const { data: dbInv } = await supabase.from('product_inventory').select('*').eq('order_item_id', item.id);
          if (Array.isArray(dbInv) && dbInv.length > 0) {
            inventoryRows = dbInv;
          }
        } catch (e) {
          console.warn('Supabase getOrderKeys query error:', e.message);
        }
      }

      // Deduplicate in case an in-memory alias shares the same key_hash
      const seenInvHashes = new Set();
      const uniqueInvRows = [];
      for (const inv of inventoryRows) {
        const hash = inv.key_hash || inv.id;
        if (!seenInvHashes.has(hash)) {
          seenInvHashes.add(hash);
          uniqueInvRows.push(inv);
        }
      }

      for (const inv of uniqueInvRows) {
        // Decrypt key specifically for this verified request
        const plainKey = decryptGameKey(inv.encrypted_key, inv.key_iv, inv.key_tag);

        const isAccount = inv.item_type === 'digital_account' || plainKey.includes(':');
        const itemType = isAccount ? 'digital_account' : 'license_key';
        let accountDetails = null;

        if (isAccount && plainKey.includes(':')) {
          const firstColon = plainKey.indexOf(':');
          accountDetails = {
            username: plainKey.slice(0, firstColon).trim(),
            password: plainKey.slice(firstColon + 1).trim(),
          };
        }

        deliveredKeys.push({
          keyId: inv.id,
          productId: product?.id || item.product_id,
          productName: product?.name || item.product_name || 'Digital Key Product',
          platform: product?.platform || 'Digital',
          region: product?.region || 'Global',
          coverImage: product?.cover_image || null,
          activationInstructions: product?.activation_instructions || '',
          key: plainKey,
          itemType,
          accountDetails,
          redeemedAt: inv.redeemed_at,
        });
      }
    }

    return {
      orderNumber: order.order_number,
      status: order.status,
      keys: deliveredKeys,
    };
  }
}
