import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { env } from '../src/config/env.js';

test('🔒 Security & Hardening Test Suite', async (t) => {

  await t.test('1. Liveness health check GET /health returns 200 with uptime and correlation ID', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'healthy');
    assert.ok(typeof res.body.uptimeSeconds === 'number');
    assert.ok(res.headers['x-request-id'], 'Response must include x-request-id');
  });

  await t.test('2. Readiness probe GET /ready checks database connectivity', async () => {
    const res = await request(app).get('/ready');
    assert.ok([200, 503].includes(res.status));
    assert.ok(res.body.status === 'ready' || res.body.status === 'degraded');
    assert.ok(res.body.database, 'Must return database health info');
  });

  await t.test('3. Unauthenticated access to admin endpoint returns HTTP 401', async () => {
    const res = await request(app).get('/api/admin/dashboard');
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /Authentication required/i);
  });

  await t.test('4. Non-admin customer token accessing admin endpoint returns HTTP 403', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', 'Bearer demo-user-token');

    // In dev demo-user-token resolves to role: 'customer'
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /Administrator privileges required/i);
  });

  await t.test('5. Critical Helmet security headers are present on all responses', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.ok(!res.headers['x-powered-by'], 'Express header must be concealed');
  });

  await t.test('6. Rejection of oversized JSON request body (Anti-DDoS)', async () => {
    // Generate a payload over 1MB
    const largeData = 'A'.repeat(1.2 * 1024 * 1024);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', payload: largeData });

    // Express json parser rejects payloads over 1MB with HTTP 413 Payload Too Large
    assert.equal(res.status, 413);
  });

  await t.test('7. Safe error responses mask stack traces in production simulation', async () => {
    const prevEnv = env.NODE_ENV;
    env.NODE_ENV = 'production';

    const res = await request(app).get('/api/non-existent-endpoint-404');
    assert.equal(res.status, 404);
    assert.equal(res.body.stack, undefined, 'Stack trace must not leak in production');

    env.NODE_ENV = prevEnv;
  });

  await t.test('8. Strict rejection of demo tokens in production mode', async () => {
    const prevEnv = env.NODE_ENV;
    env.NODE_ENV = 'production';

    // Attempting to use demo-admin-token in production must return 401
    const resAdmin = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', 'Bearer demo-admin-token');

    assert.equal(resAdmin.status, 401);
    assert.match(resAdmin.body.error, /Demo tokens are strictly disabled/i);

    // Attempting dev-login in production must return 403
    const resDevLogin = await request(app)
      .post('/api/auth/dev-login')
      .send({ role: 'customer' });

    assert.equal(resDevLogin.status, 403);
    assert.match(resDevLogin.body.error, /Dev login is strictly forbidden/i);

    env.NODE_ENV = prevEnv;
  });
});
