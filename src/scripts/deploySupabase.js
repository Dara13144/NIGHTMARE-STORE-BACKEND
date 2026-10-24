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

console.log('🔄 Connecting to Supabase PostgreSQL Database...');

const client = new pg.Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function runDeploy() {
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

    // Now seed encrypted digital keys into public.product_inventory for each product
    console.log('\n🔐 Seeding encrypted digital keys into public.product_inventory on Supabase...');

    // Fetch product IDs
    const productsRes = await client.query('SELECT id, slug, name FROM public.products ORDER BY created_at;');
    const products = productsRes.rows;

    const sampleKeyPool = {
      'cyberpunk-2077-phantom-liberty-bundle': [
        'CP77-PL-9F4K-8A2D-7X9P',
        'CP77-PL-1L3M-8P0K-5R2Q',
        'CP77-PL-4N8B-2C6V-9Y1W',
        'CP77-PL-7M2Q-6T4R-8K9L',
        'CP77-PL-3X8J-1P5N-6D9C',
      ],
      'elden-ring-shadow-of-the-erdtree': [
        'ELDN-SOTE-7T8Y-9U1I-2O3P',
        'ELDN-SOTE-4A5S-6D7F-8G9H',
        'ELDN-SOTE-1Z2X-3C4V-5B6N',
      ],
      'black-myth-wukong-deluxe': [
        'WUKG-DLX-9A8S-7D6F-5G4H',
        'WUKG-DLX-3J2K-1L9P-8O7I',
      ],
      'minecraft-java-bedrock-edition-pc': [
        'MCFT-JBPC-4X7K-9P2M-5R8Q',
        'MCFT-JBPC-1B3N-6V8C-2X4Z',
        'MCFT-JBPC-8M9L-4K2J-7H5G',
        'MCFT-JBPC-3F2D-6S8A-1Q9W',
        'MCFT-JBPC-5T7Y-2U4I-9O1P',
        'MCFT-JBPC-6P8O-3I5U-1Y7T',
      ],
      'helldivers-2-super-citizen': [
        'HD2-SCIT-8K4F-2N9P-7X1L',
        'HD2-SCIT-3M5Q-9R2T-6V8B',
        'HD2-SCIT-1P7Z-4C8X-2V6N',
        'HD2-SCIT-5D9F-7G2H-4J8K',
      ],
      'playstation-store-50-usd-gift-card': [
        'PSN-50USD-9842-1274-8831',
        'PSN-50USD-4721-9938-1029',
        'PSN-50USD-3392-8172-5501',
        'PSN-50USD-7729-4102-8492',
      ],
      'xbox-game-pass-ultimate-3-months': [
        'XBOX-GPU3M-5K8L-9P2N-4X7M',
        'XBOX-GPU3M-1Q3W-5E7R-9T2Y',
        'XBOX-GPU3M-8U4I-2O6P-7A9S',
      ],
      'ea-sports-fc-25-standard-edition': [
        'FC25-PCST-9K2L-4M7N-1P8Q',
        'FC25-PCST-3R5T-7Y9U-2I4O',
        'FC25-PCST-6P8A-1S3D-5F7G',
      ],
      'fivem-activation-code': [
        'FIVEM-ACT-8812-7749-0192',
        'FIVEM-ACT-3382-9912-4402',
        'FIVEM-ACT-5501-1182-3391',
        'FIVEM-ACT-9921-4471-8823',
      ],
      'fivem-account-ready': [
        'FIVEM-ACC-USER881:PASS99201',
        'FIVEM-ACC-USER332:PASS44812',
      ],
      'gemini-pro-18month': [
        'GEMINI-PRO-18M-LINK-9921820',
        'GEMINI-PRO-18M-LINK-8812941',
      ],
      'nitro-discord-3month': [
        'DISCORD-NITRO-3M-GIFT-99120',
        'DISCORD-NITRO-3M-GIFT-44812',
      ],
      '14x-1-month-server-boosts': [
        'BOOST-14X-DISC-99128-44910',
        'BOOST-14X-DISC-77281-33019',
      ],
      'outlook-e-mail-accounts': [
        'sbay_customer101@outlook.com:SecurePass#2026',
        'sbay_customer102@outlook.com:SecurePass#2026',
        'sbay_customer103@outlook.com:SecurePass#2026',
      ],
      'nord-vpn-lifetime': [
        'NORD-VPN-LIFE-8849-1120-7731',
        'NORD-VPN-LIFE-3391-4481-9920',
      ],
      'discord-account': [
        'DISC-ACC-USER-TOKEN-88129-4412',
        'DISC-ACC-USER-TOKEN-33910-7712',
      ],
      'steam-account-ready': [
        'STEAM-ACC-USER-7712:PASS-8841',
        'STEAM-ACC-USER-3391:PASS-1120',
      ],
      'ip-vanish-vpn-1-year': [
        'IPVANISH-1YR-9941-2281-5502',
        'IPVANISH-1YR-7712-4491-3382',
      ],
      'rockstar-tool': [
        'RSTAR-TOOL-LIC-9912-4481-7720',
        'RSTAR-TOOL-LIC-3391-8821-5501',
      ],
      'minecraft-account-full-access': [
        'MC-FULL-ACC-EMAIL-USER101:PASS991',
        'MC-FULL-ACC-EMAIL-USER102:PASS882',
      ],
    };

    let totalKeysSeeded = 0;
    for (const prod of products) {
      const keys = sampleKeyPool[prod.slug] || [
        `${prod.slug.toUpperCase().slice(0, 8)}-KEY-001`,
        `${prod.slug.toUpperCase().slice(0, 8)}-KEY-002`,
      ];

      for (const plainKey of keys) {
        const enc = encryptGameKey(plainKey);
        await client.query(`
          INSERT INTO public.product_inventory (
            product_id, encrypted_key, key_iv, key_tag, key_hash, status
          ) VALUES ($1, $2, $3, $4, $5, 'available')
          ON CONFLICT (product_id, key_hash) DO NOTHING;
        `, [prod.id, enc.encryptedKey, enc.keyIv, enc.keyTag, enc.keyHash]);
        totalKeysSeeded++;
      }
    }

    console.log(`🔑 Seeded ${totalKeysSeeded} encrypted digital keys into public.product_inventory.`);

    // Seed Demo Users / Admin into public.profiles
    console.log('\n👥 Seeding default admin and customer profiles...');
    await client.query(`
      INSERT INTO public.profiles (
        id, username, display_name, email, role, status, avatar_url, discord_id
      ) VALUES
        ('a0000000-0000-0000-0000-000000000001', 'dara_admin', 'DA-RA Commander', 'admin@darastore.gg', 'admin', 'active', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200', '123456789012345678'),
        ('a0000000-0000-0000-0000-000000000002', 'cyber_gamer', 'CyberGamer', 'gamer@nightcity.io', 'customer', 'active', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200', '987654321098765432')
      ON CONFLICT (id) DO UPDATE SET
        role = EXCLUDED.role,
        status = EXCLUDED.status;
    `);

    // Verify all tables and counts
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log('\n📊 Tables in public schema:');
    tableRes.rows.forEach((r) => console.log(`   - ${r.table_name}`));

    const counts = await Promise.all([
      client.query('SELECT count(*) FROM public.categories;'),
      client.query('SELECT count(*) FROM public.products;'),
      client.query('SELECT count(*) FROM public.product_inventory;'),
      client.query('SELECT count(*) FROM public.coupons;'),
      client.query('SELECT count(*) FROM public.reviews;'),
      client.query('SELECT count(*) FROM public.profiles;'),
      client.query('SELECT count(*) FROM public.oauth_accounts;'),
    ]);

    console.log('\n📈 Live Database Record Counts:');
    console.log(`   📂 Categories: ${counts[0].rows[0].count}`);
    console.log(`   🎮 Products: ${counts[1].rows[0].count}`);
    console.log(`   🔑 Encrypted Keys: ${counts[2].rows[0].count}`);
    console.log(`   🏷️ Coupons: ${counts[3].rows[0].count}`);
    console.log(`   ⭐ Reviews: ${counts[4].rows[0].count}`);
    console.log(`   👤 Profiles: ${counts[5].rows[0].count}`);
    console.log(`   🔗 Linked OAuth Accounts: ${counts[6].rows[0].count}`);

    console.log('\n🎉 ALL STORE SYSTEMS DEPLOYED ON SUPABASE POSTGRESQL SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Deployment error:', err);
  } finally {
    await client.end();
  }
}

runDeploy();
