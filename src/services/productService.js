import { supabase, localStore } from '../config/supabase.js';

export class ProductService {
  /**
   * Calculate live stock from inventory records for a product
   * Never invent numbers - count real inventory rows!
   */
  static calculateStock(productId, lowStockThreshold = 3) {
    const allIds = new Set();
    if (productId) allIds.add(productId);

    const prod = (localStore.products || []).find(
      (p) => p.id === productId || p.real_id === productId || p.slug === productId
    );
    if (prod) {
      allIds.add(prod.id);
      if (prod.real_id) allIds.add(prod.real_id);
      const targetCanonical = prod.real_id || prod.id;
      for (const p of localStore.products) {
        if (p.id === targetCanonical || p.real_id === targetCanonical || (prod.real_id && p.real_id === prod.real_id)) {
          allIds.add(p.id);
          if (p.real_id) allIds.add(p.real_id);
        }
      }
    }

    // Deduplicate by key_hash or id to avoid double counting across aliases
    const seen = new Set();
    const uniqueKeys = [];
    for (const inv of localStore.inventory) {
      if (allIds.has(inv.product_id)) {
        const identifier = inv.key_hash || inv.id;
        if (!seen.has(identifier)) {
          seen.add(identifier);
          uniqueKeys.push(inv);
        }
      }
    }

    const total = uniqueKeys.length;
    const available = uniqueKeys.filter((k) => k.status === 'available').length;
    const reserved = uniqueKeys.filter((k) => k.status === 'reserved').length;
    const sold = uniqueKeys.filter((k) => k.status === 'sold').length;

    let stockStatus = 'In Stock';
    if (available === 0) {
      stockStatus = 'Out of Stock';
    } else if (available <= lowStockThreshold) {
      stockStatus = 'Low Stock';
    }

    return {
      totalStock: total,
      availableStock: available,
      reservedStock: reserved,
      soldQuantity: sold,
      stockStatus,
    };
  }

  /**
   * Get all products with filters, search, and live calculated inventory stock
   */
  static async getProducts({
    category = null,
    platform = null,
    search = '',
    sort = 'featured',
    minPrice = null,
    maxPrice = null,
    inStockOnly = false,
    limit = 50,
    offset = 0,
    includeUnpublished = false,
  } = {}) {
    let items = [...localStore.products];

    // Filter out archived products across the entire website
    items = items.filter((p) => !p.is_archived);

    // Filter unpublished if not admin
    if (!includeUnpublished) {
      items = items.filter((p) => p.is_published);
    }

    // Deduplicate aliases so each canonical product only appears once
    const seenProds = new Set();
    const uniqueItems = [];
    for (const p of items) {
      const canonicalKey = p.real_id || p.id;
      if (!seenProds.has(canonicalKey)) {
        seenProds.add(canonicalKey);
        uniqueItems.push(p);
      }
    }
    items = uniqueItems;

    // Category filter
    if (category) {
      const cat = localStore.categories.find((c) => c.slug === category || c.id === category);
      if (cat) {
        items = items.filter((p) => p.category_id === cat.id);
      }
    }

    // Platform filter
    if (platform && platform !== 'All') {
      items = items.filter((p) => p.platform.toLowerCase() === platform.toLowerCase());
    }

    // Search query filter
    if (search && search.trim() !== '') {
      const q = search.toLowerCase().trim();
      items = items.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.platform.toLowerCase().includes(q)
      );
    }

    // Price range filters
    if (minPrice !== null && !isNaN(minPrice)) {
      items = items.filter((p) => p.current_price >= minPrice);
    }
    if (maxPrice !== null && !isNaN(maxPrice)) {
      items = items.filter((p) => p.current_price <= maxPrice);
    }

    // Attach real live inventory counts to each product
    let enriched = items.map((product) => {
      const stock = this.calculateStock(product.id, product.low_stock_threshold || localStore.settings.lowStockThreshold);
      const categoryObj = localStore.categories.find((c) => c.id === product.category_id);
      return {
        ...product,
        category: categoryObj ? { id: categoryObj.id, name: categoryObj.name, slug: categoryObj.slug } : null,
        ...stock,
      };
    });

    // In-stock filter
    if (inStockOnly) {
      enriched = enriched.filter((p) => p.availableStock > 0);
    }

    // Sorting
    switch (sort) {
      case 'price-asc':
        enriched.sort((a, b) => a.current_price - b.current_price);
        break;
      case 'price-desc':
        enriched.sort((a, b) => b.current_price - a.current_price);
        break;
      case 'newest':
        enriched.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        break;
      case 'bestsellers':
        enriched.sort((a, b) => b.soldQuantity - a.soldQuantity);
        break;
      case 'featured':
      default:
        enriched.sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0));
        break;
    }

    const totalCount = enriched.length;
    const paginated = enriched.slice(offset, offset + limit);

    return {
      products: paginated,
      total: totalCount,
      limit,
      offset,
    };
  }

  /**
   * Get single product by slug or ID with stock, category, and verified reviews
   */
  static async getProductBySlug(slugOrId) {
    const product = localStore.products.find((p) => p.slug === slugOrId || p.id === slugOrId);
    if (!product) return null;

    const stock = this.calculateStock(product.id, product.low_stock_threshold || localStore.settings.lowStockThreshold);
    const category = localStore.categories.find((c) => c.id === product.category_id);
    const reviews = localStore.reviews.filter((r) => r.product_id === product.id);

    return {
      ...product,
      category: category ? { id: category.id, name: category.name, slug: category.slug } : null,
      reviews,
      ...stock,
    };
  }

  /**
   * Get all categories with product counts
   */
  static async getCategories() {
    return localStore.categories.map((cat) => {
      const count = localStore.products.filter((p) => p.category_id === cat.id && p.is_published).length;
      return {
        ...cat,
        productCount: count,
      };
    }).sort((a, b) => a.display_order - b.display_order);
  }
}
