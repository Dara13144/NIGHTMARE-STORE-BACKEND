import { Router } from 'express';
import { CartController } from '../controllers/cartController.js';
import { optionalAuth } from '../middlewares/authMiddleware.js';
import { validateRequest } from '../middlewares/validateMiddleware.js';
import { cartItemSchema, updateCartItemSchema } from '../validators/schemas.js';

const router = Router();

router.use(optionalAuth);

router.get('/', CartController.getCart);
router.post('/items', validateRequest(cartItemSchema), CartController.addItem);
router.patch('/items/:id', validateRequest(updateCartItemSchema), CartController.updateQuantity);
router.delete('/items/:id', CartController.removeItem);

export default router;
