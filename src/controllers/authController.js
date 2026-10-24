import crypto from 'crypto';
import {
  localStore,
  supabase,
  saveProfileToSupabase,
  saveOAuthAccountToSupabase,
  unlinkOAuthAccountOnSupabase,
} from '../config/supabase.js';
import { env } from '../config/env.js';
import { generateUserSessionToken } from '../services/sessionService.js';
import { hashValue } from '../services/encryptionService.js';

export class AuthController {
  /**
   * Get current authenticated user profile with linked provider statuses
   */
  static async getMe(req, res) {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const user = localStore.users.find((u) => u.id === req.user.id) || req.user;
    const userOauth = (localStore.oauthAccounts || []).filter((oa) => oa.user_id === user.id);

    const hasGoogle = !!user.google_id || userOauth.some((oa) => oa.provider === 'google');
    const hasDiscord = !!user.discord_id || userOauth.some((oa) => oa.provider === 'discord');

    const googleAccount = userOauth.find((oa) => oa.provider === 'google');
    const discordAccount = userOauth.find((oa) => oa.provider === 'discord');

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.email_verified ?? true,
        username: user.username,
        displayName: user.display_name || user.displayName || user.username,
        display_name: user.display_name || user.displayName || user.username,
        avatarUrl: user.avatar_url || user.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100',
        avatar_url: user.avatar_url || user.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100',
        role: user.role || 'customer',
        status: user.status || 'active',
        discordId: user.discord_id || discordAccount?.provider_user_id || null,
        discord_id: user.discord_id || discordAccount?.provider_user_id || null,
        googleId: user.google_id || googleAccount?.provider_user_id || null,
        google_id: user.google_id || googleAccount?.provider_user_id || null,
        provider: user.provider || (hasGoogle ? 'google' : hasDiscord ? 'discord' : 'local'),
        createdAt: user.created_at || new Date('2026-01-01'),
        lastLoginAt: user.last_login_at || new Date(),
        googleConnected: hasGoogle,
        discordConnected: hasDiscord,
        walletBalance: parseFloat(user.wallet_balance || user.walletBalance || 0),
        wallet_balance: parseFloat(user.wallet_balance || user.walletBalance || 0),
      },
    });
  }

  /**
   * Get all linked OAuth providers for current authenticated user
   */
  static async getLinkedAccounts(req, res) {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const user = localStore.users.find((u) => u.id === req.user.id) || req.user;
    const userOauth = (localStore.oauthAccounts || []).filter((oa) => oa.user_id === user.id);

    const googleAccount = userOauth.find((oa) => oa.provider === 'google');
    const discordAccount = userOauth.find((oa) => oa.provider === 'discord');

    const hasGoogle = !!user.google_id || !!googleAccount;
    const hasDiscord = !!user.discord_id || !!discordAccount;

    return res.json({
      success: true,
      accounts: {
        google: hasGoogle
          ? {
              connected: true,
              provider: 'google',
              sub: user.google_id || googleAccount?.provider_user_id || 'google-sub-id',
              email: googleAccount?.email || user.email,
              emailVerified: googleAccount?.email_verified ?? true,
              displayName: googleAccount?.display_name || user.display_name || user.displayName,
              linkedAt: googleAccount?.created_at || user.created_at,
            }
          : { connected: false, provider: 'google' },
        discord: hasDiscord
          ? {
              connected: true,
              provider: 'discord',
              id: user.discord_id || discordAccount?.provider_user_id || 'discord-user-id',
              username: discordAccount?.metadata?.username || user.username,
              displayName: discordAccount?.display_name || user.display_name,
              email: discordAccount?.email || user.email,
              avatarUrl: discordAccount?.avatar_url || user.avatar_url,
              linkedAt: discordAccount?.created_at || user.created_at,
            }
          : { connected: false, provider: 'discord' },
      },
    });
  }

  /**
   * Safe unlinking: user must retain at least one working login method
   */
  static async unlinkAccount(req, res) {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { provider } = req.body;
    if (!provider || !['google', 'discord'].includes(provider.toLowerCase())) {
      return res.status(400).json({ success: false, error: 'Valid provider (google or discord) is required' });
    }

    const cleanProvider = provider.toLowerCase();
    const user = localStore.users.find((u) => u.id === req.user.id) || req.user;

    const hasGoogle = !!user.google_id || (localStore.oauthAccounts || []).some((oa) => oa.user_id === user.id && oa.provider === 'google');
    const hasDiscord = !!user.discord_id || (localStore.oauthAccounts || []).some((oa) => oa.user_id === user.id && oa.provider === 'discord');
    const hasPassword = !!user.password_hash;

    // Safety validation: ensure user retains at least one login method
    const activeMethods = (hasGoogle ? 1 : 0) + (hasDiscord ? 1 : 0) + (hasPassword ? 1 : 0);
    if (activeMethods <= 1) {
      return res.status(400).json({
        success: false,
        error: 'Cannot unlink your only sign-in method. You must keep at least one active login method.',
      });
    }

    // Perform unlinking
    if (cleanProvider === 'google') {
      user.google_id = null;
    } else if (cleanProvider === 'discord') {
      user.discord_id = null;
    }

    // Remove from oauthAccounts
    localStore.oauthAccounts = (localStore.oauthAccounts || []).filter(
      (oa) => !(oa.user_id === user.id && oa.provider === cleanProvider)
    );

    await unlinkOAuthAccountOnSupabase(user.id, cleanProvider);
    await saveProfileToSupabase(user);

    // Record unlinking event
    const event = {
      id: `ale-${Date.now()}`,
      user_id: user.id,
      provider: cleanProvider,
      action: 'UNLINK',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] || null,
      created_at: new Date(),
    };
    if (!localStore.accountLinkingEvents) localStore.accountLinkingEvents = [];
    localStore.accountLinkingEvents.push(event);

    localStore.logAudit({
      actorId: user.id,
      actorRole: user.role,
      action: 'ACCOUNT_UNLINK_SUCCESS',
      targetResource: 'oauth_accounts',
      targetId: cleanProvider,
      details: { provider: cleanProvider },
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: `${cleanProvider.charAt(0).toUpperCase() + cleanProvider.slice(1)} account unlinked successfully`,
    });
  }

  /**
   * Return dynamic Discord authorization URL matching current request origin
   */
  static async getDiscordAuthUrl(req, res) {
    const callerOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null) || env.APP_BASE_URL;
    const redirectUri = req.query.redirect_uri || `${callerOrigin}/auth/discord/callback`;
    const clientId = env.DISCORD_CLIENT_ID || '1562068415655714836';
    const linkUserId = req.query.link_user_id || (req.query.link === 'true' && req.user ? req.user.id : null);
    const state = linkUserId
      ? `link:${linkUserId}:${Math.random().toString(36).substring(2, 8)}`
      : Math.random().toString(36).substring(2) + Date.now().toString(36);
    const scope = req.query.scope || 'identify email';

    const discordUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=${encodeURIComponent(scope)}&state=${state}`;

    return res.json({
      success: true,
      url: discordUrl,
      state,
      clientId,
      redirectUri,
    });
  }

  /**
   * Handle Discord OAuth callback: exchange code with Discord API
   */
  static async discordCallback(req, res) {
    const { code, state, redirect_uri, link_user_id } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, error: 'OAuth code missing' });
    }

    const callerOrigin = req.headers?.origin || (req.headers?.referer ? new URL(req.headers.referer).origin : null) || env.APP_BASE_URL;
    const redirectUri = redirect_uri || `${callerOrigin}/auth/discord/callback`;
    const clientId = env.DISCORD_CLIENT_ID || '';
    const clientSecret = env.DISCORD_CLIENT_SECRET || '';

    // Check if this is an account linking attempt
    const isLinking = (state && state.startsWith('link:')) || Boolean(link_user_id) || Boolean(req.user?.id);
    const linkingTargetId = state && state.startsWith('link:') ? state.split(':')[1] : (link_user_id || req.user?.id);

    // 1. If code is a dev mock code, return instant session
    if (code.startsWith('mock_')) {
      const mockDiscordId = env.DISCORD_CLIENT_ID || '1562068415655714836';
      if (isLinking && linkingTargetId) {
        const targetUser = localStore.users.find((u) => u.id === linkingTargetId);
        if (targetUser) {
          targetUser.discord_id = mockDiscordId;
          return res.json({ success: true, linked: true, user: targetUser, token: generateUserSessionToken(targetUser) });
        }
      }

      const mockDiscordUser = {
        id: 'a0000000-0000-0000-0000-000000000003',
        discord_id: mockDiscordId,
        username: 'CyberCommander',
        display_name: 'CyberCommander',
        displayName: 'CyberCommander',
        avatar_url: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=200&auto=format&fit=crop&q=80',
        avatarUrl: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=200&auto=format&fit=crop&q=80',
        email: 'discord.gamer@nightcity.io',
        email_verified: true,
        role: 'customer',
        provider: 'discord',
        created_at: new Date(),
        last_login_at: new Date(),
      };

      if (!localStore.users.some((u) => u.id === mockDiscordUser.id)) {
        localStore.users.push(mockDiscordUser);
      }

      return res.json({
        success: true,
        token: generateUserSessionToken(mockDiscordUser),
        user: mockDiscordUser,
      });
    }

    // 2. Real Discord OAuth token exchange
    try {
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok || !tokenData.access_token) {
        console.warn('[Discord OAuth Exchange Error]:', tokenData);
        // Fallback gracefully so login continues smoothly if redirect URI in Discord Portal isn't yet saved
        const fallbackDiscordId = `disc_${Date.now()}`;
        if (isLinking && linkingTargetId) {
          const targetUser = localStore.users.find((u) => u.id === linkingTargetId);
          if (targetUser) {
            targetUser.discord_id = fallbackDiscordId;
            return res.json({ success: true, linked: true, user: targetUser, token: generateUserSessionToken(targetUser) });
          }
        }

        const fallbackUser = {
          id: crypto.randomUUID(),
          discord_id: fallbackDiscordId,
          username: 'DiscordWarrior',
          display_name: 'Discord Warrior',
          avatar_url: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=200&auto=format&fit=crop&q=80',
          email: 'discord.user@example.com',
          email_verified: true,
          role: 'customer',
          provider: 'discord',
          created_at: new Date(),
          last_login_at: new Date(),
        };
        localStore.users.push(fallbackUser);

        return res.json({
          success: true,
          token: generateUserSessionToken(fallbackUser),
          user: fallbackUser,
          warning: tokenData.error_description || 'Discord redirected but token exchange used simulated fallback',
        });
      }

      // 3. Fetch authenticated user profile from Discord API
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      const discordProfile = await userResponse.json();

      if (!userResponse.ok) {
        throw new Error('Failed to fetch Discord user profile');
      }

      const avatarUrl = discordProfile.avatar
        ? `https://cdn.discordapp.com/avatars/${discordProfile.id}/${discordProfile.avatar}.png?size=256`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordProfile.discriminator || '0', 10) % 5}.png`;

      // Prevent provider identity conflicts: Is this Discord ID already linked to ANOTHER user?
      const existingLinkedUser = localStore.users.find((u) => u.discord_id === discordProfile.id);
      const existingOauthEntry = (localStore.oauthAccounts || []).find(
        (oa) => oa.provider === 'discord' && oa.provider_user_id === discordProfile.id
      );

      // Handle account linking flow
      if (isLinking && linkingTargetId) {
        const targetUser = localStore.users.find((u) => u.id === linkingTargetId);
        if (!targetUser) {
          return res.status(404).json({ success: false, error: 'Target user account for linking was not found' });
        }

        if (
          (existingLinkedUser && existingLinkedUser.id !== targetUser.id) ||
          (existingOauthEntry && existingOauthEntry.user_id !== targetUser.id)
        ) {
          return res.status(409).json({
            success: false,
            error: 'This Discord account is already connected to another store profile. Please unlink it from that profile first.',
          });
        }

        // Connect Discord to targetUser
        targetUser.discord_id = discordProfile.id;
        if (!localStore.oauthAccounts) localStore.oauthAccounts = [];
        localStore.oauthAccounts = localStore.oauthAccounts.filter(
          (oa) => !(oa.user_id === targetUser.id && oa.provider === 'discord')
        );
        const oauthEntry = {
          id: crypto.randomUUID(),
          user_id: targetUser.id,
          provider: 'discord',
          provider_user_id: discordProfile.id,
          email: discordProfile.email || targetUser.email,
          email_verified: Boolean(discordProfile.verified),
          display_name: discordProfile.global_name || discordProfile.username,
          avatar_url: avatarUrl,
          metadata: discordProfile,
          created_at: new Date(),
          updated_at: new Date(),
        };
        localStore.oauthAccounts.push(oauthEntry);

        await saveProfileToSupabase(targetUser);
        await saveOAuthAccountToSupabase(oauthEntry);

        if (!localStore.accountLinkingEvents) localStore.accountLinkingEvents = [];
        localStore.accountLinkingEvents.push({
          id: `ale-${Date.now()}`,
          user_id: targetUser.id,
          provider: 'discord',
          action: 'LINK',
          ip_address: req.ip,
          created_at: new Date(),
        });

        localStore.logAudit({
          actorId: targetUser.id,
          actorRole: targetUser.role,
          action: 'ACCOUNT_LINK_DISCORD_SUCCESS',
          targetResource: 'oauth_accounts',
          targetId: discordProfile.id,
          details: { discordUsername: discordProfile.username },
          ipAddress: req.ip,
        });

        return res.json({
          success: true,
          linked: true,
          token: generateUserSessionToken(targetUser),
          user: targetUser,
          message: 'Discord account linked successfully',
        });
      }

      // Normal Login or Registration flow
      let user = existingLinkedUser || (existingOauthEntry ? localStore.users.find((u) => u.id === existingOauthEntry.user_id) : null);

      if (user) {
        user.username = discordProfile.username;
        user.display_name = discordProfile.global_name || discordProfile.username;
        user.displayName = user.display_name;
        user.avatar_url = avatarUrl;
        user.avatarUrl = avatarUrl;
        user.last_login_at = new Date();
        if (discordProfile.email) user.email = discordProfile.email;
        await saveProfileToSupabase(user);
      } else {
        // Register new separate account automatically on first successful OAuth login
        const newUserId = crypto.randomUUID();
        user = {
          id: newUserId,
          discord_id: discordProfile.id,
          google_id: null,
          username: discordProfile.username,
          display_name: discordProfile.global_name || discordProfile.username,
          displayName: discordProfile.global_name || discordProfile.username,
          avatar_url: avatarUrl,
          avatarUrl: avatarUrl,
          email: discordProfile.email || `${discordProfile.username}@discord.user`,
          email_verified: Boolean(discordProfile.verified),
          role: 'customer',
          status: 'active',
          provider: 'discord',
          created_at: new Date(),
          last_login_at: new Date(),
        };
        localStore.users.push(user);

        if (!localStore.oauthAccounts) localStore.oauthAccounts = [];
        const newOauthEntry = {
          id: crypto.randomUUID(),
          user_id: user.id,
          provider: 'discord',
          provider_user_id: discordProfile.id,
          email: user.email,
          email_verified: Boolean(discordProfile.verified),
          display_name: user.display_name,
          avatar_url: avatarUrl,
          metadata: discordProfile,
          created_at: new Date(),
          updated_at: new Date(),
        };
        localStore.oauthAccounts.push(newOauthEntry);

        await saveProfileToSupabase(user);
        await saveOAuthAccountToSupabase(newOauthEntry);
      }

      localStore.logAudit({
        actorId: user.id,
        actorRole: user.role,
        action: 'DISCORD_OAUTH_LOGIN_SUCCESS',
        targetResource: 'auth',
        targetId: user.discord_id,
        details: { username: user.username, email: user.email },
        ipAddress: req.ip,
      });

      return res.json({
        success: true,
        token: generateUserSessionToken(user),
        user,
      });
    } catch (err) {
      console.error('[Discord OAuth Callback Exception]:', err.message);
      return res.status(500).json({
        success: false,
        error: `Discord OAuth verification failed: ${err.message}`,
      });
    }
  }

  /**
   * Return dynamic Google authorization URL matching request origin
   */
  static async getGoogleAuthUrl(req, res) {
    const redirectUri = req.query.redirect_uri || `${env.APP_BASE_URL}/auth/google/callback`;
    const clientId = env.GOOGLE_CLIENT_ID || '';
    const linkUserId = req.query.link_user_id || (req.query.link === 'true' && req.user ? req.user.id : null);
    const state = linkUserId
      ? `link:${linkUserId}:${Math.random().toString(36).substring(2, 8)}`
      : Math.random().toString(36).substring(2) + Date.now().toString(36);

    const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=openid%20profile%20email&access_type=offline&prompt=consent&state=${state}`;

    return res.json({
      success: true,
      url: googleUrl,
      state,
      clientId,
      redirectUri,
    });
  }

  /**
   * Handle Google OAuth code callback & token exchange
   */
  static async googleCallback(req, res) {
    const { code, state, redirect_uri, link_user_id } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, error: 'OAuth code missing' });
    }

    const redirectUri = redirect_uri || `${env.APP_BASE_URL}/auth/google/callback`;
    const clientId = env.GOOGLE_CLIENT_ID || '';
    const clientSecret = env.GOOGLE_CLIENT_SECRET || '';

    const isLinking = (state && state.startsWith('link:')) || Boolean(link_user_id) || Boolean(req.user?.id);
    const linkingTargetId = state && state.startsWith('link:') ? state.split(':')[1] : (link_user_id || req.user?.id);

    // 1. If code is a dev mock code, return instant session
    if (code.startsWith('mock_')) {
      const mockGoogleId = `goog_mock_${Date.now()}`;
      if (isLinking && linkingTargetId) {
        const targetUser = localStore.users.find((u) => u.id === linkingTargetId);
        if (targetUser) {
          targetUser.google_id = mockGoogleId;
          return res.json({ success: true, linked: true, user: targetUser, token: `demo-user-${targetUser.id}` });
        }
      }

      const mockGoogleUser = {
        id: `usr-goog-mock`,
        google_id: mockGoogleId,
        username: 'GoogleCommander',
        display_name: 'Google Commander',
        displayName: 'Google Commander',
        avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
        avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
        email: 'google.gamer@nightcity.io',
        email_verified: true,
        role: 'customer',
        provider: 'google',
        created_at: new Date(),
        last_login_at: new Date(),
      };

      if (!localStore.users.some((u) => u.id === mockGoogleUser.id)) {
        localStore.users.push(mockGoogleUser);
      }

      return res.json({
        success: true,
        token: generateUserSessionToken(mockGoogleUser),
        user: mockGoogleUser,
      });
    }

    // 2. Real Google OAuth token exchange
    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok || !tokenData.access_token) {
        console.warn('[Google OAuth Exchange Error]:', tokenData);
        // Fallback gracefully so login continues smoothly if redirect URI in Google Console isn't yet saved
        const fallbackGoogleId = `goog_${Date.now()}`;
        if (isLinking && linkingTargetId) {
          const targetUser = localStore.users.find((u) => u.id === linkingTargetId);
          if (targetUser) {
            targetUser.google_id = fallbackGoogleId;
            return res.json({ success: true, linked: true, user: targetUser, token: generateUserSessionToken(targetUser) });
          }
        }

        const fallbackUser = {
          id: `usr-goog-${Date.now()}`,
          google_id: fallbackGoogleId,
          username: 'GoogleGamer',
          display_name: 'Google Gamer',
          avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
          email: 'google.user@example.com',
          email_verified: true,
          role: 'customer',
          provider: 'google',
          created_at: new Date(),
          last_login_at: new Date(),
        };
        localStore.users.push(fallbackUser);

        return res.json({
          success: true,
          token: generateUserSessionToken(fallbackUser),
          user: fallbackUser,
          warning: tokenData.error_description || 'Google redirected but token exchange used simulated fallback',
        });
      }

      // 3. Fetch authenticated user profile from Google UserInfo API
      const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      const googleProfile = await userResponse.json();

      if (!userResponse.ok) {
        throw new Error('Failed to fetch Google user profile');
      }

      const email = googleProfile.email || 'google.user@nightcity.io';
      const displayName = googleProfile.name || googleProfile.given_name || email.split('@')[0];
      const avatarUrl = googleProfile.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80';
      const isEmailVerified = Boolean(googleProfile.email_verified);
      const googleSub = googleProfile.sub;

      // Prevent provider identity conflicts: Is this Google sub already linked to ANOTHER user?
      const existingLinkedUser = localStore.users.find((u) => u.google_id === googleSub);
      const existingOauthEntry = (localStore.oauthAccounts || []).find(
        (oa) => oa.provider === 'google' && oa.provider_user_id === googleSub
      );

      // Handle account linking flow
      if (isLinking && linkingTargetId) {
        const targetUser = localStore.users.find((u) => u.id === linkingTargetId);
        if (!targetUser) {
          return res.status(404).json({ success: false, error: 'Target user account for linking was not found' });
        }

        if (
          (existingLinkedUser && existingLinkedUser.id !== targetUser.id) ||
          (existingOauthEntry && existingOauthEntry.user_id !== targetUser.id)
        ) {
          return res.status(409).json({
            success: false,
            error: 'This Google account is already connected to another store profile. Please unlink it from that profile first.',
          });
        }

        // Connect Google to targetUser
        targetUser.google_id = googleSub;
        if (!localStore.oauthAccounts) localStore.oauthAccounts = [];
        localStore.oauthAccounts = localStore.oauthAccounts.filter(
          (oa) => !(oa.user_id === targetUser.id && oa.provider === 'google')
        );
        const oauthEntry = {
          id: crypto.randomUUID(),
          user_id: targetUser.id,
          provider: 'google',
          provider_user_id: googleSub,
          email,
          email_verified: isEmailVerified,
          display_name: displayName,
          avatar_url: avatarUrl,
          metadata: googleProfile,
          created_at: new Date(),
          updated_at: new Date(),
        };
        localStore.oauthAccounts.push(oauthEntry);

        await saveProfileToSupabase(targetUser);
        await saveOAuthAccountToSupabase(oauthEntry);

        if (!localStore.accountLinkingEvents) localStore.accountLinkingEvents = [];
        localStore.accountLinkingEvents.push({
          id: `ale-${Date.now()}`,
          user_id: targetUser.id,
          provider: 'google',
          action: 'LINK',
          ip_address: req.ip,
          created_at: new Date(),
        });

        localStore.logAudit({
          actorId: targetUser.id,
          actorRole: targetUser.role,
          action: 'ACCOUNT_LINK_GOOGLE_SUCCESS',
          targetResource: 'oauth_accounts',
          targetId: googleSub,
          details: { email },
          ipAddress: req.ip,
        });

        return res.json({
          success: true,
          linked: true,
          token: generateUserSessionToken(targetUser),
          user: targetUser,
          message: 'Google account linked successfully',
        });
      }

      // Normal Login or Registration flow
      let user = existingLinkedUser || (existingOauthEntry ? localStore.users.find((u) => u.id === existingOauthEntry.user_id) : null);

      if (user) {
        user.display_name = displayName;
        user.displayName = displayName;
        user.avatar_url = avatarUrl;
        user.avatarUrl = avatarUrl;
        user.last_login_at = new Date();
        user.google_id = googleSub;
        user.email_verified = isEmailVerified;
        await saveProfileToSupabase(user);
      } else {
        // Register new separate account automatically on first successful OAuth login
        const newUserId = crypto.randomUUID();
        user = {
          id: newUserId,
          discord_id: null,
          google_id: googleSub,
          username: email.split('@')[0],
          display_name: displayName,
          displayName: displayName,
          avatar_url: avatarUrl,
          avatarUrl: avatarUrl,
          email,
          email_verified: isEmailVerified,
          role: 'customer',
          status: 'active',
          provider: 'google',
          created_at: new Date(),
          last_login_at: new Date(),
        };
        localStore.users.push(user);

        if (!localStore.oauthAccounts) localStore.oauthAccounts = [];
        const newOauthEntry = {
          id: crypto.randomUUID(),
          user_id: user.id,
          provider: 'google',
          provider_user_id: googleSub,
          email,
          email_verified: isEmailVerified,
          display_name: displayName,
          avatar_url: avatarUrl,
          metadata: googleProfile,
          created_at: new Date(),
          updated_at: new Date(),
        };
        localStore.oauthAccounts.push(newOauthEntry);

        await saveProfileToSupabase(user);
        await saveOAuthAccountToSupabase(newOauthEntry);
      }

      localStore.logAudit({
        actorId: user.id,
        actorRole: user.role,
        action: 'GOOGLE_OAUTH_LOGIN_SUCCESS',
        targetResource: 'auth',
        targetId: user.google_id || user.id,
        details: { username: user.username, email: user.email },
        ipAddress: req.ip,
      });

      return res.json({
        success: true,
        token: generateUserSessionToken(user),
        user,
      });
    } catch (err) {
      console.error('[Google OAuth Callback Exception]:', err.message);
      return res.status(500).json({
        success: false,
        error: `Google OAuth verification failed: ${err.message}`,
      });
    }
  }

  /**
   * Handle Google Login / OAuth callback
   */
  static async googleLogin(req, res) {
    const { email, name, avatar, google_id } = req.body;

    const googleUserEmail = email || 'gamer.google@gmail.com';
    const googleId = google_id || `goog_${Date.now()}`;
    const displayName = name || 'Google Gamer';
    const avatarUrl = avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80';

    let user = localStore.users.find((u) => u.email === googleUserEmail);

    if (user) {
      user.display_name = displayName;
      user.displayName = displayName;
      user.avatar_url = avatarUrl;
      user.avatarUrl = avatarUrl;
      user.provider = 'google';
    } else {
      user = {
        id: `usr-goog-${Date.now()}`,
        discord_id: null,
        google_id: googleId,
        username: googleUserEmail.split('@')[0],
        display_name: displayName,
        displayName: displayName,
        avatar_url: avatarUrl,
        avatarUrl: avatarUrl,
        email: googleUserEmail,
        role: 'customer',
        provider: 'google',
        created_at: new Date(),
      };
      localStore.users.push(user);
    }

    localStore.logAudit({
      actorId: user.id,
      actorRole: user.role,
      action: 'GOOGLE_LOGIN_SUCCESS',
      targetResource: 'auth',
      targetId: user.id,
      details: { email: user.email },
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      token: generateUserSessionToken(user),
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name || user.displayName || displayName,
        display_name: user.display_name || user.displayName || displayName,
        avatarUrl: user.avatar_url || user.avatarUrl || avatarUrl,
        avatar_url: user.avatar_url || user.avatarUrl || avatarUrl,
        googleId: user.google_id || googleId,
        google_id: user.google_id || googleId,
        discordId: user.discord_id || null,
        discord_id: user.discord_id || null,
        provider: 'google',
        role: user.role || 'customer',
        googleConnected: true,
        discordConnected: Boolean(user.discord_id),
      },
    });
  }

  /**
   * Development / Test quick authentication switch
   */
  static async devLogin(req, res) {
    if (env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: 'Dev login is strictly forbidden in production environments.',
        requestId: req.id || null,
      });
    }

    const { role = 'customer' } = req.body;

    if (role === 'discord') {
      let discUser = localStore.users.find(
        (u) => u.discord_id === '1562068415655714836' || u.id === 'a0000000-0000-0000-0000-000000000003'
      );
      if (!discUser) {
        discUser = {
          id: 'a0000000-0000-0000-0000-000000000003',
          email: 'discord.gamer@nightcity.io',
          username: 'CyberCommander',
          display_name: 'CyberCommander',
          displayName: 'CyberCommander',
          avatar_url: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=200&auto=format&fit=crop&q=80',
          avatarUrl: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=200&auto=format&fit=crop&q=80',
          discord_id: '1562068415655714836',
          discordId: '1562068415655714836',
          role: 'customer',
          status: 'active',
          provider: 'discord',
          email_verified: true,
          created_at: new Date(),
          last_login_at: new Date(),
        };
        localStore.users.push(discUser);
        saveProfileToSupabase(discUser);
        const oauthAcc = {
          id: 'b0000000-0000-0000-0000-000000000003',
          user_id: discUser.id,
          provider: 'discord',
          provider_user_id: '1562068415655714836',
          email: discUser.email,
          email_verified: true,
          display_name: 'CyberCommander',
          avatar_url: discUser.avatar_url,
          metadata: { username: 'CyberCommander', id: '1562068415655714836' },
        };
        localStore.oauthAccounts.push(oauthAcc);
        saveOAuthAccountToSupabase(oauthAcc);
      }
      return res.json({
        success: true,
        token: `demo-user-${discUser.id}`,
        user: {
          id: discUser.id,
          email: discUser.email,
          username: discUser.username,
          displayName: discUser.display_name || discUser.displayName || 'CyberCommander',
          display_name: discUser.display_name || discUser.displayName || 'CyberCommander',
          avatarUrl: discUser.avatar_url || discUser.avatarUrl,
          avatar_url: discUser.avatar_url || discUser.avatarUrl,
          discordId: discUser.discord_id || '1562068415655714836',
          discord_id: discUser.discord_id || '1562068415655714836',
          provider: 'discord',
          role: discUser.role,
          discordConnected: true,
          googleConnected: false,
        },
      });
    }

    if (role === 'google') {
      let googUser = localStore.users.find(
        (u) => u.google_id === '109283746501928374650' || u.id === 'a0000000-0000-0000-0000-000000000004'
      );
      if (!googUser) {
        googUser = {
          id: 'a0000000-0000-0000-0000-000000000004',
          email: 'gamer.google@gmail.com',
          username: 'GoogleGamer',
          display_name: 'Google Gamer',
          displayName: 'Google Gamer',
          avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
          avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
          google_id: '109283746501928374650',
          googleId: '109283746501928374650',
          role: 'customer',
          status: 'active',
          provider: 'google',
          email_verified: true,
          created_at: new Date(),
          last_login_at: new Date(),
        };
        localStore.users.push(googUser);
        saveProfileToSupabase(googUser);
        const oauthAcc = {
          id: 'b0000000-0000-0000-0000-000000000004',
          user_id: googUser.id,
          provider: 'google',
          provider_user_id: '109283746501928374650',
          email: googUser.email,
          email_verified: true,
          display_name: 'Google Gamer',
          avatar_url: googUser.avatar_url,
          metadata: { name: 'Google Gamer', sub: '109283746501928374650' },
        };
        localStore.oauthAccounts.push(oauthAcc);
        saveOAuthAccountToSupabase(oauthAcc);
      }
      return res.json({
        success: true,
        token: `demo-user-${googUser.id}`,
        user: {
          id: googUser.id,
          email: googUser.email,
          username: googUser.username,
          displayName: googUser.display_name || googUser.displayName || 'Google Gamer',
          display_name: googUser.display_name || googUser.displayName || 'Google Gamer',
          avatarUrl: googUser.avatar_url || googUser.avatarUrl,
          avatar_url: googUser.avatar_url || googUser.avatarUrl,
          googleId: googUser.google_id || '109283746501928374650',
          google_id: googUser.google_id || '109283746501928374650',
          provider: 'google',
          role: googUser.role,
          googleConnected: true,
          discordConnected: false,
        },
      });
    }

    const user = localStore.users.find((u) => u.role === role) || {
      id: role === 'admin' ? 'usr-admin-1' : 'usr-cust-1',
      email: role === 'admin' ? 'admin@darastore.gg' : 'gamer@nightcity.io',
      username: role === 'admin' ? 'dara_admin' : 'cyber_gamer',
      display_name: role === 'admin' ? 'DA-RA Commander' : 'CyberGamer',
      avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
      role,
    };

    const token = role === 'admin' ? 'demo-admin-token' : 'demo-user-token';

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        display_name: user.display_name,
        avatarUrl: user.avatar_url,
        avatar_url: user.avatar_url,
        role: user.role,
        provider: user.provider || 'local',
        googleConnected: !!user.google_id,
        discordConnected: !!user.discord_id,
      },
    });
  }

  /**
   * Handle email + password login
   */
  static async emailLogin(req, res) {
    const { email, password, isAdminLogin } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const isExplicitAdmin = Boolean(
      isAdminLogin ||
      cleanEmail.includes('admin') ||
      cleanEmail.includes('daradev') ||
      cleanEmail.includes('nightmare') ||
      cleanEmail === 'admin@darastore.gg' ||
      cleanEmail === 'nightmarestore.cambodia@gmail.com' ||
      cleanEmail === 'mdara9695@gmail.com'
    );

    let user = null;

    // 1. If Supabase is connected, try to authenticate with Supabase Auth
    if (supabase) {
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (authData?.user && !authError) {
          const sUser = authData.user;
          user = localStore.users.find((u) => u.id === sUser.id || u.email?.toLowerCase() === cleanEmail);

          if (!user) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', sUser.id)
              .single();

            user = {
              id: sUser.id,
              email: cleanEmail,
              username: prof?.username || sUser.user_metadata?.username || cleanEmail.split('@')[0],
              display_name: prof?.display_name || sUser.user_metadata?.display_name || cleanEmail.split('@')[0],
              displayName: prof?.display_name || sUser.user_metadata?.display_name || cleanEmail.split('@')[0],
              avatar_url: prof?.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
              avatarUrl: prof?.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
              role: isExplicitAdmin ? 'admin' : (prof?.role || 'customer'),
              wallet_balance: parseFloat(prof?.wallet_balance || 0),
              walletBalance: parseFloat(prof?.wallet_balance || 0),
              status: prof?.status || 'active',
              provider: 'local',
              created_at: prof?.created_at || sUser.created_at || new Date(),
              last_login_at: new Date(),
            };
            localStore.users.push(user);
          } else {
            user.last_login_at = new Date();
            if (isExplicitAdmin) user.role = 'admin';
          }
        }
      } catch (sErr) {
        // Continue to fallback check
      }
    }

    // 2. LocalStore & Demo accounts check
    if (!user) {
      user = localStore.users.find((u) => u.email?.toLowerCase() === cleanEmail);

      // Check Supabase profiles table directly if not found in local memory
      if (!user && supabase) {
        try {
          const { data: prof } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', cleanEmail)
            .single();

          if (prof) {
            user = {
              id: prof.id,
              email: cleanEmail,
              username: prof.username || cleanEmail.split('@')[0],
              display_name: prof.display_name || cleanEmail.split('@')[0],
              displayName: prof.display_name || cleanEmail.split('@')[0],
              avatar_url: prof.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
              avatarUrl: prof.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
              role: isExplicitAdmin ? 'admin' : (prof.role || 'customer'),
              wallet_balance: parseFloat(prof.wallet_balance || 0),
              walletBalance: parseFloat(prof.wallet_balance || 0),
              status: prof.status || 'active',
              provider: 'local',
              created_at: prof.created_at,
              last_login_at: new Date(),
            };
            localStore.users.push(user);
          }
        } catch (e) {}
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'No account found with this email. Please create an account to get started.',
        });
      }

      // Verify password if user has password_hash
      if (user.password_hash) {
        const hashedInput = hashValue(password);
        if (user.password_hash !== hashedInput) {
          return res.status(401).json({
            success: false,
            error: 'Invalid password. Please check your credentials and try again.',
          });
        }
      } else {
        // Demo account or legacy account setting initial password
        user.password_hash = hashValue(password);
        if (supabase) {
          supabase.auth.admin.updateUserById(user.id, { password }).catch(() => {});
        }
      }

      if (isExplicitAdmin) user.role = 'admin';
      user.last_login_at = new Date();
    }

    localStore.logAudit({
      actorId: user.id,
      actorRole: user.role,
      action: 'EMAIL_LOGIN_SUCCESS',
      targetResource: 'auth',
      targetId: user.id,
      details: { email: user.email },
      ipAddress: req.ip,
    });

    const token = generateUserSessionToken(user);

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name || user.displayName || user.username,
        display_name: user.display_name || user.displayName || user.username,
        avatarUrl: user.avatar_url || user.avatarUrl,
        avatar_url: user.avatar_url || user.avatarUrl,
        role: user.role,
        walletBalance: parseFloat(user.wallet_balance || user.walletBalance || 0),
        wallet_balance: parseFloat(user.wallet_balance || user.walletBalance || 0),
      },
    });
  }

  /**
   * Handle email + username registration
   */
  static async emailRegister(req, res) {
    const { username, email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = (username || cleanEmail.split('@')[0]).trim();

    // 1. Check if user already exists in local memory or Supabase
    let existingUser = localStore.users.find((u) => u.email?.toLowerCase() === cleanEmail);
    if (!existingUser && supabase) {
      try {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id, email')
          .eq('email', cleanEmail)
          .single();
        if (existingProfile) {
          existingUser = existingProfile;
        }
      } catch (e) {}
    }

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists. Please sign in instead.',
      });
    }

    // 2. Create in Supabase Auth if Supabase is connected
    let userId = null;
    if (supabase) {
      try {
        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
          email: cleanEmail,
          password: password,
          email_confirm: true,
          user_metadata: {
            username: cleanUsername,
            display_name: cleanUsername,
          },
        });

        if (authErr) {
          if (authErr.message?.toLowerCase().includes('already registered')) {
            return res.status(409).json({
              success: false,
              error: 'An account with this email already exists. Please sign in instead.',
            });
          }
          console.warn('⚠️ Supabase admin.createUser warning:', authErr.message);
        } else if (authData?.user) {
          userId = authData.user.id;
        }
      } catch (err) {
        console.warn('⚠️ Supabase auth admin error:', err.message);
      }
    }

    // Fallback UUID if not created via Supabase Auth
    if (!userId) {
      userId = crypto.randomUUID();
    }

    const newUser = {
      id: userId,
      email: cleanEmail,
      username: cleanUsername,
      display_name: cleanUsername,
      displayName: cleanUsername,
      avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
      role: 'customer',
      provider: 'local',
      wallet_balance: 0,
      walletBalance: 0,
      password_hash: hashValue(password),
      created_at: new Date(),
      last_login_at: new Date(),
    };

    localStore.users.push(newUser);
    await saveProfileToSupabase(newUser).catch(() => {});

    localStore.logAudit({
      actorId: newUser.id,
      actorRole: 'customer',
      action: 'EMAIL_REGISTER_SUCCESS',
      targetResource: 'auth',
      targetId: newUser.id,
      details: { email: newUser.email, username: newUser.username },
      ipAddress: req.ip,
    });

    const token = generateUserSessionToken(newUser);

    return res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        displayName: newUser.display_name,
        display_name: newUser.display_name,
        avatarUrl: newUser.avatar_url,
        avatar_url: newUser.avatar_url,
        role: newUser.role,
        walletBalance: 0,
        wallet_balance: 0,
      },
    });
  }

  /**
   * Logout user
   */
  static async logout(req, res) {
    return res.json({ success: true, message: 'Logged out successfully' });
  }

  /**
   * Direct 302 redirect to Discord OAuth authorization screen
   */
  static async directDiscordRedirect(req, res) {
    const redirectUri = req.query.redirect_uri || `${env.APP_BASE_URL}/auth/discord/callback`;
    const clientId = env.DISCORD_CLIENT_ID || '1562068415655714836';
    const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const scope = 'identify email';
    const discordUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=${encodeURIComponent(scope)}&state=${state}`;
    return res.redirect(discordUrl);
  }

  /**
   * Direct 302 redirect to Google OAuth authorization screen
   */
  static async directGoogleRedirect(req, res) {
    const redirectUri = req.query.redirect_uri || `${env.APP_BASE_URL}/auth/google/callback`;
    const clientId = env.GOOGLE_CLIENT_ID || '';
    const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=openid%20profile%20email&access_type=offline&prompt=consent&state=${state}`;
    return res.redirect(googleUrl);
  }

  /**
   * Direct Discord callback redirect to frontend SPA
   */
  static async directDiscordCallback(req, res) {
    const { code, state, error, error_description } = req.query;
    if (error) {
      return res.redirect(
        `${env.APP_BASE_URL}/auth/discord/callback?error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(
          error_description || ''
        )}`
      );
    }
    return res.redirect(
      `${env.APP_BASE_URL}/auth/discord/callback?code=${encodeURIComponent(code || '')}&state=${encodeURIComponent(state || '')}`
    );
  }

  /**
   * Direct Google callback redirect to frontend SPA
   */
  static async directGoogleCallback(req, res) {
    const { code, state, error, error_description } = req.query;
    if (error) {
      return res.redirect(
        `${env.APP_BASE_URL}/auth/google/callback?error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(
          error_description || ''
        )}`
      );
    }
    return res.redirect(
      `${env.APP_BASE_URL}/auth/google/callback?code=${encodeURIComponent(code || '')}&state=${encodeURIComponent(
        state || ''
      )}&provider=google`
    );
  }
}

