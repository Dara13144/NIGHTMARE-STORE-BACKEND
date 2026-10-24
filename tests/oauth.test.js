import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthController } from '../src/controllers/authController.js';
import { localStore } from '../src/config/supabase.js';

test('OAuth Auth: Google Login creates or links user and returns valid token', async () => {
  const req = {
    body: {
      email: 'test.player@gmail.com',
      name: 'Test Player',
      google_id: 'goog-999888777',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100',
    },
    ip: '127.0.0.1',
  };

  let responseData = null;
  const res = {
    json: (data) => {
      responseData = data;
      return res;
    },
    status: () => res,
  };

  await AuthController.googleLogin(req, res);

  assert.ok(responseData.success);
  assert.equal(responseData.user.email, 'test.player@gmail.com');
  assert.equal(responseData.user.provider, 'google');
  assert.ok(responseData.token.startsWith('demo-user-') || responseData.token.startsWith('usr-tok-'));
});

test('OAuth Auth: Discord callback creates linked profile and issues customer session', async () => {
  const req = {
    body: {
      code: 'mock_discord_code_test',
      state: 'state_123',
    },
    ip: '127.0.0.1',
  };

  let responseData = null;
  const res = {
    json: (data) => {
      responseData = data;
      return res;
    },
    status: () => res,
  };

  await AuthController.discordCallback(req, res);

  assert.ok(responseData.success);
  assert.equal(responseData.user.provider, 'discord');
  assert.ok(responseData.token);
});
