import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL is missing in server/.env');
  process.exit(1);
}

console.log('🔄 Connecting to Supabase PostgreSQL Database...');

const client = new pg.Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function runMigrations() {
  try {
    await client.connect();
    console.log('✅ Connected to remote Supabase PostgreSQL successfully!');

    const files = [
      '../../../database/migrations/01_initial_schema.sql',
      '../../../database/migrations/02_row_level_security.sql',
      '../../../database/migrations/03_concurrency_functions.sql',
      '../../../database/migrations/04_oauth_and_account_linking.sql',
      '../../../database/migrations/05_store_enhancements.sql',
      '../../../database/seed.sql',
    ];

    for (const relPath of files) {
      const fullPath = path.join(__dirname, relPath);
      const filename = path.basename(fullPath);
      console.log(`\n⏳ Applying ${filename}...`);

      const sql = fs.readFileSync(fullPath, 'utf8');
      await client.query(sql);
      console.log(`✅ ${filename} executed successfully.`);
    }

    // Verify tables
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log('\n📊 Tables in public schema:');
    tableRes.rows.forEach((r) => console.log(`   - ${r.table_name}`));

    // Verify products count
    const prodRes = await client.query('SELECT count(*) FROM public.products;');
    console.log(`\n🎮 Products count: ${prodRes.rows[0].count}`);

    // Verify coupons count
    const couponRes = await client.query('SELECT count(*) FROM public.coupons;');
    console.log(`🏷️ Coupons count: ${couponRes.rows[0].count}`);

    console.log('\n🎉 ALL SUPABASE MIGRATIONS AND SEEDS DEPLOYED SUCCESSFULLY TO YOUR LIVE DATABASE!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

runMigrations();
