import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = 'postgresql://postgres.wzcerytdyboigwjyqkoc:NIHTHMARESTORE@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';

async function run() {
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const sqlPath = path.resolve(__dirname, '../../database/migrations/08_cutluy_payments_and_wallet.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('🚀 Running CutLuy migration...');
  await pool.query(sql);
  console.log('✅ Migration 08_cutluy_payments_and_wallet.sql executed successfully!');
  await pool.end();
}

run().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
