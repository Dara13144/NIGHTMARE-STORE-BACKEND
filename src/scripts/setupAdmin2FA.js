import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function main() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL.');

    // Update mdara9695@gmail.com to admin role
    const updateRes = await client.query(`
      UPDATE profiles 
      SET role = 'admin' 
      WHERE email = 'mdara9695@gmail.com'
      RETURNING id, username, email, role;
    `);
    console.log('Updated user to admin:', updateRes.rows);

    // Apply 07_admin_email_otp_and_sessions migration
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.admin_email_otp_challenges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_email TEXT NOT NULL,
        admin_user_id TEXT,
        otp_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        verified BOOLEAN NOT NULL DEFAULT false,
        invalidated BOOLEAN NOT NULL DEFAULT false,
        ip_address TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_admin_otp_email ON public.admin_email_otp_challenges(admin_email);
      CREATE INDEX IF NOT EXISTS idx_admin_otp_created ON public.admin_email_otp_challenges(created_at);

      CREATE TABLE IF NOT EXISTS public.admin_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_email TEXT NOT NULL,
        admin_user_id TEXT NOT NULL,
        session_token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON public.admin_sessions(session_token);

      CREATE TABLE IF NOT EXISTS public.admin_security_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_email TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        ip_address TEXT,
        details JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_admin_logs_email ON public.admin_security_logs(admin_email);
      CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON public.admin_security_logs(created_at);
    `);
    console.log('✅ Admin OTP and session tables created successfully.');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    await client.end();
  }
}

main();
