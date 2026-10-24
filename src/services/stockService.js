import crypto from 'crypto';
import { supabase, localStore, saveInventoryKeyToSupabase, resolveProductCover } from '../config/supabase.js';
import { encryptGameKey, decryptGameKey, hashValue } from './encryptionService.js';

export class StockService {
  /**
   * Calculate live stock stats for all products or a single product
   */
  static getProductStockStats(product) {
    if (!product) return null;

    const lowThreshold = product.low_stock_threshold ?? 3;
    const inventoryMode = product.inventory_mode || 'unique_items';
    const deliveryMethod = product.delivery_method || 'instant_key';
    const productType = product.product_type || 'license_key';
    const resolvedCoverImage = resolveProductCover(product);

    if (inventoryMode === 'unlimited') {
      return {
        productId: product.id,
        productName: product.name,
        sku: product.sku || `SKU-${product.id.slice(0, 6).toUpperCase()}`,
        coverImage: resolvedCoverImage,
        platform: product.platform || 'Global',
        currentPrice: product.current_price,
        productType,
        inventoryMode,
        deliveryMethod,
        currentStock: 999999,
        availableStock: 999999,
        reservedStock: 0,
        soldStock: 0,
        lowStockThreshold: lowThreshold,
        stockStatus: 'Unlimited',
        statusColor: 'purple',
        lastUpdated: product.updated_at || new Date().toISOString(),
      };
    }

    if (inventoryMode === 'quantity_pool') {
      const totalPool = product.quantity_stock ?? 10;
      // Active non-expired reservations
      const now = new Date();
      const activeReservations = (localStore.stockReservations || []).filter(
        (r) => r.product_id === product.id && r.status === 'active' && new Date(r.expires_at) > now
      );
      const reservedCount = activeReservations.reduce((sum, r) => sum + r.quantity, 0);
      const availableCount = Math.max(0, totalPool - reservedCount);

      // Total sold from orders
      const soldCount = (localStore.orderItems || [])
        .filter((oi) => oi.product_id === product.id)
        .reduce((sum, oi) => sum + oi.quantity, 0);

      let stockStatus = 'In Stock';
      let statusColor = 'green';
      if (availableCount === 0) {
        stockStatus = 'Out of Stock';
        statusColor = 'red';
      } else if (availableCount <= lowThreshold) {
        stockStatus = 'Low Stock';
        statusColor = 'orange';
      }

      return {
        productId: product.id,
        productName: product.name,
        sku: product.sku || `SKU-${product.id.slice(0, 6).toUpperCase()}`,
        coverImage: resolvedCoverImage,
        platform: product.platform || 'Global',
        currentPrice: product.current_price,
        productType,
        inventoryMode,
        deliveryMethod,
        currentStock: totalPool,
        availableStock: availableCount,
        reservedStock: reservedCount,
        soldStock: soldCount,
        lowStockThreshold: lowThreshold,
        stockStatus,
        statusColor,
        lastUpdated: product.updated_at || new Date().toISOString(),
      };
    }

    // Default: unique_items (license keys, digital accounts)
    const canonicalId = product.real_id || product.id;
    const localId = product.id;
    const seenHashes = new Set();
    const productInventory = [];
    for (const inv of (localStore.inventory || [])) {
      if (inv.product_id === localId || inv.product_id === canonicalId) {
        const hash = inv.key_hash || inv.id;
        if (!seenHashes.has(hash)) {
          seenHashes.add(hash);
          productInventory.push(inv);
        }
      }
    }
    const availableCount = productInventory.filter((inv) => inv.status === 'available').length;
    const reservedCount = productInventory.filter((inv) => inv.status === 'reserved').length;
    const soldCount = productInventory.filter((inv) => inv.status === 'sold').length;
    const currentStock = availableCount + reservedCount;

    let stockStatus = 'In Stock';
    let statusColor = 'green';
    if (availableCount === 0 && reservedCount > 0) {
      stockStatus = 'Reserved';
      statusColor = 'blue';
    } else if (availableCount === 0) {
      stockStatus = 'Out of Stock';
      statusColor = 'red';
    } else if (availableCount <= lowThreshold) {
      stockStatus = 'Low Stock';
      statusColor = 'orange';
    }

    return {
      productId: product.id,
      productName: product.name,
      sku: product.sku || `SKU-${product.id.slice(0, 6).toUpperCase()}`,
      coverImage: resolvedCoverImage,
      platform: product.platform || 'Global',
      currentPrice: product.current_price,
      productType,
      inventoryMode,
      deliveryMethod,
      currentStock,
      availableStock: availableCount,
      reservedStock: reservedCount,
      soldStock: soldCount,
      lowStockThreshold: lowThreshold,
      stockStatus,
      statusColor,
      lastUpdated: product.updated_at || new Date().toISOString(),
    };
  }

