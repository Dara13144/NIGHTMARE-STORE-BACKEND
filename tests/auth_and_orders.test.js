import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderService } from '../src/services/orderService.js';
import { InventoryService } from '../src/services/inventoryService.js';
import { localStore } from '../src/config/supabase.js';

test('Order Service: applies coupon discount correctly and enforces min spend', () => {
  const result = OrderService.validateCoupon('CYBER15', 100.00);
  assert.equal(result.coupon.code, 'CYBER15');
  assert.equal(result.discountAmount, 15.00);

  // Fails when below minimum spend ($20 for CYBER15)
  assert.throws(() => {
    OrderService.validateCoupon('CYBER15', 10.00);
  }, /minimum order subtotal/i);
});

test('Order & Key Access Security: unauthorized customers cannot view other people\'s keys', async () => {
  // Setup a product and key
  const testProduct = localStore.products[0];
  await InventoryService.importKeys(testProduct.id, ['SECRET-DELIVERED-KEY-999'], 'test-admin');

  // Customer A creates an order
  const { order } = await OrderService.createOrder({
    userId: 'customer-alpha',
    customerEmail: 'alpha@nightcity.io',
    items: [{ product_id: testProduct.id, quantity: 1 }],
  });

  // Complete order
  await OrderService.completeOrder(order.id, { transactionId: 'txn-alpha-123' });

  // Customer B attempts to retrieve Customer A's keys
  const unauthorizedUser = { id: 'customer-bravo', email: 'bravo@nightcity.io', role: 'customer' };

  await assert.rejects(
    async () => {
      await OrderService.getOrderKeys(order.id, unauthorizedUser);
    },
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.ok(err.message.includes('Forbidden'));
      return true;
    }
  );

  // Customer A retrieves their own keys successfully
  const authorizedUser = { id: 'customer-alpha', email: 'alpha@nightcity.io', role: 'customer' };
  const authorizedResult = await OrderService.getOrderKeys(order.id, authorizedUser);

  assert.ok(authorizedResult.keys.length >= 1);
  assert.equal(authorizedResult.orderNumber, order.order_number);
  assert.ok(authorizedResult.keys[0].key.length > 0);
});
