import test from 'node:test';
import assert from 'node:assert/strict';
import { InventoryService } from '../src/services/inventoryService.js';
import { OrderService } from '../src/services/orderService.js';
import { localStore } from '../src/config/supabase.js';

test('Concurrency Safety: Prevents overselling when multiple buyers order simultaneously', async () => {
  // Create a dedicated product with exactly 1 available key in inventory
  const singleKeyProductId = 'prod-concurrency-test';
  localStore.products.push({
    id: singleKeyProductId,
    name: 'Limited Edition Cyber Helmet',
    slug: 'limited-edition-cyber-helmet',
    description: 'Exclusive 1-of-1 digital reward item',
    cover_image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800',
    category_id: 'cat-1',
    platform: 'Steam',
    region: 'Global',
    activation_instructions: 'Redeem on Steam',
    current_price: 99.99,
    currency: 'USD',
    is_published: true,
    is_featured: false,
    low_stock_threshold: 1,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Import exactly 1 key
  await InventoryService.importKeys(singleKeyProductId, ['EXCL-CYBER-1OF1-9999'], 'system-test');

  // Simulate 2 users attempting to purchase this exact item at the exact same time
  const buyer1Promise = OrderService.createOrder({
    userId: 'buyer-1',
    customerEmail: 'buyer1@example.com',
    items: [{ product_id: singleKeyProductId, quantity: 1 }],
  });

  const buyer2Promise = OrderService.createOrder({
    userId: 'buyer-2',
    customerEmail: 'buyer2@example.com',
    items: [{ product_id: singleKeyProductId, quantity: 1 }],
  });

  const results = await Promise.allSettled([buyer1Promise, buyer2Promise]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  assert.equal(fulfilled.length, 1, 'Exactly one buyer should succeed in reserving the single available key');
  assert.equal(rejected.length, 1, 'The competing buyer must be rejected due to insufficient stock');
  assert.ok(
    rejected[0].reason.message.toLowerCase().includes('insufficient stock'),
    'Rejection message must indicate insufficient stock'
  );
});
