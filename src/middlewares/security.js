import crypto from 'crypto';
import pg from 'pg';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';

/**
 * 1. Request Correlation ID Middleware
 * Assigns or propagates a unique UUID per request for distributed tracing and incident investigation.
 */
export function requestIdMiddleware(req, res, next) {
  const correlationId = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = correlationId;
  res.setHeader('x-request-id', correlationId);
  next();
}

/**
 * 2. Request Timeout Middleware
 * Prevents Slowloris / hanging connections from exhausting server resources.
 * Sets a 25-second limit for standard API requests.
 */
export function timeoutMiddleware(timeoutMs = 25000) {
  return (req, res, next) => {
    // Skip timeouts for long file uploads if needed
    if (req.path.includes('/upload')) {
      return next();
    }

    const timer = setTimeout(() => {
      if (!res.headersSent) {
        console.warn(`⚠️ [Request Timeout]: ${req.method} ${req.originalUrl} [ID: ${req.id}] exceeded ${timeoutMs}ms`);
        res.status(504).json({
          success: false,
          error: 'Gateway timeout: Request took too long to complete.',
          requestId: req.id,
        });
      }
    }, timeoutMs);

    // Clear timeout upon response finish
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));

    next();
  };
}

/**
 * 3. Security Audit Logger
 * Logs incoming request metadata without EVER recording passwords, tokens, or digital keys.
 */
export function securityAuditLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const isSensitive = req.originalUrl.includes('/auth') || req.originalUrl.includes('/admin') || req.originalUrl.includes('/payment');

    // Filter out noisy status checks
    if (req.originalUrl === '/health' || req.originalUrl === '/api/health') return;

    if (res.statusCode >= 400 || isSensitive) {
      const clientIp = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.ip;
      const statusIcon = res.statusCode >= 500 ? '🚨' : res.statusCode >= 400 ? '⚠️' : '✅';

      console.log(
        `${statusIcon} [HTTP ${res.statusCode}] ${req.method} ${req.originalUrl} | IP: ${clientIp} | Time: ${duration}ms | ID: ${req.id}`
      );
    }
  });

  next();
}

/**
 * 4. Database Readiness Checker (Deep Health Probe)
 * Tests actual PostgreSQL database connectivity with a strict 3-second timeout.
 */
let testPool = null;
if (env.DATABASE_URL) {
  try {
    testPool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 3000,
    });
  } catch (err) {
    // Fallback quietly
  }
}

export async function checkDatabaseHealth() {
  const start = Date.now();

  try {
    if (testPool) {
      const client = await testPool.connect();
      try {
        await client.query('SELECT 1');
        return {
          status: 'connected',
          driver: 'pg_pool',
          latencyMs: Date.now() - start,
        };
      } finally {
        client.release();
      }
    }

    if (supabase) {
      const { error } = await supabase.from('profiles').select('id').limit(1);
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      return {
        status: 'connected',
        driver: 'supabase_rest',
        latencyMs: Date.now() - start,
      };
    }

    return {
      status: 'in_memory_ready',
      driver: 'local_store',
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      error: err.message,
      latencyMs: Date.now() - start,
    };
  }
}
