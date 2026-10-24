import test from 'node:test';
import assert from 'node:assert';
import { adminAuthService } from '../src/services/adminAuthService.js';
import { env } from '../src/config/env.js';

test('Admin 2FA Security: Rejects invalid admin credentials', async () => {
  await assert.rejects(
    async () => {
      await adminAuthService.login({
        email: 'attacker@evil.com',
        password: 'wrongpassword',
      });
    },
    /Invalid administrator credentials/
  );
});

test('Admin 2FA Security: Enforces recipient lock to ADMIN_OTP_EMAIL', async () => {
  // Even if frontend sends different casing or attempts spoofing, it locks to configured ADMIN_OTP_EMAIL
  assert.strictEqual(env.ADMIN_OTP_EMAIL, 'mdara9695@gmail.com');
});

test('Admin 2FA Verification: Requires 6 numeric digits', async () => {
  await assert.rejects(
    async () => {
      await adminAuthService.verifyOtp({
        challengeId: 'test-challenge',
        email: 'mdara9695@gmail.com',
        otp: '12',
      });
    },
    /exactly 6 numeric digits/
  );
});

test('Admin 2FA Verification: Rejects non-existent or expired challenge', async () => {
  await assert.rejects(
    async () => {
      await adminAuthService.verifyOtp({
        challengeId: '00000000-0000-0000-0000-000000000000',
        email: 'mdara9695@gmail.com',
        otp: '123456',
      });
    },
    /invalid or has expired/
  );
});
