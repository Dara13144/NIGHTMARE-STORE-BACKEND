import { Router } from 'express';
import { OrderController } from '../controllers/orderController.js';
import { optionalAuth, requireAuth } from '../middlewares/authMiddleware.js';
import { validateRequest } from '../middlewares/validateMiddleware.js';
import { createOrderSchema } from '../validators/schemas.js';
import { checkoutLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

router.post('/validate-coupon', OrderController.validateCoupon);
router.post('/', checkoutLimiter, optionalAuth, validateRequest(createOrderSchema), OrderController.createOrder);
router.get('/', optionalAuth, OrderController.getOrders);
router.get('/:id', optionalAuth, OrderController.getOrderById);
router.get('/:id/keys', optionalAuth, OrderController.getOrderKeys);

export default router;
