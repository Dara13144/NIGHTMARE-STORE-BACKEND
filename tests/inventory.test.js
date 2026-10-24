import test from 'node:test';
import assert from 'node:assert/strict';
import { InventoryService } from '../src/services/inventoryService.js';
import { ProductService } from '../src/services/productService.js';
import { localStore } from '../src/config/supabase.js';

test('Inventory Service: rejects duplicates in CSV and bulk key imports', async () => {
  const testProductId = 'prod-1';
  const initialAvailable = ProductService.calculateStock(testProductId).availableStock;

  // Import batch with internal duplicates and unique keys
  const batch = [
    'TEST-UNIQUE-KEY-AAAA',
    'TEST-UNIQUE-KEY-BBBB',
    'TEST-UNIQUE-KEY-AAAA', // duplicate within batch
  ];

  const result1 = await InventoryService.importKeys(testProductId, batch, 'test-admin');
  assert.equal(result1.imported, 2, 'Should import exactly 2 unique keys');
  assert.equal(result1.duplicates, 1, 'Should detect 1 internal duplicate');

  // Re-importing same key should be rejected as an existing inventory duplicate
  const result2 = await InventoryService.importKeys(testProductId, ['TEST-UNIQUE-KEY-AAAA'], 'test-admin');
  assert.equal(result2.imported, 0, 'Duplicate key must be rejected');
  assert.equal(result2.duplicates, 1, 'Should flag 1 duplicate');
});

test('Inventory Service: admin inventory endpoint returns masked keys and never raw keys', async () => {
  const result = await InventoryService.getInventoryList({ limit: 10 });
  assert.ok(result.items.length > 0);

  for (const item of result.items) {
    assert.ok(item.maskedKey.startsWith('••••'), 'Key preview must be masked');
    assert.ok(!item.encrypted_key, 'Must not expose raw encrypted ciphertext in item view');
  }
});

test('Product Service: calculates stock accurately from real inventory rows', () => {
  const stock = ProductService.calculateStock('prod-4', 5);
  assert.equal(typeof stock.totalStock, 'number');
  assert.equal(typeof stock.availableStock, 'number');
  assert.ok(['In Stock', 'Low Stock', 'Out of Stock'].includes(stock.stockStatus));
});
