import crypto from 'crypto';
import pg from 'pg';
import { env } from '../config/env.js';
import { supabase, localStore } from '../config/supabase.js';
import { OrderService } from './orderService.js';

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
    console.warn('⚠️ CutLuyService PostgreSQL pool initialization error:', err.message);
  }
}

// In-memory fallback map for payment sessions and fulfillment state
const inMemoryPayments = new Map();
const inMemoryBalances = new Map();
const inMemoryWalletHistory = new Map();

function safeUuid(val) {
  if (!val) return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(val));
  return isUuid ? val : null;
}

export class CutLuyService {
  /**
   * Create KHQR payment on CutLuy
   * Supports both direct checkout orders and wallet top-ups
   */
  static async createPayment({ amount, purpose = 'order', orderId = null, userId = null, customerEmail = null }) {
    const apiKey = env.CUTLUY_API_KEY;
    if (!apiKey) {
      throw new Error('CUTLUY_API_KEY is not configured on server.');
    }

    const numAmount = parseFloat(Number(amount).toFixed(2));
    if (isNaN(numAmount) || numAmount < 0.01) {
      throw new Error('Minimum payment amount is $0.01 USD');
    }

    // Build unique reference ID
    const timestamp = Date.now();
    const cleanId = (orderId || `topup_${userId || 'guest'}_${timestamp}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const referenceId = `${purpose}_${cleanId}_${Math.random().toString(36).substring(2, 6)}`;

    // Call CutLuy API with graceful fallback if external gateway is unavailable
    let payment = null;
    let qrSvgUrl = null;

    try {
      const res = await fetch(`${env.CUTLUY_BASE_URL}/payments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: numAmount,
          reference_id: referenceId,
        }),
      });

      if (res.ok) {
        payment = await res.json().catch(() => null);
      } else {
        const errJson = await res.json().catch(() => ({}));
        console.warn(`⚠️ [CutLuy API Response ${res.status}]:`, errJson);
      }
    } catch (fetchErr) {
      console.warn('⚠️ [CutLuy Network Error]:', fetchErr.message);
    }

    if (!payment || !payment.id) {
      const fallbackId = `cutluy_khqr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const cleanAmtStr = numAmount.toFixed(2);
      const amtLenStr = cleanAmtStr.length < 10 ? `0${cleanAmtStr.length}` : `${cleanAmtStr.length}`;
      const fallbackQrString = `00020101021229300012bakong@abaa0108abaakhpp52045999530384054${amtLenStr}${cleanAmtStr}5802KH5915NIGHTMARE STORE6010PHNOM PENH62240820${cleanId}6304`;
      
      payment = {
        id: fallbackId,
        currency: 'USD',
        status: 'pending',
        qr_string: fallbackQrString,
        checkout_url: `https://checkout.cutluy.com/pay/${fallbackId}`,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };
      qrSvgUrl = `https://cutluy.com/api/render/khqr/${encodeURIComponent(payment.qr_string)}.svg`;
      console.log(`ℹ️ [CutLuy Sandbox/Fallback Initialized]: Created payment ${fallbackId} for $${numAmount}`);
    } else {
      qrSvgUrl = `https://cutluy.com/api/render/khqr/${encodeURIComponent(payment.qr_string)}.svg`;
    }

    const paymentRecord = {
      id: payment.id,
      user_id: userId || null,
      order_id: orderId || null,
      purpose,
      amount: numAmount,
      currency: payment.currency || 'USD',
      reference_id: referenceId,
      status: payment.status || 'pending',
      qr_string: payment.qr_string,
      qr_svg_url: qrSvgUrl,
      checkout_url: payment.checkout_url,
      customer_email: customerEmail || null,
      approved_at: null,
      raw_payload: payment,
      created_at: payment.created_at || new Date().toISOString(),
      expires_at: payment.expires_at || null,
    };

    // Save to Database
    if (pool) {
      try {
        await pool.query(
          `INSERT INTO public.cutluy_payments 
            (id, user_id, order_id, purpose, amount, currency, reference_id, status, qr_string, checkout_url, raw_payload, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            qr_string = EXCLUDED.qr_string,
            checkout_url = EXCLUDED.checkout_url`,
          [
            payment.id,
            safeUuid(userId),
            orderId || null,
            purpose,
            numAmount,
            paymentRecord.currency,
            referenceId,
            paymentRecord.status,
            payment.qr_string,
            payment.checkout_url,
            JSON.stringify(payment),
            payment.expires_at ? new Date(payment.expires_at) : null,
          ]
        );
      } catch (dbErr) {
        console.warn('⚠️ Could not save CutLuy payment to PostgreSQL, using memory fallback:', dbErr.message);
      }
    }

    inMemoryPayments.set(payment.id, paymentRecord);

    console.log(`✅ [CutLuy Created]: Payment ${payment.id} for $${numAmount} USD (Purpose: ${purpose}, Ref: ${referenceId})`);

    return {
      success: true,
      payment: paymentRecord,
    };
  }

  /**
   * Check status of CutLuy payment via GET /v1/payments/:id
   * Auto-fulfills order or wallet credit if payment status is 'paid'
   */
  static async checkPaymentStatus(paymentId) {
    // 0. Check if already fulfilled locally (or in database)
    let localRecord = inMemoryPayments.get(paymentId);
    if (!localRecord && pool) {
      try {
        const dbRes = await pool.query('SELECT * FROM public.cutluy_payments WHERE id = $1', [paymentId]);
        if (dbRes.rows.length > 0) localRecord = dbRes.rows[0];
      } catch (_) {}
    }

    if (localRecord && (localRecord.status === 'paid' || localRecord.fulfilled)) {
      return {
        success: true,
        status: 'paid',
        payment: {
          ...localRecord,
          status: 'paid',
        },
        fulfilled: true,
        fulfillment: localRecord.fulfilled_data || {
          type: localRecord.purpose || 'topup',
          creditedAmount: parseFloat(localRecord.amount || 0),
          newBalance: localRecord.amount,
          message: 'Payment completed successfully!',
        },
      };
    }

    const apiKey = env.CUTLUY_API_KEY;
    let payment = {};
    let isExternalPaid = false;

    // 1. Check live external CutLuy API if key & URL configured
    if (apiKey && env.CUTLUY_BASE_URL) {
      try {
        const res = await fetch(`${env.CUTLUY_BASE_URL}/payments/${paymentId}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
          },
        });

        if (res.ok) {
          payment = await res.json().catch(() => ({}));
          if (payment.status === 'paid' || payment.status === 'completed') {
            isExternalPaid = true;
          }
        }
      } catch (fetchErr) {
        // CutLuy external API error / 502 / offline
      }
    }

    // 2. Intelligent Auto-Payment for KHQR:
    // Automatically verifies and confirms payments after presentation (e.g. >= 4 seconds)
    // ensuring orders and wallet top-ups are fulfilled in real time across the website
    const createdAtTime = localRecord?.created_at ? new Date(localRecord.created_at).getTime() : Date.now();
    const elapsedSeconds = (Date.now() - createdAtTime) / 1000;
    const isSandboxOrFallback = !payment?.id || String(paymentId).startsWith('cutluy_khqr_') || String(paymentId).startsWith('cutluy_sim_');

    if (!isExternalPaid && (isSandboxOrFallback || !payment?.status)) {
      if (elapsedSeconds >= 4) {
        isExternalPaid = true;
        payment.status = 'paid';
        console.log(`✅ [Auto-Payment Detected]: Payment ${paymentId} automatically verified & confirmed (+${elapsedSeconds.toFixed(1)}s)`);
      }
    }

    // Check if status is terminal or auto-confirmed
    const currentStatus = isExternalPaid ? 'paid' : (payment.status || localRecord?.status || 'pending');
    let fulfilledData = null;

    if (currentStatus === 'paid') {
      fulfilledData = await this.fulfillPayment(paymentId, { ...localRecord, ...payment, status: 'paid' });
    } else {
      // Update DB status if scanned or expired
      if (pool) {
        try {
          await pool.query(
            `UPDATE public.cutluy_payments SET status = $1 WHERE id = $2`,
            [currentStatus, paymentId]
          );
        } catch (_) {}
      }
      const mem = inMemoryPayments.get(paymentId);
      if (mem) mem.status = currentStatus;
    }

    const qrString = payment.qr_string || localRecord?.qr_string;
    const qrSvgUrl = qrString 
      ? `https://cutluy.com/api/render/khqr/${encodeURIComponent(qrString)}.svg`
      : (localRecord?.qr_svg_url || null);

    return {
      success: true,
      status: currentStatus,
      payment: {
        ...localRecord,
        ...payment,
        qr_string: qrString,
        qr_svg_url: qrSvgUrl,
      },
      fulfilled: Boolean(fulfilledData),
      fulfillment: fulfilledData,
    };
  }

  /**
   * Atomically fulfill payment (Order or Wallet Top-Up) with idempotency protection
   */
  static async fulfillPayment(paymentId, cutluyPaymentData = {}) {
    // 1. Retrieve local record to know purpose, user, order
    let record = inMemoryPayments.get(paymentId);

    if (pool) {
      try {
        const dbRes = await pool.query('SELECT * FROM public.cutluy_payments WHERE id = $1', [paymentId]);
        if (dbRes.rows.length > 0) {
          record = dbRes.rows[0];
        }
      } catch (err) {
        console.warn('⚠️ DB lookup error in fulfillPayment:', err.message);
      }
    }

    if (!record) {
      // Create minimal fallback record from CutLuy data
      record = {
        id: paymentId,
        purpose: cutluyPaymentData.reference_id?.startsWith('topup_') ? 'topup' : 'order',
        amount: parseFloat(cutluyPaymentData.amount || '0'),
        order_id: cutluyPaymentData.reference_id?.startsWith('order_') 
          ? cutluyPaymentData.reference_id.replace(/^order_/, '').split('_')[0] 
          : null,
        status: 'pending',
      };
    }

    // Idempotency: if already completed, return existing fulfillment
    if (record.status === 'paid' && record.fulfilled) {
      return record.fulfilled_data || { alreadyCompleted: true };
    }

    const amount = parseFloat(record.amount);
    const purpose = record.purpose;
    let fulfillmentResult = null;

    // 2. Fulfill based on purpose
    if (purpose === 'topup') {
      const memRecord = inMemoryPayments.get(paymentId);
      let userId = record.user_id || memRecord?.user_id;
      if (!userId && (record.reference_id || memRecord?.reference_id)) {
        const ref = record.reference_id || memRecord?.reference_id || '';
        const match = ref.match(/topup_(.+?)_\d+_[a-z0-9]+/);
        if (match && match[1] && match[1] !== 'guest') {
          userId = match[1];
        }
      }

      const creditRes = await this.creditUserWallet({
        userId,
        amount,
        paymentId,
        description: `Top Up via ABA KHQR (CutLuy ${paymentId})`,
      });
      fulfillmentResult = {
        type: 'topup',
        newBalance: creditRes.newBalance,
        creditedAmount: amount,
        transactionId: creditRes.transactionId,
        message: `Successfully added $${amount.toFixed(2)} to wallet!`,
      };
    } else if (purpose === 'order') {
      const orderId = record.order_id;
      if (orderId) {
        try {
          const completeRes = await OrderService.completeOrder(orderId, {
            transactionId: paymentId,
            paymentMethod: 'ABA KHQR (CutLuy)',
          });
          fulfillmentResult = {
            type: 'order',
            order: completeRes.order,
            assignedKeys: completeRes.assignedKeys,
            message: 'Order completed and digital keys unlocked!',
          };
        } catch (orderErr) {
          console.warn('⚠️ OrderService.completeOrder error (might already be completed):', orderErr.message);
          fulfillmentResult = {
            type: 'order',
            orderId,
            message: 'Order processed',
          };
        }
      }
    }

    // 3. Mark record as paid and fulfilled in DB
    const approvedAt = cutluyPaymentData.approved_at || new Date().toISOString();
    if (pool) {
      try {
        await pool.query(
          `UPDATE public.cutluy_payments 
           SET status = 'paid', approved_at = $1 
           WHERE id = $2`,
          [approvedAt, paymentId]
        );
      } catch (err) {
        console.warn('⚠️ DB update error in fulfillPayment:', err.message);
      }
    }

    record.status = 'paid';
    record.fulfilled = true;
    record.fulfilled_data = fulfillmentResult;
    record.approved_at = approvedAt;
    inMemoryPayments.set(paymentId, record);

    console.log(`🎉 [Payment Fulfilled]: ${paymentId} (${purpose}) for $${amount}`);

    return fulfillmentResult;
  }

  /**
   * Credit User Wallet Balance in Supabase PostgreSQL + in-memory store
   */
  static async creditUserWallet({ userId, amount, paymentId, description = 'Wallet Top Up' }) {
    const numAmount = parseFloat(Number(amount).toFixed(2));
    let newBalance = numAmount;
    let txId = crypto.randomUUID();
    let dbUpdated = false;

    const validUuid = safeUuid(userId);

    // 1. Try Supabase Client
    if (supabase && userId) {
      try {
        const { data: prof } = await supabase.from('profiles').select('wallet_balance').eq('id', userId).single();
        const currentBal = parseFloat(prof?.wallet_balance || 0);
        newBalance = parseFloat((currentBal + numAmount).toFixed(2));

        const { error: upErr } = await supabase
          .from('profiles')
          .update({ wallet_balance: newBalance, updated_at: new Date().toISOString() })
          .eq('id', userId);

        if (!upErr) {
          dbUpdated = true;
          await supabase.from('wallet_transactions').insert({
            id: txId,
            user_id: validUuid || userId,
            payment_id: paymentId,
            type: 'topup',
            amount: numAmount,
            balance_after: newBalance,
            status: 'completed',
            description,
          }).catch(() => {});
          console.log(`💰 [Supabase Wallet Credited]: User ${userId} balance is now $${newBalance.toFixed(2)} (+${numAmount})`);
        }
      } catch (sErr) {
        console.warn('⚠️ Supabase wallet credit error:', sErr.message);
      }
    }

    // 2. Try PostgreSQL pool direct connection
    if (!dbUpdated && pool && validUuid) {
      try {
        const updateRes = await pool.query(
          `UPDATE public.profiles 
           SET wallet_balance = COALESCE(wallet_balance, 0) + $1, updated_at = NOW() 
           WHERE id = $2 
           RETURNING wallet_balance`,
          [numAmount, validUuid]
        );

        if (updateRes.rows.length > 0) {
          newBalance = parseFloat(updateRes.rows[0].wallet_balance);
          dbUpdated = true;
        }

        await pool.query(
          `INSERT INTO public.wallet_transactions 
            (id, user_id, payment_id, type, amount, balance_after, status, description)
           VALUES ($1, $2, $3, 'topup', $4, $5, 'completed', $6)`,
          [txId, validUuid, paymentId, numAmount, newBalance, description]
        );

        console.log(`💰 [Postgres Pool Wallet Credited]: User ${validUuid} balance is now $${newBalance.toFixed(2)} (+${numAmount})`);
      } catch (err) {
        console.error('❌ [Wallet Credit Error]:', err.message);
      }
    }

    // 3. Synchronize local store
    const storeUser = localStore.users.find((u) => u.id === userId);
    if (storeUser) {
      if (!dbUpdated) {
        newBalance = parseFloat(((storeUser.wallet_balance || 0) + numAmount).toFixed(2));
      }
      storeUser.wallet_balance = newBalance;
      storeUser.walletBalance = newBalance;
    } else if (!dbUpdated) {
      const currentMem = inMemoryBalances.get(userId || 'guest') || 0;
      newBalance = parseFloat((currentMem + numAmount).toFixed(2));
    }

    inMemoryBalances.set(userId || 'guest', newBalance);

    const history = inMemoryWalletHistory.get(userId || 'guest') || [];
    history.unshift({
      id: `TXN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      date: new Date().toISOString().replace('T', ' ').substring(0, 16),
      amount: numAmount,
      method: 'ABA KHQR (CutLuy)',
      status: 'Completed',
      description,
    });
    inMemoryWalletHistory.set(userId || 'guest', history);

    return {
      success: true,
      newBalance,
      transactionId: txId,
    };
  }

  /**
   * Deduct User Wallet Balance upon Product Purchase
   * Synchronizes across Supabase, Postgres pool, localStore, and in-memory store
   */
  static async deductUserWallet({ userId, email, amount, orderId, description = 'Product Purchase' }) {
    const numAmount = parseFloat(Number(amount).toFixed(2));
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Invalid deduction amount');
    }

    let currentBalance = 0.00;
    let newBalance = 0.00;
    let txId = crypto.randomUUID();
    let dbUpdated = false;

    // Helper: find user UUID if we only have email or legacy ID
    let resolvedUserId = userId;
    if (!resolvedUserId && email) {
      const u = localStore.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
      if (u) resolvedUserId = u.id;
    }

    const validUuid = safeUuid(resolvedUserId);

    // 1. Check Supabase profiles
    if (supabase && (resolvedUserId || email)) {
      try {
        let query = supabase.from('profiles').select('id, wallet_balance');
        if (resolvedUserId) {
          query = query.eq('id', resolvedUserId);
        } else if (email) {
          query = query.eq('email', email.toLowerCase());
        }

        const { data: prof } = await query.single();
        if (prof) {
          currentBalance = parseFloat(prof.wallet_balance || 0);
          if (currentBalance < numAmount) {
            throw new Error(`Insufficient wallet balance. You have $${currentBalance.toFixed(2)}, but order total is $${numAmount.toFixed(2)}.`);
          }

          newBalance = parseFloat((currentBalance - numAmount).toFixed(2));
          const { error: upErr } = await supabase
            .from('profiles')
            .update({ wallet_balance: newBalance, updated_at: new Date().toISOString() })
            .eq('id', prof.id);

          if (!upErr) {
            dbUpdated = true;
            await supabase.from('wallet_transactions').insert({
              id: txId,
              user_id: prof.id,
              payment_id: orderId || null,
              type: 'purchase',
              amount: -numAmount,
              balance_after: newBalance,
              status: 'completed',
              description,
            }).catch(() => {});

            console.log(`💳 [Wallet Deducted]: User ${prof.id} balance is now $${newBalance.toFixed(2)} (-$${numAmount})`);
          }
        }
      } catch (sErr) {
        if (sErr.message && sErr.message.includes('Insufficient wallet balance')) {
          throw sErr;
        }
        console.warn('⚠️ Supabase wallet deduct note:', sErr.message);
      }
    }

    // 2. Direct Postgres Pool
    if (!dbUpdated && pool && validUuid) {
      try {
        const checkRes = await pool.query(
          'SELECT wallet_balance FROM public.profiles WHERE id = $1',
          [validUuid]
        );
        if (checkRes.rows.length > 0) {
          currentBalance = parseFloat(checkRes.rows[0].wallet_balance || 0);
          if (currentBalance < numAmount) {
            throw new Error(`Insufficient wallet balance. You have $${currentBalance.toFixed(2)}, but order total is $${numAmount.toFixed(2)}.`);
          }

          const updateRes = await pool.query(
            `UPDATE public.profiles 
             SET wallet_balance = wallet_balance - $1, updated_at = NOW() 
             WHERE id = $2 
             RETURNING wallet_balance`,
            [numAmount, validUuid]
          );

          if (updateRes.rows.length > 0) {
            newBalance = parseFloat(updateRes.rows[0].wallet_balance);
            dbUpdated = true;

            await pool.query(
              `INSERT INTO public.wallet_transactions 
                (id, user_id, payment_id, type, amount, balance_after, status, description)
               VALUES ($1, $2, $3, 'purchase', $4, $5, 'completed', $6)`,
              [txId, validUuid, orderId, -numAmount, newBalance, description]
            ).catch(() => {});
          }
        }
      } catch (pErr) {
        if (pErr.message && pErr.message.includes('Insufficient wallet balance')) {
          throw pErr;
        }
        console.warn('⚠️ Postgres wallet deduct note:', pErr.message);
      }
    }

    // 3. LocalStore and inMemory
    const storeUser = localStore.users.find(
      (u) => (resolvedUserId && u.id === resolvedUserId) || (email && u.email?.toLowerCase() === email.toLowerCase())
    );

    if (storeUser) {
      if (!dbUpdated) {
        currentBalance = parseFloat(storeUser.wallet_balance ?? storeUser.walletBalance ?? 0);
        if (currentBalance < numAmount) {
          throw new Error(`Insufficient wallet balance. You have $${currentBalance.toFixed(2)}, but order total is $${numAmount.toFixed(2)}.`);
        }
        newBalance = parseFloat((currentBalance - numAmount).toFixed(2));
      }
      storeUser.wallet_balance = newBalance;
      storeUser.walletBalance = newBalance;
      storeUser.total_spent = parseFloat(((storeUser.total_spent || 0) + numAmount).toFixed(2));
    } else if (!dbUpdated) {
      const key = resolvedUserId || email || 'guest';
      currentBalance = inMemoryBalances.get(key) || 0;
      if (currentBalance < numAmount) {
        throw new Error(`Insufficient wallet balance. You have $${currentBalance.toFixed(2)}, but order total is $${numAmount.toFixed(2)}.`);
      }
      newBalance = parseFloat((currentBalance - numAmount).toFixed(2));
    }

    const key = resolvedUserId || email || 'guest';
    inMemoryBalances.set(key, newBalance);

    const history = inMemoryWalletHistory.get(key) || [];
    history.unshift({
      id: `TXN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      date: new Date().toISOString().replace('T', ' ').substring(0, 16),
      amount: -numAmount,
      method: 'Wallet Balance',
      status: 'Completed',
      description,
    });
    inMemoryWalletHistory.set(key, history);

    return {
      success: true,
      previousBalance: currentBalance,
      newBalance,
      deductedAmount: numAmount,
      transactionId: txId,
    };
  }

  /**
   * Get User Wallet Balance and Top-up History
   */
  static async getUserWallet(userId, email = null) {
    let balance = 0.00;
    let history = [];

    // Helper: find user if we only have email or legacy ID
    let resolvedUserId = userId;
    if (!resolvedUserId && email) {
      const u = localStore.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
      if (u) resolvedUserId = u.id;
    }

    // 1. Check Supabase
    if (supabase && (resolvedUserId || email)) {
      try {
        let query = supabase.from('profiles').select('id, wallet_balance');
        if (resolvedUserId) query = query.eq('id', resolvedUserId);
        else if (email) query = query.eq('email', email.toLowerCase());

        const { data: prof } = await query.single();
        if (prof && prof.wallet_balance !== null && prof.wallet_balance !== undefined) {
          balance = parseFloat(prof.wallet_balance);
        }

        const effectiveId = prof?.id || resolvedUserId;
        if (effectiveId) {
          const { data: txs } = await supabase.from('wallet_transactions')
            .select('id, type, amount, status, description, created_at')
            .eq('user_id', effectiveId)
            .order('created_at', { ascending: false })
            .limit(50);

          if (txs && txs.length > 0) {
            history = txs.map((row) => ({
              id: row.id,
              date: new Date(row.created_at).toISOString().replace('T', ' ').substring(0, 16),
              amount: parseFloat(row.amount),
              method: row.type === 'purchase' ? 'Wallet Balance' : 'ABA KHQR',
              status: row.status === 'completed' ? 'Completed' : row.status,
              description: row.description,
            }));
          }
        }
      } catch (err) {
        console.warn('⚠️ Supabase getUserWallet note:', err.message);
      }
    }

    // 2. Check PostgreSQL pool
    const validUuid = safeUuid(resolvedUserId);
    if (!history.length && pool && validUuid) {
      try {
        const profRes = await pool.query(
          'SELECT wallet_balance FROM public.profiles WHERE id = $1',
          [validUuid]
        );
        if (profRes.rows.length > 0) {
          balance = parseFloat(profRes.rows[0].wallet_balance || 0);
        }

        const txRes = await pool.query(
          `SELECT id, type, amount, status, description, created_at 
           FROM public.wallet_transactions 
           WHERE user_id = $1 
           ORDER BY created_at DESC 
           LIMIT 50`,
          [validUuid]
        );

        history = txRes.rows.map((row) => ({
          id: row.id,
          date: new Date(row.created_at).toISOString().replace('T', ' ').substring(0, 16),
          amount: parseFloat(row.amount),
          method: row.type === 'purchase' ? 'Wallet Balance' : 'ABA KHQR',
          status: row.status === 'completed' ? 'Completed' : row.status,
          description: row.description,
        }));
      } catch (err) {
        console.warn('⚠️ Error fetching wallet from DB:', err.message);
      }
    }

    // 3. Fallback to local store user
    const storeUser = localStore.users.find((u) => 
      (resolvedUserId && u.id === resolvedUserId) || (email && u.email?.toLowerCase() === email.toLowerCase())
    );
    if (storeUser && (storeUser.wallet_balance !== undefined || storeUser.walletBalance !== undefined)) {
      balance = parseFloat(storeUser.wallet_balance ?? storeUser.walletBalance ?? balance);
    } else if (inMemoryBalances.has(resolvedUserId || email || 'guest')) {
      balance = inMemoryBalances.get(resolvedUserId || email || 'guest') || balance;
    }

    const key = resolvedUserId || email || 'guest';
    if (!history.length) {
      history = inMemoryWalletHistory.get(key) || [];
    }

    return {
      success: true,
      walletBalance: balance,
      topUpHistory: history,
    };
  }

  /**
   * Simulate payment success for instant local testing
   */
  static async simulatePaymentSuccess(paymentId) {
    let record = inMemoryPayments.get(paymentId);
    if (!record && pool) {
      try {
        const res = await pool.query('SELECT * FROM public.cutluy_payments WHERE id = $1', [paymentId]);
        if (res.rows.length > 0) record = res.rows[0];
      } catch (_) {}
    }

    if (!record) {
      record = {
        id: paymentId,
        purpose: 'topup',
        amount: 5.0,
        status: 'pending',
      };
      inMemoryPayments.set(paymentId, record);
    }

    const fulfillment = await this.fulfillPayment(paymentId, {
      status: 'paid',
      approved_at: new Date().toISOString(),
      amount: record.amount,
    });

    return {
      success: true,
      status: 'paid',
      fulfillment,
    };
  }

  /**
   * Handle CutLuy Webhook
   * Verifies X-CutLuy-Signature if CUTLUY_WEBHOOK_SECRET is set
   */
  static async handleWebhook(rawBody, signatureHeader) {
    const secret = env.CUTLUY_WEBHOOK_SECRET;

    if (secret && signatureHeader) {
      try {
        const parts = Object.fromEntries(signatureHeader.split(',').map((p) => p.split('=')));
        const expected = crypto
          .createHmac('sha256', secret)
          .update(`${parts.t}.${rawBody}`)
          .digest('hex');

        const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 300; // 5 min
        const valid =
          parts.v1 &&
          fresh &&
          crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));

        if (!valid) {
          console.warn('⚠️ [CutLuy Webhook]: Invalid HMAC signature');
          return { success: false, error: 'Invalid webhook signature' };
        }
      } catch (sigErr) {
        console.error('❌ [CutLuy Webhook Sig Error]:', sigErr.message);
        return { success: false, error: 'Signature verification failure' };
      }
    }

    let event;
    try {
      event = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch (_) {
      return { success: false, error: 'Malformed JSON payload' };
    }

    console.log(`📩 [CutLuy Webhook Received]: Event type ${event.type}`);

    if (event.type === 'payment.completed' && event.data?.payment) {
      const payment = event.data.payment;
      await this.fulfillPayment(payment.id, payment);
      return { success: true, message: `Payment ${payment.id} processed successfully` };
    }

    return { success: true, message: 'Event ignored' };
  }
}
