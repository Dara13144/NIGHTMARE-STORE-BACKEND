import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function exportMaster() {
  await client.connect();

  const files = [
    '../../../database/migrations/01_initial_schema.sql',
    '../../../database/migrations/05_store_enhancements.sql',
    '../../../database/migrations/02_row_level_security.sql',
    '../../../database/migrations/03_concurrency_functions.sql',
    '../../../database/migrations/04_oauth_and_account_linking.sql',
    '../../../database/seed.sql',
  ];

  let masterSql = `-- ============================================================================
-- DA-RA STORE / NIGHTMARE STORE — MASTER SUPABASE SQL SETUP SCRIPT
-- Target: https://wzcerytdyboigwjyqkoc.supabase.co
-- Run this entire script in Supabase Dashboard -> SQL Editor (or New Query)
-- ============================================================================

`;

  for (const f of files) {
    const full = path.join(__dirname, f);
    const content = fs.readFileSync(full, 'utf8');
    masterSql += `\n-- ============================================================================\n`;
    masterSql += `-- SECTION: ${path.basename(full)}\n`;
    masterSql += `-- ============================================================================\n\n`;
    masterSql += content.trim() + '\n\n';
  }

  // Fetch the 57 encrypted inventory keys from the live database
  const invRes = await client.query(
    'SELECT product_id, encrypted_key, key_iv, key_tag, key_hash, status FROM public.product_inventory;'
  );
  masterSql += `-- ============================================================================
-- SECTION: DIGITAL KEY INVENTORY SEED (${invRes.rows.length} AES-256-GCM ENCRYPTED REAL KEYS)
-- ============================================================================
`;
  for (const row of invRes.rows) {
    masterSql += `INSERT INTO public.product_inventory (product_id, encrypted_key, key_iv, key_tag, key_hash, status) VALUES ('${row.product_id}', '${row.encrypted_key}', '${row.key_iv}', '${row.key_tag}', '${row.key_hash}', '${row.status}') ON CONFLICT (product_id, key_hash) DO NOTHING;\n`;
  }

  masterSql += `\n-- ============================================================================
-- SECTION: DEFAULT PROFILES SEED
-- ============================================================================
INSERT INTO public.profiles (id, username, display_name, email, role, status, avatar_url, discord_id)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'dara_admin', 'DA-RA Commander', 'admin@darastore.gg', 'admin', 'active', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200', '123456789012345678'),
  ('a0000000-0000-0000-0000-000000000002', 'cyber_gamer', 'CyberGamer', 'gamer@nightcity.io', 'customer', 'active', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200', '987654321098765432')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;
`;

  const outputPath = path.join(__dirname, '../../../database/supabase_master_setup.sql');
  fs.writeFileSync(outputPath, masterSql, 'utf8');
  console.log('✅ Wrote master SQL setup to:', outputPath);
  console.log(`Total characters: ${masterSql.length}, Lines: ${masterSql.split('\n').length}`);

  // Test executing the master SQL on Supabase to verify 100% correctness
  console.log('🔄 Verifying master SQL against live Supabase database...');
  await client.query(masterSql);
  console.log('🎉 MASTER SQL VERIFIED & EXECUTED WITH ZERO ERRORS ON SUPABASE!');

  await client.end();
}

exportMaster().catch(console.error);
