import crypto from 'crypto';
import { env } from '../config/env.js';
import { supabase, localStore } from '../config/supabase.js';
import { adminAuthService } from './adminAuthService.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Generate a cryptographically signed session token for authenticated users
 * Format: usr-tok-<userId>.<issuedAt>.<hmacSignature>
 */
export function generateUserSessionToken(user) {
  const userId = String(user.id);
  const issuedAt = Date.now();
  const payload = `${userId}.${issuedAt}`;
  const signature = crypto
    .createHmac('sha256', env.SESSION_SECRET)
    .update(payload)
    .digest('hex');

  return `usr-tok-${payload}.${signature}`;
}

/**
 * Verify any incoming authentication token (Signed Session, Admin 2FA, Supabase JWT, or Dev)
 * Returns the fully resolved user profile or null
 */
export async function verifyAnyAuthToken(token) {
  if (!token || typeof token !== 'string') return null;

  const isProduction = env.NODE_ENV === 'production';

  // 1. Production Admin 2FA Session (admin-sec-...)
  if (token.startsWith('admin-sec-')) {
    const adminUser = await adminAuthService.getSession(token);
    if (adminUser) return adminUser;
    return null;
  }

  // 2. Cryptographically Signed User Session Token (usr-tok-...)
  if (token.startsWith('usr-tok-')) {
    try {
      const tokenBody = token.slice('usr-tok-'.length);
      const parts = tokenBody.split('.');
      if (parts.length !== 3) return null;

      const [userId, issuedAtStr, signature] = parts;
      const issuedAt = parseInt(issuedAtStr, 10);

      // Verify expiration (30 days)
      if (isNaN(issuedAt) || Date.now() - issuedAt > SESSION_TTL_MS) {
        return null;
      }

      // Verify HMAC-SHA256 signature with constant-time equality check
      const expectedPayload = `${userId}.${issuedAtStr}`;
      const expectedSignature = crypto
        .createHmac('sha256', env.SESSION_SECRET)
        .update(expectedPayload)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature);
      const actualBuf = Buffer.from(signature);

      if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
        return null;
      }

      // Find user in local store memory cache
      let foundUser = localStore.users.find((u) => u.id === userId);

      // If not in local store, query Supabase profiles
      if (!foundUser && supabase) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (profile) {
          foundUser = {
            id: profile.id,
            email: profile.email,
            username: profile.username || profile.email?.split('@')[0],
            display_name: profile.display_name || profile.username,
            displayName: profile.display_name || profile.username,
            avatar_url: profile.avatar_url,
            avatarUrl: profile.avatar_url,
            discord_id: profile.discord_id,
            google_id: profile.google_id,
            role: profile.role || 'customer',
            wallet_balance: parseFloat(profile.wallet_balance || 0),
            walletBalance: parseFloat(profile.wallet_balance || 0),
            status: 'active',
          };
          localStore.users.push(foundUser);
        }
      }

      if (foundUser) {
        return {
          id: foundUser.id,
          email: foundUser.email,
          username: foundUser.username,
          displayName: foundUser.display_name || foundUser.displayName || foundUser.username,
          display_name: foundUser.display_name || foundUser.displayName || foundUser.username,
          avatarUrl: foundUser.avatar_url || foundUser.avatarUrl,
          avatar_url: foundUser.avatar_url || foundUser.avatarUrl,
          role: foundUser.role || 'customer',
          discord_id: foundUser.discord_id || null,
          google_id: foundUser.google_id || null,
          walletBalance: parseFloat(foundUser.wallet_balance || foundUser.walletBalance || 0),
          wallet_balance: parseFloat(foundUser.wallet_balance || foundUser.walletBalance || 0),
        };
      }
    } catch (err) {
      console.warn('⚠️ [Session Token Parse Warning]:', err.message);
      return null;
    }
  }

  // 3. Supabase Auth JWT (for clients using Supabase OAuth directly)
  if (supabase && token.includes('.') && !token.startsWith('usr-') && !token.startsWith('demo-')) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (user && !error) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        return {
          id: user.id,
          email: user.email,
          username: profile?.username || user.user_metadata?.custom_claims?.global_name || user.email.split('@')[0],
          displayName: profile?.display_name || user.user_metadata?.full_name || profile?.username,
          display_name: profile?.display_name || user.user_metadata?.full_name || profile?.username,
          avatarUrl: profile?.avatar_url || user.user_metadata?.avatar_url,
          avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url,
          role: profile?.role || 'customer',
          discord_id: profile?.discord_id || null,
          google_id: profile?.google_id || null,
          walletBalance: parseFloat(profile?.wallet_balance || 0),
          wallet_balance: parseFloat(profile?.wallet_balance || 0),
        };
      }
    } catch (sErr) {
      // Quiet fallback
    }
  }

  // 4. Backward-compatible dev tokens (only permitted in non-production)
  if (!isProduction) {
    if (token === 'demo-admin-token') {
      return localStore.users.find((u) => u.role === 'admin') || {
        id: 'usr-admin-1',
        email: 'admin@darastore.gg',
        username: 'dara_admin',
        role: 'admin',
      };
    }

    if (token === 'demo-user-token' || token.startsWith('demo-user-')) {
      const specificId = token.startsWith('demo-user-') ? token.slice(10) : null;
      return (specificId && localStore.users.find((u) => u.id === specificId)) ||
        localStore.users.find((u) => u.role === 'customer') || {
          id: 'usr-cust-1',
          email: 'gamer@nightcity.io',
          username: 'cyber_gamer',
          role: 'customer',
        };
    }

    // Direct user ID / email match fallback for testing
    const localUser = localStore.users.find((u) => u.id === token || u.email === token);
    if (localUser) return localUser;
  }

  return null;
}