  /**
   * Bulk add stock across all products (e.g. +5 or +10 auto-generated keys per product)
   */
  static async bulkRestockAllProducts(count = 5, actor = 'admin') {
    const products = localStore.products || [];
    let totalAdded = 0;
    const results = [];

    for (const prod of products) {
      const prefix = prod.name ? prod.name.substring(0, 4).toUpperCase().replace(/[^A-Z]/g, 'KEY') : 'KEY';
      const keys = [];
      for (let i = 0; i < count; i++) {
        const seg1 = Math.random().toString(36).substring(2, 7).toUpperCase();
        const seg2 = Math.random().toString(36).substring(2, 7).toUpperCase();
        const seg3 = Math.random().toString(36).substring(2, 7).toUpperCase();
        keys.push(`${prefix}-${seg1}-${seg2}-${seg3}`);
      }

      try {
        const res = await this.addStock(prod.id, {
          type: 'license_keys',
          items: keys,
          notes: `Bulk restock +${count} keys across all store inventory`,
          actor,
        });
        totalAdded += res.addedCount || count;
        results.push({ productId: prod.id, name: prod.name, added: res.addedCount });
      } catch (e) {
        results.push({ productId: prod.id, name: prod.name, error: e.message });
      }
    }

    return { totalAdded, totalProducts: products.length, results };
  }

  /**
   * Clear all available stock across all products
   * Removes all available keys and resets product quantity_stock to 0.
   * Sold keys and orders are preserved.
   */
  static async clearAllStock(actor = 'admin') {
    const products = localStore.products || [];
    const beforeCount = (localStore.inventory || []).filter((i) => i.status === 'available').length;

    // Filter out available inventory items, keeping only sold/reserved
    localStore.inventory = (localStore.inventory || []).filter((inv) => inv.status !== 'available');

    // Reset quantity_stock to 0 on all products
    for (const prod of products) {
      prod.quantity_stock = 0;
    }

    // Clear active stock reservations
    if (localStore.stockReservations) {
      localStore.stockReservations = localStore.stockReservations.filter((r) => r.status === 'confirmed');
    }

    // Delete from Supabase if connected
    if (supabase) {
      try {
        const { error: delError } = await supabase
          .from('product_inventory')
          .delete()
          .eq('status', 'available');

        if (delError) {
          console.warn('[clearAllStock] Supabase delete warning:', delError.message);
        } else {
          console.log('✅ [clearAllStock] Supabase product_inventory available keys deleted.');
        }
      } catch (err) {
        console.warn('[clearAllStock] Supabase sync error:', err.message);
      }
    }

    // Log movement and audit
    if (!localStore.stockMovements) localStore.stockMovements = [];
    localStore.stockMovements.unshift({
      id: crypto.randomUUID(),
      product_id: 'ALL',
      product_name: 'All Store Products',
      movement_type: 'adjustment',
      quantity: -beforeCount,
      balance_after: 0,
      reference_id: 'CLEAR_ALL',
      performed_by: actor,
      notes: `Cleared all available stock across all products (${beforeCount} keys removed)`,
      created_at: new Date().toISOString(),
    });

    localStore.logAudit({
      actorId: actor,
      actorRole: 'admin',
      action: 'STOCK_CLEARED_ALL',
      targetResource: 'all_products',
      targetId: 'ALL',
      details: { clearedAvailableKeys: beforeCount, affectedProducts: products.length },
    });

    return {
      clearedKeys: beforeCount,
      affectedProducts: products.length,
      currentTotalStock: 0,
    };
  }

