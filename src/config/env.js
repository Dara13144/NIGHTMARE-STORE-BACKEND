import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
// Also attempt loading server/.env if running from workspace root
try {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.join(__dirname, '../../.env') });
} catch (e) {
  // ignore
}

// Ensure a 32-byte (256-bit) encryption key exists even in local dev
let encryptionKey = process.env.DIGITAL_KEY_ENCRYPTION_KEY;
if (!encryptionKey || encryptionKey.length !== 64) {
  // If not provided or invalid length, generate a stable dev key or warn
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DIGITAL_KEY_ENCRYPTION_KEY must be a 64-character hex string (32 bytes) in production!');
  }
  // Deterministic local development key for testing consistency
  encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
}

export const env = {
  PORT: process.env.PORT || 5050,
  NODE_ENV: process.env.NODE_ENV || 'development',
  FRONTEND_URL: process.env.FRONTEND_URL || process.env.APP_BASE_URL || 'http://localhost:5173',
  BACKEND_URL: process.env.BACKEND_URL || process.env.API_BASE_URL || 'http://localhost:5050',
  APP_BASE_URL: process.env.FRONTEND_URL || process.env.APP_BASE_URL || 'http://localhost:5173',
  API_BASE_URL: process.env.BACKEND_URL || process.env.API_BASE_URL || 'http://localhost:5050',
  SESSION_SECRET: process.env.SESSION_SECRET || 'dara_nightmare_secure_session_secret_2026',

  // Google OAuth 2.0 Credentials
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || `${process.env.FRONTEND_URL || process.env.APP_BASE_URL || 'http://localhost:5173'}/auth/google/callback`,

  // Discord OAuth2 Credentials
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID || '',
  DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET || '',
  DISCORD_REDIRECT_URI: process.env.DISCORD_REDIRECT_URI || `${process.env.FRONTEND_URL || process.env.APP_BASE_URL || 'http://localhost:5173'}/auth/discord/callback`,

  // Discord Bot & Role Verification Configuration
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || '',
  DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID || '',
  DISCORD_VERIFIED_ROLE_ID: process.env.DISCORD_VERIFIED_ROLE_ID || '',
  DISCORD_VERIFICATION_CHANNEL_ID: process.env.DISCORD_VERIFICATION_CHANNEL_ID || '',

  // Google reCAPTCHA v2 System
  RECAPTCHA_SITE_KEY: process.env.RECAPTCHA_SITE_KEY || '',
  RECAPTCHA_SECRET_KEY: process.env.RECAPTCHA_SECRET_KEY || '',

  // Supabase PostgreSQL Service Connection
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  DATABASE_URL: process.env.DATABASE_URL || '',

  PAYMENT_PROVIDER_SECRET: process.env.PAYMENT_PROVIDER_SECRET || 'test_sk_da_ra_store_secret',
  PAYMENT_WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET || 'test_whsec_cyberpunk_marketplace_key',
  DIGITAL_KEY_ENCRYPTION_KEY: encryptionKey,
  IS_SUPABASE_CONFIGURED: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || 'NightmareStore Security <onboarding@resend.dev>',
  ADMIN_OTP_EMAIL: process.env.ADMIN_OTP_EMAIL || 'mdara9695@gmail.com',

  // CutLuy Payment Gateway (KHQR & Wallet Auto Payment)
  CUTLUY_API_KEY: process.env.CUTLUY_API_KEY || 'ck_live_JeCdgDjKZnYV19qMOAckq9yKN64rOhj0',
  CUTLUY_BASE_URL: process.env.CUTLUY_BASE_URL || 'https://cutluy.com/v1',
  CUTLUY_WEBHOOK_SECRET: process.env.CUTLUY_WEBHOOK_SECRET || '',
};
