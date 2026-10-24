import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptGameKey, decryptGameKey, maskKey, hashValue } from '../src/services/encryptionService.js';

test('Encryption Service: encrypts and decrypts game key accurately with AES-256-GCM', () => {
  const originalKey = 'STEAM-ABCD-1234-EFGH-5678';
  const encrypted = encryptGameKey(originalKey);

  assert.ok(encrypted.encryptedKey, 'Encrypted hex must exist');
  assert.ok(encrypted.keyIv, 'IV must exist');
  assert.ok(encrypted.keyTag, 'Auth tag must exist');
  assert.notEqual(encrypted.encryptedKey, originalKey, 'Ciphertext must not match plaintext');

  const decrypted = decryptGameKey(encrypted.encryptedKey, encrypted.keyIv, encrypted.keyTag);
  assert.equal(decrypted, originalKey, 'Decrypted key must equal original');
});

test('Encryption Service: fails decryption when ciphertext or tag is tampered with', () => {
  const originalKey = 'XBOX-PASS-9999-8888-7777';
  const encrypted = encryptGameKey(originalKey);

  // Tamper with tag
  const tamperedTag = encrypted.keyTag.replace('a', 'b').replace('0', '1');

  assert.throws(() => {
    decryptGameKey(encrypted.encryptedKey, encrypted.keyIv, tamperedTag);
  }, /integrity check failed/i);
});

test('Encryption Service: key masking hides sensitive parts', () => {
  assert.equal(maskKey('ABCD-EFGH-IJKL-MNOP'), '•••••-•••••-•••••-MNOP');
  assert.ok(maskKey('1234567890').includes('••••'));
});

test('Encryption Service: SHA-256 hash produces consistent collision-proof signatures', () => {
  const hash1 = hashValue('CYBER-KEY-1');
  const hash2 = hashValue('CYBER-KEY-1');
  const hash3 = hashValue('CYBER-KEY-2');

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
});
