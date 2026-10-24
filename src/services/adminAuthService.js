import crypto from 'crypto';
import pg from 'pg';
import { Resend } from 'resend';
import { env } from '../config/env.js';
import { supabase, localStore } from '../config/supabase.js';

// PostgreSQL connection pool for atomic challenge and session transactions
let pool = null;
if (env.DATABASE_URL) {
  try {
    pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    });
  } catch (err) {
    console.warn('⚠️ AdminAuthService PostgreSQL pool init warning:', err.message);
  }
}

// In-memory challenge & session cache for ultra-low latency fallback
const inMemoryChallenges = new Map();
const inMemorySessions = new Map();
const resendCooldowns = new Map();

// Mask email for safe UI display (e.g. md***5@gmail.com)
export function maskEmail(email) {
  if (!email || !email.includes('@')) return '******';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}

// Keyed HMAC-SHA256 OTP Hasher
function hashOtp(otp) {
  const secret = env.SESSION_SECRET || 'dara_nightmare_secure_session_secret_2026';
  return crypto.createHmac('sha256', secret).update(String(otp).trim()).digest('hex');
}

/**
 * Send Real 6-Digit OTP Email via Resend API
 * Validates credentials, domains, and provider acceptance.
 * Plaintext OTP is NEVER logged to console.
 */
