import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

import { env } from './config/env.js';
import { apiLimiter, checkoutLimiter } from './middlewares/rateLimiter.js';
import { errorHandler } from './middlewares/errorHandler.js';
import {
  requestIdMiddleware,
  timeoutMiddleware,
  securityAuditLogger,
  checkDatabaseHealth,
} from './middlewares/security.js';

import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import discordVerificationRoutes from './routes/discordVerificationRoutes.js';
import stockRoutes from './routes/stockRoutes.js';
import adminAuthRoutes from './routes/adminAuthRoutes.js';
import { PaymentController } from './controllers/paymentController.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Trust Cloudflare and Reverse Proxies (Essential for accurate IP rate-limiting)
app.set('trust proxy', 1);

// 2. Request Correlation ID & Timeout Protection
app.use(requestIdMiddleware);
app.use(timeoutMiddleware(25000)); // 25s timeout prevents Slowloris socket exhaustion

// 3. Security Audit Logging
app.use(securityAuditLogger);

// 4. Enhanced Helmet Security Headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: { action: 'deny' }, // Clickjacking protection
    hidePoweredBy: true, // Conceal Express identity
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true, // MIME type sniffing protection
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

// 5. CORS Configuration with Origin Validation
const allowedOrigins = [
  env.APP_BASE_URL,
  env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server webhooks)
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        env.NODE_ENV !== 'production' ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.includes('vercel.app') ||
        origin.includes('netlify.app') ||
        origin.includes('onrender.com') ||
        origin.includes('github.io')
      ) {
        return callback(null, true);
      }
      return callback(new Error('Blocked by CORS policy: Origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-cart-session',
      'x-payment-signature',
      'x-cutluy-signature',
      'x-request-id',
    ],
    exposedHeaders: ['x-request-id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
  })
);

// 6. Tiered Body Parsers (Prevents JSON memory flooding attacks)
// Standard JSON endpoints capped to 1MB; high-res upload endpoint accepts up to 15MB
app.use((req, res, next) => {
  if (req.path === '/api/admin/upload-image') {
    return express.json({ limit: '15mb' })(req, res, next);
  }
  return express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })(req, res, next);
});

app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 7. Static Uploads Serving
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// 8. General API Rate Limiting
app.use('/api', apiLimiter);

// 9. Root & Info Endpoints
app.get(['/', '/api'], (req, res) => {
  res.json({
    success: true,
    message: 'NightmareStore Digital Store API Operational & Protected',
    version: '1.0.0',
    mode: env.IS_SUPABASE_CONFIGURED ? 'Supabase Connected' : 'Local In-Memory Engine',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    requestId: req.id,
  });
});

// 10. Uptime Monitoring Probes (24/7 Resilience)
// Public Liveness Probe: GET /health and /api/health
app.get(['/health', '/api/health'], (req, res) => {
  const memoryUsage = process.memoryUsage();
  res.json({
    status: 'healthy',
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsageMb: {
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    },
    version: '1.0.0',
    mode: env.IS_SUPABASE_CONFIGURED ? 'Supabase PostgreSQL' : 'Local In-Memory Engine',
    timestamp: new Date().toISOString(),
    requestId: req.id,
  });
});

// Deep Readiness Probe: GET /ready and /api/ready
app.get(['/ready', '/api/ready'], async (req, res) => {
  const dbHealth = await checkDatabaseHealth();
  const isHealthy = dbHealth.status !== 'unhealthy';

  const statusCode = isHealthy ? 200 : 503;
  return res.status(statusCode).json({
    status: isHealthy ? 'ready' : 'degraded',
    database: dbHealth,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    requestId: req.id,
  });
});

// 11. Redirect browser navigations for frontend routes to Vite frontend during dev
const FRONTEND_ROUTES = ['/checkout', '/dashboard', '/store', '/products', '/cart', '/categories', '/login', '/register', '/dashboard_login_adminpanel123456789Dara1111daradev1234nightmareStore', '/topup', '/orders', '/keys', '/thank-you', '/payment-failed'];
app.use((req, res, next) => {
  if (req.method === 'GET' && FRONTEND_ROUTES.some((r) => req.path === r || req.path.startsWith(r + '/'))) {
    return res.redirect(`http://localhost:5173${req.originalUrl}`);
  }
  next();
});

// 12. Mount Modular Routes with Route-Specific Protections
app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/account', authRoutes);
app.use('/api', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', checkoutLimiter, orderRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/discord', discordVerificationRoutes);
app.use('/api', stockRoutes);

// CutLuy Webhook Callback
app.post('/webhooks/cutluy', PaymentController.handleCutLuyWebhook);

// 13. 404 Route Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Endpoint ${req.method} ${req.originalUrl} not found`,
    requestId: req.id,
  });
});

// 14. Centralized Error Handler (Masks internal secrets and stack traces in production)
app.use(errorHandler);

export default app;
