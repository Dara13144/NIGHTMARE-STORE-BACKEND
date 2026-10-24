import { ProductService } from '../services/productService.js';
import { localStore } from '../config/supabase.js';

export class ProductController {
  static async getProducts(req, res, next) {
    try {
      const {
        category,
        platform,
        search,
        sort,
        minPrice,
        maxPrice,
        inStock,
        limit = 24,
        offset = 0,
      } = req.query;

      const result = await ProductService.getProducts({
        category,
        platform,
        search,
        sort,
        minPrice: minPrice ? parseFloat(minPrice) : null,
        maxPrice: maxPrice ? parseFloat(maxPrice) : null,
        inStockOnly: inStock === 'true',
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      });

      res.json({
        success: true,
        data: result.products,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async getProductBySlug(req, res, next) {
    try {
      const { slug } = req.params;
      const product = await ProductService.getProductBySlug(slug);

      if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }

      res.json({
        success: true,
        data: product,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getCategories(req, res, next) {
    try {
      const categories = await ProductService.getCategories();
      res.json({ success: true, data: categories });
    } catch (err) {
      next(err);
    }
  }

  static async search(req, res, next) {
    try {
      const { q = '', limit = 8 } = req.query;
      const result = await ProductService.getProducts({
        search: q,
        limit: parseInt(limit, 10),
      });

      res.json({
        success: true,
        data: result.products.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          coverImage: p.cover_image,
          platform: p.platform,
          currentPrice: p.current_price,
          availableStock: p.availableStock,
          stockStatus: p.stockStatus,
        })),
      });
    } catch (err) {
      next(err);
    }
  }

  static async submitReview(req, res, next) {
    try {
      const { product_id, rating, comment } = req.body;
      const userId = req.user ? req.user.id : 'usr-cust-1';
      const userName = req.user ? (req.user.displayName || req.user.username) : 'CyberGamer';

      const review = {
        id: `rev-${Date.now()}`,
        product_id,
        user_id: userId,
        user_name: userName,
        rating: parseInt(rating, 10),
        comment,
        is_verified_purchase: true,
        created_at: new Date(),
      };

      localStore.reviews.unshift(review);

      res.status(201).json({ success: true, data: review });
    } catch (err) {
      next(err);
    }
  }

  static async submitSupportTicket(req, res, next) {
    try {
      const { name, email, subject, message, category, order_number } = req.body;
      const ticket = {
        id: `tkt-${Date.now()}`,
        user_id: req.user ? req.user.id : null,
        name,
        email,
        subject,
        message,
        category: category || 'General',
        order_number: order_number || null,
        status: 'open',
        created_at: new Date(),
      };

      localStore.tickets.unshift(ticket);

      res.status(201).json({
        success: true,
        data: ticket,
        message: 'Support ticket received. Our team will review and reply within 24 hours.',
      });
    } catch (err) {
      next(err);
    }
  }

  static async getPromoBanner(req, res, next) {
    try {
      const banner = localStore.settings?.promoBanner || {
        enabled: true,
        title: 'NightmareStore',
        subtitle: 'Official Nightmare Gang Store',
        code: 'NIGHTMARE',
        discountPercent: 15,
        buttonText: 'CHECKOUT NOW!',
        targetUrl: '/products',
        imageUrl: '/nightmare-promo-banner.png',
        badgeText: 'CODE NIGHTMARE',
      };
      res.json({ success: true, data: banner });
    } catch (err) {
      next(err);
    }
  }
}
