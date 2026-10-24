import { StockService } from '../services/stockService.js';
import { InventoryService } from '../services/inventoryService.js';
import { localStore } from '../config/supabase.js';

export class StockController {
  /**
   * GET /api/admin/stock/overview
   */
  static async getOverview(req, res) {
    try {
      const overview = StockService.getStockOverview();
      res.json({
        success: true,
        data: overview,
      });
    } catch (err) {
      console.error('[StockController.getOverview]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/admin/stock/products
   */
  static async getStockProducts(req, res) {
    try {
      const { search = '', status = 'all', type = 'all', page = 1, limit = 50 } = req.query;
      const products = localStore.products || [];
      let allStats = products.map((p) => StockService.getProductStockStats(p));

      // Filter search
      if (search) {
        const query = search.toLowerCase();
        allStats = allStats.filter(
          (p) =>
            p.productName.toLowerCase().includes(query) ||
            p.sku.toLowerCase().includes(query) ||
            p.productId.toLowerCase().includes(query)
        );
      }

      // Filter status
      if (status && status !== 'all') {
        allStats = allStats.filter((p) => p.stockStatus.toLowerCase().replace(/\s+/g, '_') === status.toLowerCase());
      }

      // Filter inventory type
      if (type && type !== 'all') {
        allStats = allStats.filter((p) => p.productType.toLowerCase() === type.toLowerCase());
      }

      const total = allStats.length;
      const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
      const paginated = allStats.slice(offset, offset + parseInt(limit, 10));

      res.json({
        success: true,
        data: {
          items: paginated,
          total,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
        },
      });
    } catch (err) {
      console.error('[StockController.getStockProducts]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/admin/stock/products/:id
   */
  static async getProductStock(req, res) {
    try {
      const { id } = req.params;
      const product = (localStore.products || []).find((p) => p.id === id);
      if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }

      const stats = StockService.getProductStockStats(product);

      // Get inventory records (masked for security)
      const inventoryItems = (localStore.inventory || [])
        .filter((inv) => inv.product_id === id)
        .map((inv) => ({
          id: inv.id,
          itemType: inv.item_type || 'license_key',
          status: inv.status,
          maskedKey: inv.key_hash ? '••••-••••-••••-' + inv.key_hash.slice(-4).toUpperCase() : 'PROTECTED_PAYLOAD',
          metadata: inv.metadata || {},
          reservedAt: inv.reserved_at,
          orderItemId: inv.order_item_id,
          createdAt: inv.created_at,
          redeemedAt: inv.redeemed_at,
        }));

      // Get movements for this product
      const movements = (localStore.stockMovements || [])
        .filter((m) => m.product_id === id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      res.json({
        success: true,
        data: {
          product,
          stats,
          inventoryItems,
          movements,
        },
      });
    } catch (err) {
      console.error('[StockController.getProductStock]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/admin/stock/products/:id/add
   */
  static async addProductStock(req, res) {
    try {
      const { id } = req.params;
      const { type, items, quantity, notes } = req.body;
      const actor = req.user?.username || req.user?.email || 'admin';

      const result = await StockService.addStock(id, {
        type,
        items,
        quantity,
        notes,
        actor,
      });

      res.json({
        success: true,
        message: `Successfully added ${result.addedCount} stock units.`,
        data: result,
      });
    } catch (err) {
      console.error('[StockController.addProductStock]:', err);
      res.status(400).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/admin/stock/products/:id/adjust
   */
  static async adjustProductStock(req, res) {
    try {
      const { id } = req.params;
      const { inventoryId, action, reason } = req.body;
      const actor = req.user?.username || req.user?.email || 'admin';

      const result = await StockService.adjustStock(id, {
        inventoryId,
        action,
        reason,
        actor,
      });

      res.json({
        success: true,
        message: 'Stock adjusted successfully',
        data: result,
      });
    } catch (err) {
      console.error('[StockController.adjustProductStock]:', err);
      res.status(400).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/admin/stock/products/:id/history
   */
  static async getProductStockHistory(req, res) {
    try {
      const { id } = req.params;
      const movements = (localStore.stockMovements || [])
        .filter((m) => m.product_id === id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      res.json({
        success: true,
        data: movements,
      });
    } catch (err) {
      console.error('[StockController.getProductStockHistory]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/admin/stock/import (CSV batch import with SKU matching)
   */
  static async importStockCsv(req, res) {
    try {
      const { productId, sku, csvContent, type = 'license_keys' } = req.body;
      let targetProduct = null;

      if (productId) {
        targetProduct = (localStore.products || []).find((p) => p.id === productId);
      } else if (sku) {
        targetProduct = (localStore.products || []).find((p) => p.sku === sku);
      }

      if (!targetProduct) {
        return res.status(404).json({ success: false, error: 'Target product not found by ID or SKU' });
      }

      const rawItems = InventoryService.parseCsvKeys(csvContent);
      if (rawItems.length === 0) {
        return res.status(400).json({ success: false, error: 'No valid key rows found in CSV' });
      }

      const actor = req.user?.username || req.user?.email || 'admin_csv';
      const result = await StockService.addStock(targetProduct.id, {
        type,
        items: rawItems,
        notes: `CSV Import (${rawItems.length} records processed)`,
        actor,
      });

      res.json({
        success: true,
        message: `Import complete: ${result.addedCount} imported, ${result.duplicatesCount} duplicates skipped.`,
        data: {
          productName: targetProduct.name,
          sku: targetProduct.sku,
          ...result,
        },
      });
    } catch (err) {
      console.error('[StockController.importStockCsv]:', err);
      res.status(400).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/admin/stock/restock-all
   */
  static async restockAllProducts(req, res) {
    try {
      const { count = 5 } = req.body;
      const countNum = parseInt(count, 10) || 5;
      const actor = req.user?.username || req.user?.email || 'admin_system';
      const result = await StockService.bulkRestockAllProducts(countNum, actor);
      res.json({
        success: true,
        message: `Successfully added +${countNum} stock keys to all ${result.totalProducts} store products (${result.totalAdded} keys total).`,
        data: result,
      });
    } catch (err) {
      console.error('[StockController.restockAllProducts]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/admin/stock/clear-all
   */
  static async clearAllStock(req, res) {
    try {
      const actor = req.user?.username || req.user?.email || 'admin_system';
      const result = await StockService.clearAllStock(actor);
      res.json({
        success: true,
        message: `Successfully cleared all stock across ${result.affectedProducts} products (${result.clearedKeys} available keys removed). All product stock is now 0.`,
        data: result,
      });
    } catch (err) {
      console.error('[StockController.clearAllStock]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/admin/stock/alerts
   */
  static async getStockAlerts(req, res) {
    try {
      const overview = StockService.getStockOverview();
      res.json({
        success: true,
        data: overview.stockAlerts,
      });
    } catch (err) {
      console.error('[StockController.getStockAlerts]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/products/:id/availability (Public endpoint for real-time customer stock check)
   */
  static async getProductAvailability(req, res) {
    try {
      const { id } = req.params;
      const product = (localStore.products || []).find((p) => p.id === id || p.slug === id);
      if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }

      const stats = StockService.getProductStockStats(product);

      // Return sanitized public info
      res.json({
        success: true,
        data: {
          productId: stats.productId,
          productName: stats.productName,
          stockStatus: stats.stockStatus,
          statusColor: stats.statusColor,
          isAvailable: stats.availableStock > 0 || stats.inventoryMode === 'unlimited',
          availableQuantity: stats.availableStock,
          deliveryMethod: stats.deliveryMethod,
          isLowStock: stats.stockStatus === 'Low Stock',
          published: product.is_published ?? true,
        },
      });
    } catch (err) {
      console.error('[StockController.getProductAvailability]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
