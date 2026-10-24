import { Router } from 'express';
import { ProductController } from '../controllers/productController.js';
import { validateRequest } from '../middlewares/validateMiddleware.js';
import { reviewSchema, supportTicketSchema } from '../validators/schemas.js';
import { optionalAuth, requireAuth } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/categories', ProductController.getCategories);
router.get('/products/categories', ProductController.getCategories);
router.get('/products', ProductController.getProducts);
router.get('/products/:slug', ProductController.getProductBySlug);
router.get('/search', ProductController.search);
router.get('/promo-banner', ProductController.getPromoBanner);

router.post(
  '/reviews',
  requireAuth,
  validateRequest(reviewSchema),
  ProductController.submitReview
);

router.post(
  '/support/ticket',
  optionalAuth,
  validateRequest(supportTicketSchema),
  ProductController.submitSupportTicket
);

export default router;
