import { Router } from 'express';
import { StockController } from '../controllers/stockController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requireAdmin } from '../middlewares/adminMiddleware.js';

const router = Router();

// Public availability check
router.get('/products/:id/availability', StockController.getProductAvailability);

// Admin-only Stock Management routes
router.use('/admin/stock', requireAuth, requireAdmin);

router.get('/admin/stock/overview', StockController.getOverview);
router.get('/admin/stock/products', StockController.getStockProducts);
router.get('/admin/stock/products/:id', StockController.getProductStock);
router.post('/admin/stock/products/:id/add', StockController.addProductStock);
router.post('/admin/stock/products/:id/adjust', StockController.adjustProductStock);
router.get('/admin/stock/products/:id/history', StockController.getProductStockHistory);
router.post('/admin/stock/import', StockController.importStockCsv);
router.post('/admin/stock/restock-all', StockController.restockAllProducts);
router.post('/admin/stock/clear-all', StockController.clearAllStock);
router.get('/admin/stock/alerts', StockController.getStockAlerts);

export default router;