  /**
   * Get High-level Stock Overview for Admin Dashboard
   */
  static getStockOverview() {
    const products = localStore.products || [];
    const allStats = products.map((p) => this.getProductStockStats(p));

    const totalProducts = products.length;
    const totalAvailableStock = allStats.reduce(
      (sum, s) => sum + (s.inventoryMode === 'unlimited' ? 0 : s.availableStock),
      0
    );
    const lowStockCount = allStats.filter((s) => s.stockStatus === 'Low Stock').length;
    const outOfStockCount = allStats.filter((s) => s.stockStatus === 'Out of Stock').length;
    const reservedStockCount = allStats.reduce((sum, s) => sum + s.reservedStock, 0);
    const soldStockCount = allStats.reduce((sum, s) => sum + s.soldStock, 0);

    // Recent stock movements
    const movements = [...(localStore.stockMovements || [])]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 15);

    // Stock alerts
    const alerts = allStats
      .filter((s) => s.stockStatus === 'Low Stock' || s.stockStatus === 'Out of Stock')
      .map((s) => ({
        id: `alert-${s.productId}`,
        productId: s.productId,
        productName: s.productName,
        sku: s.sku,
        alertLevel: s.stockStatus === 'Out of Stock' ? 'out_of_stock' : 'low_stock',
        availableStock: s.availableStock,
        threshold: s.lowStockThreshold,
        timestamp: new Date().toISOString(),
      }));

