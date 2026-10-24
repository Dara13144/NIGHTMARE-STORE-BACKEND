import crypto from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const KEY_BUFFER = Buffer.from(env.DIGITAL_KEY_ENCRYPTION_KEY, 'hex');

/**
 * Encrypt a digital game key using AES-256-GCM
 * @param {string} plainKey - The plaintext game key (e.g., 'XXXXX-XXXXX-XXXXX')
 * @returns {{ encryptedKey: string, keyIv: string, keyTag: string, keyHash: string }}
 */
export function encryptGameKey(plainKey) {
  if (!plainKey || typeof plainKey !== 'string') {
    throw new Error('Game key must be a non-empty string');
  }

  const cleanKey = plainKey.trim();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY_BUFFER, iv);

  let encrypted = cipher.update(cleanKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  // Create SHA-256 hash for fast collision check without decrypting
  const keyHash = crypto.createHash('sha256').update(cleanKey).digest('hex');

  return {
    encryptedKey: encrypted,
    keyIv: iv.toString('hex'),
    keyTag: tag.toString('hex'),
    keyHash,
  };
}

/**
 * Decrypt a digital game key using AES-256-GCM
 * @param {string} encryptedHex 
 * @param {string} ivHex 
 * @param {string} tagHex 
 * @returns {string} Plaintext game key
 */
export function decryptGameKey(encryptedHex, ivHex, tagHex) {
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY_BUFFER, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    throw new Error('Key decryption failed: integrity check failed or corrupted data');
  }
}

/**
 * Mask key for safe previews in non-delivered contexts
 * Example: 'ABCD-EFGH-IJKL-MNOP' -> '****-****-****-MNOP'
 * @param {string} key 
 * @returns {string}
 */
export function maskKey(key) {
  if (!key) return '••••-••••-••••';
  const parts = key.split('-');
  if (parts.length > 1) {
    return parts.map((part, index) => (index === parts.length - 1 ? part : '•••••')).join('-');
  }
  return key.length > 4 ? `••••••••${key.slice(-4)}` : '••••';
}

/**
 * Generate SHA-256 hash of a string
 * @param {string} value 
 * @returns {string}
 */
export function hashValue(value) {
  return crypto.createHash('sha256').update(value.trim()).digest('hex');
}