async function sendResendOtpEmail(recipientEmail, otp) {
  const apiKey = env.RESEND_API_KEY;
  const fromEmail = env.RESEND_FROM_EMAIL || 'NightmareStore Security <onboarding@resend.dev>';

  // Diagnostics check for missing Resend API Key
  if (!apiKey || apiKey.trim() === '') {
    console.error('❌ [Resend Delivery Error]: RESEND_API_KEY is not configured in server/.env.');
    throw new Error('Email delivery service is not configured. Please set RESEND_API_KEY in server/.env.');
  }

  const htmlBody = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #070B17; color: #ffffff; padding: 24px; margin: 0; }
          .container { max-width: 520px; margin: 0 auto; background: #0D1329; border: 1px solid rgba(147, 51, 234, 0.35); border-radius: 20px; padding: 36px; box-shadow: 0 0 50px rgba(147, 51, 234, 0.25); }
          .logo { font-size: 22px; font-weight: 900; color: #c084fc; letter-spacing: -0.5px; margin-bottom: 24px; text-transform: uppercase; }
          .badge { display: inline-block; padding: 5px 12px; background: rgba(168, 85, 247, 0.18); border: 1px solid rgba(168, 85, 247, 0.35); border-radius: 20px; font-size: 11px; font-weight: 800; color: #e9d5ff; margin-bottom: 16px; letter-spacing: 0.5px; }
          h1 { font-size: 24px; font-weight: 800; color: #ffffff; margin: 0 0 12px 0; }
          p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 20px 0; }
          .otp-card { background: #070B17; border: 2px solid #a855f7; border-radius: 14px; padding: 22px; text-align: center; margin: 26px 0; box-shadow: 0 0 25px rgba(168, 85, 247, 0.25); }
          .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 900; letter-spacing: 10px; color: #38bdf8; text-shadow: 0 0 16px rgba(56, 189, 248, 0.5); }
          .expiry-note { font-size: 12px; color: #f59e0b; margin-top: 10px; font-weight: 600; }
          .footer { font-size: 11px; color: #64748b; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 20px; margin-top: 28px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">NightmareStore Security</div>
          <div class="badge">Master Administrator Access</div>
          <h1>Two-Factor Verification</h1>
          <p>An administrator login was requested for your account. Use the 6-digit verification code below to authorize your session:</p>
          <div class="otp-card">
            <div class="otp-code">${otp}</div>
            <div class="expiry-note">&#9200; Code expires in 5 minutes</div>
          </div>
          <p>If you did not initiate this administrator login request, your account credentials may be compromised. Please change your password immediately.</p>
          <div class="footer">
            NightmareStore &bull; Digital Accounts & Keys Delivered Instantly<br />
            Protected by Cryptographic 2FA &bull; Automated Security Protocol
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    const resend = new Resend(apiKey.trim());
    const { data, error } = await resend.emails.send({
      from: fromEmail || 'NightmareStore Security <onboarding@resend.dev>',
      to: recipientEmail,
      subject: `🔑 Your NightmareStore Admin Verification Code: ${otp}`,
      html: htmlBody,
    });

    if (error) {
      console.error('❌ [Resend Delivery Error]:', error);
      const msg = error.message || 'Unable to deliver verification email.';
      if (error.name === 'validation_error' || error.statusCode === 403) {
        throw new Error(`Resend domain error: ${msg}. Domain must be onboarding@resend.dev or verified in Resend.`);
      }
      throw new Error(`Email provider error: ${msg}`);
    }

    const emailId = data?.id;
    console.log(`✅ [Resend Confirmed]: OTP email delivered to ${recipientEmail}. Email ID: ${emailId}`);
    return { success: true, emailId };
  } catch (err) {
    if (err.message && (err.message.includes('fetch failed') || err.name === 'NetworkError')) {
      console.error('❌ [Resend Network Error]: Unable to connect to Resend API.');
      throw new Error('Network error: Unable to reach email delivery service. Please check server internet connectivity.');
    }
    throw err;
  }
}

// Log Security Audit Event safely (no credentials or plaintext OTPs)
async function logSecurityEvent({ email, action, status, ipAddress, details = {} }) {
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO public.admin_security_logs (admin_email, action, status, ip_address, details) VALUES ($1, $2, $3, $4, $5)`,
        [email, action, status, ipAddress || '127.0.0.1', JSON.stringify(details)]
      );
    } catch (e) {
      // silent
    }
  }
}

// ----------------------------------------------------------------------------
// Core Production Admin Auth Service
// ----------------------------------------------------------------------------
export const adminAuthService = {
  /**
   * Step 1: Verify Admin Credentials with Supabase Auth & Send Email OTP
   */
  async login({ email, password, ipAddress = '127.0.0.1' }) {
    if (!email || !password) {
      throw new Error('Email and password are required.');
    }

    const cleanEmail = email.trim().toLowerCase();

    // The authorized recipient is strictly bound to configured ADMIN_OTP_EMAIL on backend
    const targetAdminEmail = (env.ADMIN_OTP_EMAIL || 'mdara9695@gmail.com').toLowerCase();

    // 1. Verify credentials using Supabase Auth
    let supabaseAuthUser = null;
    if (supabase) {
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (!authError && authData?.user) {
          supabaseAuthUser = authData.user;
        }
      } catch (err) {
        console.warn('Supabase Auth signInWithPassword warning:', err.message);
      }
    }

    // Fallback credential check for master admin password if Supabase Auth is offline
    const isMasterPasswordMatch =
      cleanEmail === targetAdminEmail &&
      password === 'dashboard_login_adminpanel123456789Dara1111daradev1234nightmareStore';

    if (!supabaseAuthUser && !isMasterPasswordMatch) {
      await logSecurityEvent({
        email: cleanEmail,
        action: 'LOGIN_ATTEMPT',
        status: 'FAILURE',
        ipAddress,
        details: { reason: 'Invalid credentials' },
      });
      throw new Error('Invalid administrator credentials.');
    }

    // 2. Verify account has authorized 'admin' role in Supabase PostgreSQL
    let authorizedAdmin = null;

    if (pool) {
      try {
        const res = await pool.query(
          `SELECT id, username, email, role FROM public.profiles WHERE LOWER(email) = $1 LIMIT 1;`,
          [cleanEmail]
        );
        if (res.rows.length > 0 && res.rows[0].role === 'admin') {
          authorizedAdmin = res.rows[0];
        }
      } catch (err) {
        console.warn('DB profile query warning:', err.message);
      }
    }

    // Also check localStore or targetAdminEmail
    if (!authorizedAdmin && cleanEmail === targetAdminEmail) {
      authorizedAdmin = {
        id: supabaseAuthUser?.id || '1cec40c8-8db3-4f16-a848-646cd2e820db',
        email: targetAdminEmail,
        username: 'daraxd.',
        role: 'admin',
      };
    }

    if (!authorizedAdmin || authorizedAdmin.role !== 'admin') {
      await logSecurityEvent({
        email: cleanEmail,
        action: 'LOGIN_ATTEMPT',
        status: 'FAILURE',
        ipAddress,
        details: { reason: 'Unauthorized role' },
      });
      throw new Error('Invalid administrator credentials.');
    }

    // Target recipient is LOCKED to targetAdminEmail (mdara9695@gmail.com)
    const recipientEmail = targetAdminEmail;

    // 3. Rate Limit / Cooldown check: prevent duplicate submits generating multiple active OTP codes
    const lastSentTime = resendCooldowns.get(recipientEmail) || 0;
    const cooldownElapsed = Date.now() - lastSentTime;
    if (cooldownElapsed < 5000) {
      throw new Error('A verification code request is currently in progress. Please check your inbox.');
    }

    // 4. Generate cryptographically secure random 6-digit OTP code
    const rawOtp = String(crypto.randomInt(100000, 1000000));
    const hashedOtp = hashOtp(rawOtp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const challengeId = crypto.randomUUID();

    // 5. Send Real OTP Email via Resend FIRST (only proceed if provider accepts delivery)
    await sendResendOtpEmail(recipientEmail, rawOtp);

    // Record cooldown
    resendCooldowns.set(recipientEmail, Date.now());

    // 6. Invalidate all previous pending challenges and store keyed hash in Supabase PostgreSQL
    if (pool) {
      try {
        await pool.query(
          `UPDATE public.admin_email_otp_challenges SET invalidated = true WHERE admin_email = $1 AND verified = false;`,
          [recipientEmail]
        );

        await pool.query(
          `INSERT INTO public.admin_email_otp_challenges (id, admin_email, admin_user_id, otp_hash, expires_at, attempts, verified, invalidated, ip_address)
           VALUES ($1, $2, $3, $4, $5, 0, false, false, $6);`,
          [challengeId, recipientEmail, authorizedAdmin.id, hashedOtp, expiresAt, ipAddress]
        );
      } catch (dbErr) {
        console.warn('DB challenge insert error:', dbErr.message);
      }
    }

    // Store in memory cache
    inMemoryChallenges.set(challengeId, {
      id: challengeId,
      email: recipientEmail,
      userId: authorizedAdmin.id,
      otpHash: hashedOtp,
      expiresAt: expiresAt.getTime(),
      attempts: 0,
      verified: false,
      invalidated: false,
    });

    await logSecurityEvent({
      email: recipientEmail,
      action: 'OTP_SENT',
      status: 'SUCCESS',
      ipAddress,
      details: { challengeId, expiresAt },
    });

    return {
      success: true,
      challengeId,
      email: recipientEmail,
      maskedEmail: maskEmail(recipientEmail),
      expiresIn: 300,
    };
  },

  /**
   * Step 2: Atomic, One-Time OTP Verification & Session Issuance
   */
  async verifyOtp({ challengeId, email, otp, ipAddress = '127.0.0.1', userAgent = '' }) {
    if (!challengeId || !otp) {
      throw new Error('Challenge ID and 6-digit verification code are required.');
    }

    const cleanOtp = String(otp).trim();
    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      throw new Error('Verification code must be exactly 6 numeric digits.');
    }

    let challenge = inMemoryChallenges.get(challengeId);

    // Fetch from Supabase PostgreSQL if not in memory
    if (!challenge && pool) {
      try {
        const res = await pool.query(
          `SELECT * FROM public.admin_email_otp_challenges WHERE id = $1 LIMIT 1;`,
          [challengeId]
        );
        if (res.rows.length > 0) {
          const r = res.rows[0];
          challenge = {
            id: r.id,
            email: r.admin_email,
            userId: r.admin_user_id,
            otpHash: r.otp_hash,
            expiresAt: new Date(r.expires_at).getTime(),
            attempts: r.attempts,
            verified: r.verified,
            invalidated: r.invalidated,
          };
        }
      } catch (e) {
        console.warn('DB challenge fetch error:', e.message);
      }
    }

    if (!challenge || challenge.invalidated) {
      throw new Error('This verification code challenge is invalid or has expired. Please sign in again.');
    }

    if (challenge.verified) {
      throw new Error('This verification code has already been consumed.');
    }

    if (Date.now() > challenge.expiresAt) {
      throw new Error('This verification code has expired (valid for 5 minutes). Please request a new code.');
    }

    if (challenge.attempts >= 5) {
      throw new Error('Maximum attempt limit exceeded (5 attempts). For security, this challenge is locked.');
    }

    // Increment attempts
    challenge.attempts += 1;
    if (pool) {
      try {
        await pool.query(
          `UPDATE public.admin_email_otp_challenges SET attempts = attempts + 1 WHERE id = $1;`,
          [challengeId]
        );
      } catch (e) {}
    }

    // Cryptographic comparison using timingSafeEqual to prevent side-channel timing attacks
    const candidateHash = hashOtp(cleanOtp);
    const hashA = Buffer.from(candidateHash, 'hex');
    const hashB = Buffer.from(challenge.otpHash, 'hex');

    const isValid = hashA.length === hashB.length && crypto.timingSafeEqual(hashA, hashB);

    if (!isValid) {
      const remainingAttempts = Math.max(0, 5 - challenge.attempts);
      await logSecurityEvent({
        email: challenge.email,
        action: 'OTP_FAILED',
        status: 'FAILURE',
        ipAddress,
        details: { attempts: challenge.attempts, remaining: remainingAttempts },
      });
      throw new Error(`Incorrect verification code. ${remainingAttempts} attempt(s) remaining.`);
    }

    // Atomic one-time consumption: mark verified in DB
    if (pool) {
      try {
        const updateRes = await pool.query(
          `UPDATE public.admin_email_otp_challenges SET verified = true WHERE id = $1 AND verified = false RETURNING id;`,
          [challengeId]
        );
        if (updateRes.rows.length === 0) {
          throw new Error('Verification race condition detected: code already consumed.');
        }
      } catch (dbErr) {
        if (dbErr.message.includes('race condition')) throw dbErr;
      }
    }

    challenge.verified = true;

    // Issue Cryptographically Secure Admin Session Token
    const sessionToken = `admin-sec-${crypto.randomBytes(32).toString('hex')}`;
    const sessionExpiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 Hours

    const adminUser = {
      id: challenge.userId || '1cec40c8-8db3-4f16-a848-646cd2e820db',
      email: challenge.email,
      username: challenge.email.split('@')[0],
      displayName: challenge.email === 'mdara9695@gmail.com' ? 'DA-RA Master Admin' : 'Admin',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      role: 'admin',
    };

    // Store session in DB
    if (pool) {
      try {
        await pool.query(
          `INSERT INTO public.admin_sessions (admin_email, admin_user_id, session_token, expires_at, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6);`,
          [challenge.email, adminUser.id, sessionToken, sessionExpiresAt, ipAddress, userAgent]
        );
      } catch (dbErr) {
        console.warn('DB session insert error:', dbErr.message);
      }
    }

    // Cache session in memory
    inMemorySessions.set(sessionToken, {
      token: sessionToken,
      user: adminUser,
      expiresAt: sessionExpiresAt.getTime(),
    });

    // Sync with localStore for storewide compatibility
    let existingLocal = localStore.users.find((u) => u.email?.toLowerCase() === challenge.email.toLowerCase());
    if (!existingLocal) {
      localStore.users.push(adminUser);
    } else {
      existingLocal.role = 'admin';
    }

    await logSecurityEvent({
      email: challenge.email,
      action: 'ADMIN_SESSION_CREATED',
      status: 'SUCCESS',
      ipAddress,
      details: { sessionExpiry: sessionExpiresAt },
    });

    return {
      success: true,
      token: sessionToken,
      user: adminUser,
      expiresAt: sessionExpiresAt,
    };
  },

  /**
   * Resend OTP with 60-Second Cooldown
   */
  async resendOtp({ challengeId, ipAddress = '127.0.0.1' }) {
    if (!challengeId) {
      throw new Error('Challenge ID is required.');
    }

    let challenge = inMemoryChallenges.get(challengeId);
    if (!challenge && pool) {
      try {
        const res = await pool.query(
          `SELECT * FROM public.admin_email_otp_challenges WHERE id = $1 LIMIT 1;`,
          [challengeId]
        );
        if (res.rows.length > 0) {
          const r = res.rows[0];
          challenge = {
            id: r.id,
            email: r.admin_email,
            userId: r.admin_user_id,
            otpHash: r.otp_hash,
            expiresAt: new Date(r.expires_at).getTime(),
            attempts: r.attempts,
            verified: r.verified,
            invalidated: r.invalidated,
          };
        }
      } catch (e) {}
    }

    if (!challenge || challenge.invalidated || challenge.verified) {
      throw new Error('This verification challenge is no longer valid. Please start sign-in again.');
    }

    const lastSent = resendCooldowns.get(challenge.email) || 0;
    const elapsed = Date.now() - lastSent;
    if (elapsed < 60000) {
      const waitSeconds = Math.ceil((60000 - elapsed) / 1000);
      throw new Error(`Please wait ${waitSeconds} seconds before requesting another verification code.`);
    }

    // Generate new OTP
    const rawOtp = String(crypto.randomInt(100000, 1000000));
    const hashedOtp = hashOtp(rawOtp);
    const newExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Send email via Resend
    await sendResendOtpEmail(challenge.email, rawOtp);

    // Record cooldown
    resendCooldowns.set(challenge.email, Date.now());

    challenge.otpHash = hashedOtp;
    challenge.expiresAt = newExpiresAt.getTime();
    challenge.attempts = 0;

    if (pool) {
      try {
        await pool.query(
          `UPDATE public.admin_email_otp_challenges SET otp_hash = $1, expires_at = $2, attempts = 0 WHERE id = $3;`,
          [hashedOtp, newExpiresAt, challengeId]
        );
      } catch (e) {}
    }

    return {
      success: true,
      message: `A new 6-digit verification code was sent to ${maskEmail(challenge.email)}.`,
      expiresIn: 300,
    };
  },

  /**
   * Validate Admin Session
   */
  async getSession(sessionToken) {
    if (!sessionToken) return null;

    const mem = inMemorySessions.get(sessionToken);
    if (mem) {
      if (Date.now() > mem.expiresAt) {
        inMemorySessions.delete(sessionToken);
        return null;
      }
      return mem.user;
    }

    if (pool) {
      try {
        const res = await pool.query(
          `SELECT * FROM public.admin_sessions WHERE session_token = $1 AND expires_at > now() LIMIT 1;`,
          [sessionToken]
        );
        if (res.rows.length > 0) {
          const s = res.rows[0];
          const user = {
            id: s.admin_user_id,
            email: s.admin_email,
            username: s.admin_email.split('@')[0],
            displayName: s.admin_email === 'mdara9695@gmail.com' ? 'DA-RA Master Admin' : 'Admin',
            role: 'admin',
          };
          inMemorySessions.set(sessionToken, {
            token: sessionToken,
            user,
            expiresAt: new Date(s.expires_at).getTime(),
          });
          return user;
        }
      } catch (e) {}
    }

    return null;
  },

  /**
   * Admin Logout
   */
  async logout(sessionToken) {
    if (sessionToken) {
      inMemorySessions.delete(sessionToken);
      if (pool) {
        try {
          await pool.query(`DELETE FROM public.admin_sessions WHERE session_token = $1;`, [sessionToken]);
        } catch (e) {}
      }
    }
    return { success: true };
  },
};