    return {
      metrics: {
        totalProducts,
        totalAvailableStock,
        lowStockProducts: lowStockCount,
        outOfStockProducts: outOfStockCount,
        reservedStock: reservedStockCount,
        soldProducts: soldStockCount,
      },
      stockAlerts: alerts,
      recentMovements: movements,
      productInventoryStats: allStats,
    };
  }

  /**
   * Add stock to product (Supports Digital Keys, Digital Accounts, Download links, and Quantity adjustments)
   */
  static async addStock(productId, { type, items, quantity = 0, notes = '', actor = 'admin' }) {
    const product = (localStore.products || []).find(
      (p) => p.id === productId || p.real_id === productId || p.slug === productId
    );
    if (!product) throw new Error('Product not found');

    const canonicalId = product.real_id || product.id;
    const localId = product.id;

    const added = [];
    const duplicates = [];
    const errors = [];
    let quantityChange = 0;

    if (type === 'license_keys' || type === 'digital_accounts') {
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('No keys or account credentials provided');
      }

      for (const rawEntry of items) {
        let creds = '';
        let metadata = {};
        if (typeof rawEntry === 'string') {
          creds = rawEntry.trim();
        } else if (typeof rawEntry === 'object' && rawEntry !== null) {
          creds = `${rawEntry.username || ''}:${rawEntry.password || ''}`.trim();
          metadata = rawEntry;
        }

        if (!creds || creds.length < 3) {
          errors.push(`Invalid key or account format: "${rawEntry}"`);
          continue;
        }

        // Auto-detect item type: if contains ':' it is a digital account (user:pass), otherwise a license key code
        const isAccount = type === 'digital_accounts' || creds.includes(':');
        const itemType = isAccount ? 'digital_account' : 'license_key';

        const keyHash = hashValue(creds);
        // Collision check across both canonical and local IDs
        const exists = (localStore.inventory || []).some(
          (inv) =>
            (inv.product_id === canonicalId || inv.product_id === localId || inv.product_id === productId) &&
            inv.key_hash === keyHash
        );
        if (exists) {
          duplicates.push(creds);
          continue;
        }

        const encrypted = encryptGameKey(creds);
        const invItem = {
          id: crypto.randomUUID(),
          product_id: canonicalId,
          item_type: itemType,
          encrypted_key: encrypted.encryptedKey,
          key_iv: encrypted.keyIv,
          key_tag: encrypted.keyTag,
          key_hash: encrypted.keyHash,
          status: 'available',
          metadata,
          reserved_at: null,
          reservation_token: null,
          order_item_id: null,
          created_at: new Date(),
          redeemed_at: null,
        };

        localStore.inventory.push(invItem);
        // Also alias in local inventory if product has a legacy localId
        if (localId && localId !== canonicalId) {
          localStore.inventory.push({
            ...invItem,
            id: crypto.randomUUID(),
            product_id: localId,
          });
        }

        await saveInventoryKeyToSupabase(invItem);
        added.push(invItem.id);
      }
      quantityChange = added.length;
    } else if (type === 'quantity_pool' || type === 'manual_adjustment') {
      const qtyNum = parseInt(quantity, 10);
      if (isNaN(qtyNum)) throw new Error('Valid quantity required');

      product.quantity_stock = Math.max(0, (product.quantity_stock || 0) + qtyNum);
      quantityChange = qtyNum;
    }

    product.updated_at = new Date().toISOString();

    // Log Stock Movement
    const movement = {
      id: crypto.randomUUID(),
      product_id: productId,
      product_name: product.name,
      movement_type: type === 'manual_adjustment' ? 'manual_adjustment' : 'import',
      quantity: quantityChange,
      balance_after: this.getProductStockStats(product).availableStock,
      reference_id: `ADD-${Date.now()}`,
      performed_by: actor,
      notes: notes || `Added ${quantityChange} units via ${type}`,
      created_at: new Date().toISOString(),
    };
    if (!localStore.stockMovements) localStore.stockMovements = [];
    localStore.stockMovements.unshift(movement);

    return {
      success: true,
      addedCount: added.length || quantityChange,
      duplicatesCount: duplicates.length,
      errors,
      updatedStock: this.getProductStockStats(product),
    };
  }

  /**
   * Adjust or remove stock (Mark invalid, damaged, or revoke)
   */
  static async adjustStock(productId, { inventoryId, action, reason, actor = 'admin' }) {
    const product = (localStore.products || []).find((p) => p.id === productId);
    if (!product) throw new Error('Product not found');

    if (inventoryId) {
      const invItem = (localStore.inventory || []).find((i) => i.id === inventoryId && i.product_id === productId);
      if (!invItem) throw new Error('Inventory item record not found');

      const prevStatus = invItem.status;
      if (action === 'delete') {
        localStore.inventory = localStore.inventory.filter((i) => i.id !== inventoryId);
      } else if (action === 'revoke' || action === 'damage') {
        invItem.status = 'revoked';
      } else if (action === 'restore_available') {
        invItem.status = 'available';
      }

      const movement = {
        id: crypto.randomUUID(),
        product_id: productId,
        product_name: product.name,
        movement_type: action === 'damage' ? 'damage_marked' : 'manual_adjustment',
        quantity: -1,
        balance_after: this.getProductStockStats(product).availableStock,
        reference_id: inventoryId,
        performed_by: actor,
        notes: reason || `Inventory record status changed from ${prevStatus} to ${action}`,
        created_at: new Date().toISOString(),
      };
      if (!localStore.stockMovements) localStore.stockMovements = [];
      localStore.stockMovements.unshift(movement);

      return { success: true, updatedStock: this.getProductStockStats(product) };
    }

    throw new Error('Inventory ID required for item adjustment');
  }

  /**
   * Atomic stock reservation during checkout intent
   */
  static async reserveStock(productId, quantity, reservationToken, orderId = null) {
    const product = (localStore.products || []).find((p) => p.id === productId);
    if (!product) throw new Error('Product not found');

    const stats = this.getProductStockStats(product);
    if (stats.availableStock < quantity) {
      throw new Error(`Insufficient stock for "${product.name}". Available: ${stats.availableStock}, Requested: ${quantity}`);
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes timeout

    if (product.inventory_mode === 'unique_items') {
      const availableItems = (localStore.inventory || []).filter(
        (inv) => inv.product_id === productId && inv.status === 'available'
      );

      const toReserve = availableItems.slice(0, quantity);
      for (const item of toReserve) {
        item.status = 'reserved';
        item.reservation_token = reservationToken;
        item.reserved_at = new Date();
      }
    }

    const reservation = {
      id: crypto.randomUUID(),
      order_id: orderId,
      product_id: productId,
      quantity,
      status: 'active',
      reservation_token: reservationToken,
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
    };

    if (!localStore.stockReservations) localStore.stockReservations = [];
    localStore.stockReservations.push(reservation);

    return reservation;
  }

  /**
   * Release reservation if order is cancelled or expires
   */
  static async releaseReservation(reservationToken) {
    if (!localStore.stockReservations) return 0;
    const reservation = localStore.stockReservations.find(
      (r) => r.reservation_token === reservationToken && r.status === 'active'
    );

    if (!reservation) return 0;
    reservation.status = 'cancelled';

    // Release unique items
    let releasedCount = 0;
    for (const inv of localStore.inventory || []) {
      if (inv.reservation_token === reservationToken && inv.status === 'reserved') {
        inv.status = 'available';
        inv.reservation_token = null;
        inv.reserved_at = null;
        releasedCount++;
      }
    }

    return releasedCount || reservation.quantity;
  }

  /**
   * Confirm sale & deliver digital product
   */
  static async confirmStockSale(reservationToken, order, orderItem) {
    const reservation = (localStore.stockReservations || []).find(
      (r) => r.reservation_token === reservationToken
    );

    if (reservation) {
      reservation.status = 'confirmed';
      reservation.confirmed_at = new Date().toISOString();
      reservation.order_id = order.id;
    }

    const product = (localStore.products || []).find((p) => p.id === orderItem.product_id);
    const deliveryMethod = product?.delivery_method || 'instant_key';

    let deliveryPayload = {};

    if (deliveryMethod === 'instant_key') {
      // Find reserved keys
      const reservedKeys = (localStore.inventory || []).filter(
        (inv) => inv.reservation_token === reservationToken && inv.product_id === orderItem.product_id
      );

      const decryptedKeys = [];
      for (const inv of reservedKeys) {
        inv.status = 'sold';
        inv.order_item_id = orderItem.id;
        inv.redeemed_at = new Date();
        inv.reservation_token = null;

        const plainKey = decryptGameKey(inv.encrypted_key, inv.key_iv, inv.key_tag);
        decryptedKeys.push(plainKey);
      }

      deliveryPayload = {
        keys: decryptedKeys,
        instructions: product?.activation_instructions || 'Activate on platform.',
      };
    } else if (deliveryMethod === 'account_credentials') {
      const reservedAccounts = (localStore.inventory || []).filter(
        (inv) => inv.reservation_token === reservationToken && inv.product_id === orderItem.product_id
      );

      const decryptedAccounts = [];
      for (const inv of reservedAccounts) {
        inv.status = 'sold';
        inv.order_item_id = orderItem.id;
        inv.redeemed_at = new Date();
        inv.reservation_token = null;

        const plainCreds = decryptGameKey(inv.encrypted_key, inv.key_iv, inv.key_tag);
        const [username, password] = plainCreds.split(':');
        decryptedAccounts.push({
          username: username || 'account_user',
          password: password || '********',
          metadata: inv.metadata || {},
        });
      }

      deliveryPayload = {
        accounts: decryptedAccounts,
        instructions: 'Do not share credentials. Change password immediately after logging in.',
      };
    } else if (deliveryMethod === 'secure_download') {
      const token = crypto.randomBytes(24).toString('hex');
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24hr signed download

      deliveryPayload = {
        downloadToken: token,
        downloadUrl: `/api/downloads/${token}`,
        expiresAt: expires.toISOString(),
        fileName: `${product?.slug || 'digital-item'}.zip`,
      };
    } else {
      deliveryPayload = {
        status: 'pending_manual_fulfillment',
        notes: 'Our support team will deliver this item to your linked Discord/Email within 15 minutes.',
      };
    }

    // Save Digital Delivery Record
    const deliveryRecord = {
      id: crypto.randomUUID(),
      order_id: order.id,
      order_item_id: orderItem.id,
      product_id: orderItem.product_id,
      delivery_type: deliveryMethod,
      delivery_status: deliveryMethod === 'manual_fulfillment' ? 'pending' : 'delivered',
      delivered_payload: deliveryPayload,
      delivered_at: new Date().toISOString(),
    };

    if (!localStore.digitalDeliveries) localStore.digitalDeliveries = [];
    localStore.digitalDeliveries.push(deliveryRecord);

    // Record Stock Movement
    if (!localStore.stockMovements) localStore.stockMovements = [];
    localStore.stockMovements.unshift({
      id: crypto.randomUUID(),
      product_id: orderItem.product_id,
      product_name: product?.name || 'Product',
      movement_type: 'sale',
      quantity: -orderItem.quantity,
      balance_after: this.getProductStockStats(product).availableStock,
      reference_id: order.id,
      performed_by: 'customer_checkout',
      notes: `Order ${order.order_number || order.id} paid. Delivered via ${deliveryMethod}`,
      created_at: new Date().toISOString(),
    });

    return deliveryRecord;
  }
}
