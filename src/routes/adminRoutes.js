import { Router } from 'express';
import { AdminController } from '../controllers/adminController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { requireAdmin } from '../middlewares/adminMiddleware.js';
import { validateRequest } from '../middlewares/validateMiddleware.js';
import { productSchema, couponSchema } from '../validators/schemas.js';

import { adminApiLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

// Enforce rate limiting, authentication & administrator privileges on ALL admin routes
router.use(adminApiLimiter, requireAuth, requireAdmin);

// Dashboard, Search & Notifications
router.get('/dashboard', AdminController.getDashboard);
router.get('/search', AdminController.globalSearch);
router.get('/notifications', AdminController.getNotifications);

// Products
router.get('/products', AdminController.getProducts);
router.post('/products', validateRequest(productSchema), AdminController.createProduct);
router.post('/products/:id/duplicate', AdminController.duplicateProduct);
router.patch('/products/:id', AdminController.updateProduct);
router.put('/products/:id', AdminController.updateProduct);
router.delete('/products/:id', AdminController.deleteProduct);
router.post('/upload-image', AdminController.uploadImage);

// Inventory
router.get('/inventory', AdminController.getInventory);
router.post('/inventory/import', AdminController.importInventory);

// Orders
router.get('/orders', AdminController.getOrders);
router.patch('/orders/:id/status', AdminController.updateOrderStatus);
router.delete('/orders/:id', AdminController.deleteOrder);
router.post('/orders/clear-all', AdminController.clearAllOrders);

// Coupons
router.get('/coupons', AdminController.getCoupons);
router.post('/coupons', validateRequest(couponSchema), AdminController.createCoupon);
router.delete('/coupons/:id', AdminController.deleteCoupon);

// Users
router.get('/users', AdminController.getUsers);
router.patch('/users/:id/role', AdminController.updateUserRole);
router.patch('/users/:id/status', AdminController.updateUserStatus);

// Audit Logs & Settings
router.get('/audit-logs', AdminController.getAuditLogs);
router.get('/settings', AdminController.getSettings);
router.patch('/settings', AdminController.updateSettings);

export default router;
