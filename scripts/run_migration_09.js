import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.wzcerytdyboigwjyqkoc:NIHTHMARESTORE@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';

async function run() {
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const sqlPath = path.resolve(__dirname, '../../database/migrations/09_production_security_and_rls_hardening.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('🚀 Running Migration 09: Production Security & RLS Hardening...');
  await pool.query(sql);
  console.log('✅ Migration 09 executed successfully against Supabase database!');
  await pool.end();
}

run().catch((err) => {
  console.error('❌ Migration 09 failed:', err.message);
  process.exit(1);
});
