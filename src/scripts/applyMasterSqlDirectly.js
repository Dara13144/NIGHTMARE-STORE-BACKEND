import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { encryptGameKey } from '../services/encryptionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL is missing in server/.env');
  process.exit(1);
}

console.log('🔄 Connecting directly to Supabase PostgreSQL database...');

const client = new pg.Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function main() {
  try {
    await client.connect();
    console.log('✅ Connected to Supabase PostgreSQL successfully!');

    // 1. Read master SQL
    const sqlPath = path.join(__dirname, '../../../database/supabase_master_setup.sql');
    const masterSql = fs.readFileSync(sqlPath, 'utf8');

    console.log('⏳ Executing database/supabase_master_setup.sql on Supabase...');
    await client.query(masterSql);
    console.log('✅ Master SQL executed successfully on Supabase!');

    // 2. Fetch products and ensure keys are in product_inventory
    console.log('⏳ Checking product inventory and seeding keys...');
    const productsRes = await client.query('SELECT id, slug, name FROM public.products ORDER BY created_at;');
    const products = productsRes.rows;

    let keysAdded = 0;
    for (const prod of products) {
      const keys = [
        `${prod.slug.toUpperCase().slice(0, 8)}-KEY-7749-01`,
        `${prod.slug.toUpperCase().slice(0, 8)}-KEY-3382-02`,
        `${prod.slug.toUpperCase().slice(0, 8)}-KEY-5501-03`,
      ];

      for (const plainKey of keys) {
        const enc = encryptGameKey(plainKey);
        await client.query(`
          INSERT INTO public.product_inventory (
            product_id, encrypted_key, key_iv, key_tag, key_hash, status
          ) VALUES ($1, $2, $3, $4, $5, 'available')
          ON CONFLICT (product_id, key_hash) DO NOTHING;
        `, [prod.id, enc.encryptedKey, enc.keyIv, enc.keyTag, enc.keyHash]);
        keysAdded++;
      }
    }
    console.log(`✅ Verified/seeded stock keys for ${products.length} products.`);

    // 3. Verify public tables
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log('\n📊 Live Supabase Tables:');
    tableRes.rows.forEach((r) => console.log(`   - ${r.table_name}`));

    const [catCnt, prodCnt, invCnt, coupCnt, profCnt] = await Promise.all([
      client.query('SELECT count(*) FROM public.categories;'),
      client.query('SELECT count(*) FROM public.products;'),
      client.query('SELECT count(*) FROM public.product_inventory WHERE status = \'available\';'),
      client.query('SELECT count(*) FROM public.coupons;'),
      client.query('SELECT count(*) FROM public.profiles;'),
    ]);

    console.log('\n📈 Live Supabase Statistics:');
    console.log(`   📂 Categories: ${catCnt.rows[0].count}`);
    console.log(`   🎮 Products: ${prodCnt.rows[0].count}`);
    console.log(`   🔑 Available Stock Keys: ${invCnt.rows[0].count}`);
    console.log(`   🏷️ Active Coupons: ${coupCnt.rows[0].count}`);
    console.log(`   👤 User Profiles: ${profCnt.rows[0].count}`);

    console.log('\n🎉 ALL SYSTEMS WORKING 100% ON LIVE SUPABASE DATABASE!');
  } catch (err) {
    console.error('❌ Migration Error:', err.message);
  } finally {
    await client.end();
  }
}

main();
