import { z } from 'zod';

export const productSchema = z
  .object({
    name: z.string().min(1, 'Product name is required').max(200),
    slug: z.string().optional().nullable().or(z.literal('')),
    sku: z.string().optional().nullable().or(z.literal('')),
    product_type: z.string().optional().nullable().default('license_key'),
    inventory_mode: z.string().optional().nullable().default('unique_items'),
    delivery_method: z.string().optional().nullable().default('instant_key'),
    description: z.string().optional().nullable().or(z.literal('')),
    cover_image: z.string().optional().nullable().or(z.literal('')),
    coverImage: z.string().optional().nullable().or(z.literal('')),
    image: z.string().optional().nullable().or(z.literal('')),
    banner_image: z.string().optional().nullable().or(z.literal('')),
    category_id: z.string().optional().nullable().or(z.literal('')),
    platform: z.string().optional().nullable().default('PC'),
    region: z.string().optional().nullable().default('Global'),
    current_price: z.preprocess(
      (val) => (val === '' || val === null || val === undefined ? 0 : Number(val) || 0),
      z.number().min(0, 'Current price must be 0 or greater')
    ),
    comparison_price: z.preprocess(
      (val) => (val === '' || val === null || val === undefined ? null : Number(val)),
      z.number().min(0).optional().nullable()
    ),
    price: z.coerce.number().optional().nullable(),
    currency: z.string().optional().default('USD'),
    is_published: z.boolean().optional().default(true),
    is_featured: z.boolean().optional().default(false),
    low_stock_threshold: z.coerce.number().int().min(0).optional().default(3),
  })
  .passthrough();

export const inventoryImportSchema = z.object({
  product_id: z.string().min(1, 'Product ID is required'),
  keys: z.array(z.string().min(4, 'Key must be at least 4 characters')).min(1, 'At least one key is required'),
});

export const cartItemSchema = z.object({
  product_id: z.string().min(1, 'Product ID is required'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(20, 'Maximum 20 items per product in single order'),
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(20),
});

export const createOrderSchema = z.object({
  customer_email: z.string().email('Valid email address is required').optional().nullable().or(z.literal('')),
  coupon_code: z.string().trim().optional().nullable(),
  payment_method: z.string().default('test_gateway'),
  items: z.array(z.object({
    product_id: z.string().min(1),
    product_name: z.string().optional(),
    unit_price: z.coerce.number().optional(),
    quantity: z.coerce.number().int().min(1).max(20),
  })).min(1, 'Order must contain at least 1 item'),
});

export const couponSchema = z.object({
  code: z.string().min(3).max(30).toUpperCase(),
  discount_type: z.enum(['percentage', 'fixed']),
  discount_value: z.coerce.number().positive('Discount value must be greater than 0'),
  min_spend: z.coerce.number().min(0).default(0),
  max_uses: z.coerce.number().int().positive().optional().nullable(),
  is_active: z.boolean().default(true),
  expires_at: z.string().datetime().optional().nullable(),
});

export const supportTicketSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email('Valid email is required'),
  subject: z.string().min(4).max(150),
  message: z.string().min(10, 'Message must be at least 10 characters').max(2000),
  category: z.string().default('General'),
  order_number: z.string().optional().or(z.literal('')),
});

export const reviewSchema = z.object({
  product_id: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().min(3).max(1000),
});
