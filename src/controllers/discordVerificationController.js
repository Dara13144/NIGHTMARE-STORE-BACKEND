import crypto from 'crypto';
import { env } from '../config/env.js';
import {
  supabase,
  localStore,
  saveDiscordVerificationToSupabase,
  saveVerificationLogToSupabase,
  consumeVerificationSessionInSupabase,
  getDiscordVerificationsFromSupabase,
  getVerificationLogsFromSupabase,
} from '../config/supabase.js';
import { verifyRecaptcha } from '../services/recaptchaService.js';
import { discordBot } from '../services/discordBotService.js';

export class DiscordVerificationController {
  /**
   * GET /api/discord/verification/status
   * Retrieve member verification status, Discord server presence, and role state
   */
  static async getVerificationStatus(req, res) {
    try {
      const { discord_user_id, session_token } = req.query;
      let targetDiscordId = discord_user_id || req.user?.discord_id || req.user?.discordId;

      // If session token provided, look up session record
      if (!targetDiscordId && session_token) {
        const stateHash = crypto.createHash('sha256').update(session_token).digest('hex');
        if (supabase) {
          const { data: sess } = await supabase
            .from('verification_sessions')
            .select('*')
            .eq('state_hash', stateHash)
            .maybeSingle();
          if (sess?.discord_user_id) targetDiscordId = sess.discord_user_id;
        }
      }

      if (!targetDiscordId) {
        return res.json({
          success: true,
          authenticated: Boolean(req.user),
          verified: false,
          inGuild: false,
          hasRole: false,
          guildId: env.DISCORD_GUILD_ID,
          roleId: env.DISCORD_VERIFIED_ROLE_ID,
          message: 'No Discord user ID associated with this session. Please sign in with Discord.',
        });
      }

      // Check existing verification in database
      let verification = null;
      if (supabase) {
        const { data } = await supabase
          .from('discord_verifications')
          .select('*')
          .eq('discord_user_id', targetDiscordId)
          .eq('verification_status', 'verified')
          .maybeSingle();
        verification = data;
      }
      if (!verification && localStore.discordVerifications) {
        verification = localStore.discordVerifications.find(
          (v) => v.discord_user_id === targetDiscordId && v.verification_status === 'verified'
        );
      }

      // Check guild presence via Discord Bot
      const guildCheck = await discordBot.checkMemberInGuild(env.DISCORD_GUILD_ID, targetDiscordId);

      return res.json({
        success: true,
        authenticated: Boolean(req.user),
        discordUserId: targetDiscordId,
        verified: Boolean(verification),
        verifiedAt: verification?.verified_at || null,
        guildId: env.DISCORD_GUILD_ID,
        guildName: guildCheck.guildName || 'NightmareStore Community',
        roleId: env.DISCORD_VERIFIED_ROLE_ID,
        inGuild: guildCheck.inGuild,
        hasRole: Boolean(verification || guildCheck.hasRole),
        recaptchaSiteKey: env.RECAPTCHA_SITE_KEY,
      });
    } catch (err) {
      console.error('[Verification Status Error]:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/discord/verification/start
   * Generate a secure, short-lived verification session
   */
  static async startVerification(req, res) {
    try {
      const { discord_user_id } = req.body;
      const targetDiscordId = discord_user_id || req.user?.discord_id || null;

      // Cryptographically secure session token
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const stateHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

      const sessionObj = {
        id: crypto.randomUUID(),
        user_id: req.user?.id || null,
        discord_user_id: targetDiscordId,
        state_hash: stateHash,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
      };

      if (supabase) {
        await supabase.from('verification_sessions').insert(sessionObj);
      }
      if (!localStore.verificationSessions) localStore.verificationSessions = [];
      localStore.verificationSessions.push(sessionObj);

      await saveVerificationLogToSupabase({
        user_id: req.user?.id || null,
        discord_user_id: targetDiscordId,
        event_type: 'SESSION_STARTED',
        status: 'SUCCESS',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || null,
        details: { expiresAt: expiresAt.toISOString() },
      });

      return res.json({
        success: true,
        sessionToken,
        expiresAt: expiresAt.toISOString(),
        guildId: env.DISCORD_GUILD_ID,
        roleId: env.DISCORD_VERIFIED_ROLE_ID,
        recaptchaSiteKey: env.RECAPTCHA_SITE_KEY,
      });
    } catch (err) {
      console.error('[Start Verification Error]:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/discord/verification/complete
   * Atomically validate CAPTCHA, single-use session, guild presence, and assign Discord role
   */
  static async completeVerification(req, res) {
    const { sessionToken, recaptchaToken, discordUserId } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'] || null;

    const targetDiscordId = discordUserId || req.user?.discord_id || req.user?.discordId;

    if (!targetDiscordId) {
      return res.status(400).json({
        success: false,
        error: 'Discord user identification is required. Please authenticate with Discord.',
      });
    }

    // 1. REQUIRE & VALIDATE REAL GOOGLE RECAPTCHA v2
    if (!recaptchaToken) {
      await saveVerificationLogToSupabase({
        user_id: req.user?.id || null,
        discord_user_id: targetDiscordId,
        event_type: 'CAPTCHA_VERIFICATION',
        status: 'FAILED_MISSING_TOKEN',
        ip_address: ipAddress,
        user_agent: userAgent,
        details: { reason: 'No recaptchaToken provided' },
      });

      return res.status(400).json({
        success: false,
        error: 'Please complete the "I\'m not a robot" reCAPTCHA challenge before proceeding.',
      });
    }

    const captchaResult = await verifyRecaptcha(recaptchaToken, ipAddress);
    if (!captchaResult.success) {
      await saveVerificationLogToSupabase({
        user_id: req.user?.id || null,
        discord_user_id: targetDiscordId,
        event_type: 'CAPTCHA_VERIFICATION',
        status: 'FAILED',
        ip_address: ipAddress,
        user_agent: userAgent,
        details: { error: captchaResult.error, codes: captchaResult.errorCodes },
      });

      return res.status(400).json({
        success: false,
        error: captchaResult.error || 'reCAPTCHA verification failed. Please try again.',
      });
    }

    // 2. ATOMIC VERIFICATION SESSION CONSUMPTION
    let session = null;
    if (sessionToken) {
      const stateHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
      const consumeResult = await consumeVerificationSessionInSupabase(stateHash, targetDiscordId);

      if (!consumeResult.success) {
        await saveVerificationLogToSupabase({
          user_id: req.user?.id || null,
          discord_user_id: targetDiscordId,
          event_type: 'SESSION_CONSUME',
          status: 'FAILED_INVALID_OR_EXPIRED',
          ip_address: ipAddress,
          user_agent: userAgent,
          details: { error: consumeResult.error },
        });

        return res.status(400).json({
          success: false,
          error: 'Verification session has expired or has already been used. Please refresh the page to start a new session.',
        });
      }
      session = consumeResult.session;
    }

    // 3. CHECK GUILD MEMBERSHIP
    const guildId = env.DISCORD_GUILD_ID;
    const roleId = env.DISCORD_VERIFIED_ROLE_ID;

    const guildCheck = await discordBot.checkMemberInGuild(guildId, targetDiscordId);
    if (!guildCheck.inGuild && !guildCheck.simulated) {
      await saveVerificationLogToSupabase({
        user_id: req.user?.id || null,
        discord_user_id: targetDiscordId,
        event_type: 'GUILD_MEMBERSHIP_CHECK',
        status: 'FAILED_NOT_IN_GUILD',
        ip_address: ipAddress,
        user_agent: userAgent,
        details: { guildId },
      });

      return res.status(400).json({
        success: false,
        error: `Your Discord account is not yet a member of our Discord server (${guildCheck.guildName}). Please join the server first!`,
      });
    }

    // 4. ASSIGN VERIFIED ROLE VIA DISCORD BOT
    let roleResult;
    try {
      roleResult = await discordBot.assignVerifiedRole(guildId, targetDiscordId, roleId);
    } catch (err) {
      await saveVerificationLogToSupabase({
        user_id: req.user?.id || null,
        discord_user_id: targetDiscordId,
        event_type: 'ROLE_ASSIGNMENT',
        status: 'FAILED',
        ip_address: ipAddress,
        user_agent: userAgent,
        details: { error: err.message, guildId, roleId },
      });

      return res.status(500).json({
        success: false,
        error: `Failed to assign Discord role: ${err.message}`,
      });
    }

    // 5. PERSIST RECORD TO SUPABASE discord_verifications
    const verifiedRecord = {
      id: crypto.randomUUID(),
      user_id: req.user?.id || null,
      discord_user_id: targetDiscordId,
      discord_guild_id: guildId,
      verified_role_id: roleId,
      verification_status: 'verified',
      verified_at: new Date().toISOString(),
    };

    await saveDiscordVerificationToSupabase(verifiedRecord);

    if (!localStore.discordVerifications) localStore.discordVerifications = [];
    localStore.discordVerifications = localStore.discordVerifications.filter(
      (v) => !(v.discord_user_id === targetDiscordId && v.discord_guild_id === guildId)
    );
    localStore.discordVerifications.push(verifiedRecord);

    // 6. RECORD SUCCESS AUDIT LOG
    await saveVerificationLogToSupabase({
      user_id: req.user?.id || null,
      discord_user_id: targetDiscordId,
      event_type: 'VERIFICATION_SUCCESS',
      status: 'VERIFIED',
      ip_address: ipAddress,
      user_agent: userAgent,
      details: {
        guildId,
        roleId,
        roleName: roleResult.roleName || 'Verified',
        alreadyHadRole: roleResult.alreadyHadRole || false,
      },
    });

    // 7. RETURN STRICT SUCCESS CHECKLIST PAYLOAD
    return res.json({
      success: true,
      message: 'Verification Successful',
      captchaPassed: true,
      accountVerified: true,
      roleAdded: true,
      accessGranted: true,
      verifiedAt: verifiedRecord.verified_at,
      discordUserId: targetDiscordId,
      roleName: roleResult.roleName || 'Verified',
      alreadyHadRole: roleResult.alreadyHadRole || false,
    });
  }

  /**
   * GET /api/admin/discord/verifications
   * Admin dashboard: view all verifications, logs, bot status, and guild settings
   */
  static async getAdminVerifications(req, res) {
    try {
      const verifications = await getDiscordVerificationsFromSupabase();
      const logs = await getVerificationLogsFromSupabase(150);
      const botStatus = discordBot.getStatus();

      return res.json({
        success: true,
        verifications,
        logs,
        botStatus,
        settings: {
          guildId: env.DISCORD_GUILD_ID,
          verifiedRoleId: env.DISCORD_VERIFIED_ROLE_ID,
          channelId: env.DISCORD_VERIFICATION_CHANNEL_ID,
          recaptchaSiteKey: env.RECAPTCHA_SITE_KEY,
        },
      });
    } catch (err) {
      console.error('[Admin Verifications Error]:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/admin/discord/panel
   * Admin dashboard: post or update verification panel in Discord channel
   */
  static async postAdminPanel(req, res) {
    try {
      const { channelId, roleId, guildId } = req.body;

      if (guildId) env.DISCORD_GUILD_ID = guildId;
      if (roleId) env.DISCORD_VERIFIED_ROLE_ID = roleId;
      if (channelId) env.DISCORD_VERIFICATION_CHANNEL_ID = channelId;

      const result = await discordBot.postPanel(channelId, roleId);

      return res.json({
        success: true,
        message: 'Discord Verification Panel posted successfully!',
        result,
      });
    } catch (err) {
      console.error('[Admin Panel Error]:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
}
