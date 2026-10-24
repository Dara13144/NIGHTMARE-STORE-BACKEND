import app from './app.js';
import { env } from './config/env.js';
import { discordBot } from './services/discordBotService.js';

// Production & Local Port Configuration
const PORT = env.PORT || 5050;

const server = app.listen(PORT, async () => {
  console.log(`
  ======================================================
  🎮 NIGHTMARE STORE BACKEND API STARTED
  ======================================================
  🚀 Server URL:      http://localhost:${PORT}
  📡 Liveness Check:  http://localhost:${PORT}/health
  🩺 Readiness Check: http://localhost:${PORT}/ready
  🛡️  Security:        Cloudflare Proxy Trust, Helmet, CORS, Rate-Limiting
  🔐 Admin 2FA:       Argon2/HMAC Cryptographic OTP Sessions
  🗄️  Database Mode:   ${env.IS_SUPABASE_CONFIGURED ? 'Supabase PostgreSQL' : 'Local In-Memory Engine'}
  ======================================================
  `);

  // Initialize Discord Bot Service safely
  try {
    await discordBot.initialize();
  } catch (err) {
    console.warn('⚠️ Discord Bot init warning:', err.message);
  }
});

// Graceful Shutdown & Connection Draining (Requirement 6: 24/7 Resilience)
function handleGracefulShutdown(signal) {
  console.log(`\n🛑 [${signal}] Received. Shutting down gracefully...`);

  // Close accepting new connections
  server.close(async () => {
    console.log('✅ HTTP server closed. Active connections drained.');
    try {
      // Disconnect Discord bot if active
      if (discordBot?.client?.destroy) {
        discordBot.client.destroy();
      }
    } catch (e) {
      // Quiet fallback
    }
    console.log('🏁 Process exited cleanly.');
    process.exit(0);
  });

  // Force shutdown if connections do not close within 10 seconds
  setTimeout(() => {
    console.error('⚠️ [Force Exit]: Active connections could not be closed in time.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

// Prevent uncaught errors from crashing without logs
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 [Unhandled Rejection]:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('🚨 [Uncaught Exception]:', err);
});
