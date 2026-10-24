# 🎮 NIGHTMARE STORE — High-Performance Digital Goods Backend

Production-grade, highly secure REST API and Discord Bot engine powering **NIGHTMARE STORE**. Built with Node.js (ES Modules), Supabase PostgreSQL, AES-256-GCM digital key encryption, ABA KHQR (CutLuy) automated payment gateway, Argon2 2FA cryptographic sessions, and Discord OAuth2 synchronization.

[![GitHub License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/database-Supabase%20PostgreSQL-3ECF8E.svg)](https://supabase.com/)
[![Security](https://img.shields.io/badge/security-AES--256--GCM-critical.svg)](https://nodejs.org/api/crypto.html)

---

## 🌟 Key Features

- **🔐 Cryptographic Security & Digital Vault**:
  - Digital game keys and credentials encrypted with AES-256-GCM with unique IVs and HMAC authentication tags.
  - Delivered keys are decrypted on-demand specifically for authenticated customers upon verified payment.
  - Argon2 cryptographic OTP sessions for NMC Administrative routes.
- **🛒 Shopping Cart & Atomic Inventory**:
  - High-concurrency atomic stock reservation to prevent overselling or race conditions.
  - Automatic key allocation upon verified payment.
  - Real-time stock status calculations (`In Stock`, `Low Stock`, `Out of Stock`).
- **💳 Multi-Channel Payment & Wallet Engine**:
  - Integrated ABA KHQR automated top-up and instant payment confirmation.
  - In-store wallet balance deduction with automated overdraft protection.
  - Promo coupon redemption engine with percentage and fixed amount discounts.
- **🤖 Discord Bot & Web Synchronization**:
  - Real-time Discord Bot (`NIHTHMARE STORE#0556`) slash command registration.
  - Instant member role synchronization, customer purchase verification, and automated key delivery.
- **🛡️ Production Hardening**:
  - Cloudflare proxy trust, Helmet CSP, strict CORS credentials, and IP rate-limiting (`checkoutLimiter`, `authLimiter`).
  - Request tracking with unique `x-request-id` UUIDs.

---

## 🏗️ Architecture & Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js v18+ (ES Modules) |
| **Framework** | Express.js 4.21+ |
| **Database** | Supabase PostgreSQL (`pg` connection pool + `@supabase/supabase-js`) |
| **Authentication** | JWT, Discord OAuth2, Google OAuth2, Argon2 / HMAC OTP |
| **Encryption** | Node.js `crypto` (AES-256-GCM, SHA-256 key hashing) |
| **Bot Automation** | Discord.js v14 |
| **Validation** | Zod schema validation |

---

## 📡 API Reference

### 1. Authentication (`/api/auth`)
- `POST /api/auth/register` — Create new customer account.
- `POST /api/auth/login` — Password-based login returning JWT session.
- `GET /api/auth/me` — Retrieve current authenticated profile & wallet balance.
- `GET /api/auth/discord` — Discord OAuth2 authorization URL generator.
- `POST /api/auth/discord/callback` — Exchange Discord authorization code.
- `POST /api/auth/google` — Google OAuth2 credential verification.

### 2. Cart Management (`/api/cart`)
- `GET /api/cart` — Get active cart items, subtotal, and stock validation.
- `POST /api/cart/items` — Add product to cart with atomic stock validation.
- `PUT /api/cart/items/:id` — Update quantity of item in cart.
- `DELETE /api/cart/items/:id` — Remove specific item from cart.
- `DELETE /api/cart` — Clear all items in active cart session.

### 3. Orders & Digital Keys (`/api/orders`)
- `POST /api/orders` — Complete order checkout (Wallet balance or payment gateway).
- `GET /api/orders` — List customer purchase orders with product details and delivered keys.
- `GET /api/orders/:id` — Get detailed order summary and delivery status.
- `GET /api/orders/:id/keys` — Retrieve decrypted digital activation codes / credentials.
- `POST /api/orders/validate-coupon` — Validate promotional discount vouchers.

### 4. Products & Catalog (`/api/products`)
- `GET /api/products` — List active storefront catalog items with real-time stock.
- `GET /api/products/:slug` — Get comprehensive product details, platform, and instructions.
- `GET /api/products/categories` — List available product categories.

### 5. Health & Monitoring
- `GET /health` — Liveness probe, memory usage, and uptime.
- `GET /ready` — Readiness probe, PostgreSQL connection latency, and pool status.

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 18.0.0 or higher
- npm 9.0.0 or higher
- Supabase Project or PostgreSQL database

### 2. Installation
```bash
git clone https://github.com/Dara13144/NIGHTMARE-STORE-BACKEND.git
cd NIGHTMARE-STORE-BACKEND
npm install
```

### 3. Configuration
Copy the template configuration file:
```bash
cp .env.example .env
```
Fill in your configuration variables in `.env`:
```env
PORT=5050
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# Database & Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
DATABASE_URL=postgres://...

# Cryptographic Keys (32 bytes hex)
ENCRYPTION_KEY=your_64_character_hex_encryption_key
JWT_SECRET=your_strong_jwt_secret

# Discord Bot
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_GUILD_ID=your_guild_id
```

### 4. Running the Server
```bash
# Development mode with file watching
npm run dev

# Production mode
npm start

# Run test suite
npm test
```

---

## 🔒 Security & Best Practices

- Digital keys are stored encrypted at rest with **AES-256-GCM**.
- Sensitive environment variables are kept strictly out of git version control via `.gitignore`.
- Rate limiting prevents brute force attacks on authentication and order creation routes.

---

## 📄 License
This project is licensed under the MIT License.