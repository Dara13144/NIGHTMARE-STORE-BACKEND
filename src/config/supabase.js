import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { encryptGameKey, hashValue } from '../services/encryptionService.js';

let supabaseClient = null;

if (env.IS_SUPABASE_CONFIGURED) {
  try {
    supabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    console.log('✅ Supabase connected with Service Role privileges');
  } catch (err) {
    console.warn('⚠️ Failed to initialize Supabase client:', err.message);
  }
} else {
  console.log('ℹ️ Supabase credentials not set in .env. Running with In-Memory Production Simulation Engine.');
}

export const supabase = supabaseClient;

export function resolveProductCover(prod) {
  if (!prod) return '/card-rockstar-hd.png';
  if (prod.cover_image && typeof prod.cover_image === 'string' && prod.cover_image.trim() !== '') {
    return prod.cover_image;
  }
  const id = String(prod.id || prod.productId || '').trim().toLowerCase();
  const name = String(prod.name || prod.title || prod.productName || '').toLowerCase();
  const slug = String(prod.slug || '').toLowerCase();

  // FiveM & Rockstar
  if (id === '10000000-0000-0000-0000-000000000009' || id === 'prod-fivem-code' || name.includes('fivem activation') || slug.includes('fivem-activation')) {
    return '/card-rockstar-hd.png';
  }
  if (id === '10000000-0000-0000-0000-000000000010' || id === 'prod-fivem-ready' || name.includes('rockstar account') || name.includes('fivem account') || slug.includes('rockstar-account') || slug.includes('fivem-account')) {
    return '/card-rockstar-account.png';
  }

  // Gemini Pro
  if (id === '10000000-0000-0000-0000-000000000011' || id === 'prod-gemini-18m' || name.includes('gemini') || slug.includes('gemini')) {
    return '/card-gemini.png';
  }

  // Discord Nitro & Boosts
  if (id === '10000000-0000-0000-0000-000000000012' || id === 'prod-nitro-3m' || name.includes('nitro discord') || slug.includes('nitro-discord')) {
    return '/card-nitro.png';
  }
  if (id === '10000000-0000-0000-0000-000000000013' || id === 'prod-nitro-boosts' || name.includes('boost') || slug.includes('boost')) {
    return '/card-nitro-boosts-hd.png';
  }
  if (id === '10000000-0000-0000-0000-000000000016' || id === 'prod-discord-group' || (name.includes('discord') && !name.includes('nitro'))) {
    return '/card-discord.png';
  }

  // Outlook
  if (id === '10000000-0000-0000-0000-000000000014' || id === 'prod-outlook-mail' || name.includes('outlook')) {
    return 'https://images.unsplash.com/photo-1596526131083-e8c633c948d2?w=800&auto=format&fit=crop&q=80';
  }

  // VPNs
  if (id === '10000000-0000-0000-0000-000000000015' || id === 'prod-nord-vpn' || name.includes('nord vpn') || name.includes('nordvpn')) {
    return 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&auto=format&fit=crop&q=80';
  }
  if (id === '10000000-0000-0000-0000-000000000018' || id === 'prod-ipvanish' || name.includes('ip vanish') || name.includes('ipvanish')) {
    return 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=800&auto=format&fit=crop&q=80';
  }

  // Steam
  if (id === '10000000-0000-0000-0000-000000000017' || id === 'prod-steam-group' || name === 'steam') {
    return 'https://images.unsplash.com/photo-1612287233214-a957d553e1a0?w=800&auto=format&fit=crop&q=80';
  }

  // Rockstar Tool
  if (id === '10000000-0000-0000-0000-000000000019' || id === 'prod-rockstar-tool' || name.includes('rockstar tool')) {
    return '/card-rockstar-hd.png';
  }

  // Minecraft
  if (id === '10000000-0000-0000-0000-000000000020' || id === 'prod-mc-group' || name.includes('full access')) {
    return '/card-minecraft-java.png';
  }
  if (id === '10000000-0000-0000-0000-000000000004' || id === 'prod-4' || name.includes('minecraft')) {
    return '/card-minecraft-hd.png';
  }

  // Cyberpunk, Elden Ring, Black Myth Wukong, Helldivers, PlayStation, Xbox, FC 25
  if (id === '10000000-0000-0000-0000-000000000001' || id === 'prod-1' || name.includes('cyberpunk')) {
    return 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80';
  }
  if (id === '10000000-0000-0000-0000-000000000002' || id === 'prod-2' || name.includes('elden ring')) {
    return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80';
  }
  if (id === '10000000-0000-0000-0000-000000000003' || id === 'prod-3' || name.includes('wukong')) {
    return 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=800&auto=format&fit=crop&q=80';
  }
  if (id === '10000000-0000-0000-0000-000000000005' || id === 'prod-5' || name.includes('helldivers')) {
    return 'https://images.unsplash.com/photo-1552824722-ddab1374e622?w=800&auto=format&fit=crop&q=80';
  }
  if (id === '10000000-0000-0000-0000-000000000006' || id === 'prod-6' || name.includes('playstation')) {
    return 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=800&auto=format&fit=crop&q=80';
  }
  if (id === '10000000-0000-0000-0000-000000000007' || id === 'prod-7' || name.includes('xbox')) {
    return 'https://images.unsplash.com/photo-1605901309584-818e25960a8f?w=800&auto=format&fit=crop&q=80';
  }
  if (id === '10000000-0000-0000-0000-000000000008' || id === 'prod-8' || name.includes('fc 25') || name.includes('ea sports')) {
    return 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&auto=format&fit=crop&q=80';
  }

  return prod.cover_image || prod.coverImage || prod.image || '/card-rockstar-hd.png';
}

// ============================================================================
// In-Memory Database Store for Instant Local Testing & Verification
// ============================================================================
class LocalStore {
  constructor() {
    this.categories = [];
    this.products = [];
    this.inventory = [];
    this.users = [];
    this.carts = new Map(); // cartId -> { id, user_id, session_token, items: [] }
    this.orders = [];
    this.orderItems = [];
    this.coupons = [];
    this.reviews = [];
    this.tickets = [];
    this.auditLogs = [];
    this.oauthAccounts = [];
    this.userSessions = [];
    this.accountLinkingEvents = [];
    this.settings = {
      lowStockThreshold: 3,
      storeCurrency: 'USD',
      maintenanceMode: false,
      promoBanner: {
        enabled: true,
        title: 'NightmareStore',
        subtitle: 'Official Nightmare Gang Store',
        code: 'NIGHTMARE',
        discountPercent: 15,
        buttonText: 'CHECKOUT NOW!',
        targetUrl: '/products',
        imageUrl: '/nightmare-promo-banner.png',
        badgeText: 'CODE NIGHTMARE',
      },
    };
    this.initializeDefaultData();
    if (supabaseClient) {
      this.syncFromSupabase();
    }
  }

  initializeDefaultData() {
    // Categories
    this.categories = [
      { id: 'cat-1', name: 'Action & RPG', slug: 'action-rpg', description: 'Immersive role-playing games and high-octane action titles', icon_name: 'Sword', display_order: 1 },
      { id: 'cat-2', name: 'Shooters & Co-op', slug: 'shooters', description: 'Competitive tactical shooters and co-op campaigns', icon_name: 'Crosshair', display_order: 2 },
      { id: 'cat-3', name: 'Open World & Adventure', slug: 'open-world', description: 'Massive exploration worlds, survival craft, and rich stories', icon_name: 'Compass', display_order: 3 },
      { id: 'cat-4', name: 'Minecraft & Sandbox', slug: 'minecraft-sandbox', description: 'Minecraft keys, minecoins, and sandbox construction games', icon_name: 'Pickaxe', display_order: 4 },
      { id: 'cat-5', name: 'Gift Cards & Subscriptions', slug: 'gift-cards', description: 'PlayStation, Xbox, Steam wallets, and game pass memberships', icon_name: 'CreditCard', display_order: 5 },
      { id: 'cat-6', name: 'Sports & Racing', slug: 'sports-racing', description: 'Authentic sports simulators and racing titles', icon_name: 'Trophy', display_order: 6 },
    ];

    // Products
    this.products = [
      {
        id: 'prod-1',
        name: 'Cyberpunk 2077: Phantom Liberty Bundle',
        slug: 'cyberpunk-2077-phantom-liberty-bundle',
        description: 'Phantom Liberty is a spy-thriller expansion for Cyberpunk 2077. Enter the shadows of Dogtown and master high-stakes espionage in Night City.',
        cover_image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80',
        banner_image: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1600&auto=format&fit=crop&q=80',
        category_id: 'cat-1',
        platform: 'Steam',
        region: 'Global',
        activation_instructions: '1. Open Steam client.\n2. Click "Games" -> "Activate a Product on Steam...".\n3. Enter the digital key received from DA-RA STORE.\n4. Download and launch directly from Steam.',
        current_price: 34.99,
        comparison_price: 59.99,
        currency: 'USD',
        is_published: true,
        is_featured: true,
        low_stock_threshold: 4,
        created_at: new Date('2026-01-10T10:00:00Z'),
        updated_at: new Date('2026-01-10T10:00:00Z'),
      },
      {
        id: 'prod-2',
        name: 'Elden Ring: Shadow of the Erdtree Edition',
        slug: 'elden-ring-shadow-of-the-erdtree',
        description: 'Guided by grace to brandish the power of the Elden Ring and become an Elden Lord in the Lands Between. Includes base game & expansion.',
        cover_image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
        banner_image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
        category_id: 'cat-1',
        platform: 'Steam',
        region: 'Global',
        activation_instructions: '1. Launch Steam PC client.\n2. Select "Add a Game" in bottom-left corner.\n3. Paste the key code.\n4. Enjoy the journey across the Land of Shadow.',
        current_price: 54.99,
        comparison_price: 79.99,
        currency: 'USD',
        is_published: true,
        is_featured: true,
        low_stock_threshold: 3,
        created_at: new Date('2026-01-12T10:00:00Z'),
        updated_at: new Date('2026-01-12T10:00:00Z'),
      },
      {
        id: 'prod-3',
        name: 'Black Myth: Wukong - Digital Deluxe Edition',
        slug: 'black-myth-wukong-deluxe',
        description: 'An action RPG rooted in Chinese mythology. Set out as the Destined One to venture into the challenges ahead to uncover ancient truth.',
        cover_image: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=800&auto=format&fit=crop&q=80',
        banner_image: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1600&auto=format&fit=crop&q=80',
        category_id: 'cat-1',
        platform: 'Steam',
        region: 'Global',
        activation_instructions: '1. Open Steam client.\n2. Go to Games -> Activate a Product on Steam.\n3. Enter the key supplied by DA-RA STORE.\n4. Digital deluxe bonus items included.',
        current_price: 49.99,
        comparison_price: 69.99,
        currency: 'USD',
        is_published: true,
        is_featured: true,
        low_stock_threshold: 3,
        created_at: new Date('2026-01-15T10:00:00Z'),
        updated_at: new Date('2026-01-15T10:00:00Z'),
      },
      {
        id: 'prod-4',
        name: 'Minecraft: Java & Bedrock Edition for PC',
        slug: 'minecraft-java-bedrock-edition-pc',
        description: 'Create, explore, survive, and repeat. Unified launcher gives you access to both Java and Bedrock editions with cross-play.',
        cover_image: '/card-minecraft-hd.png',
        banner_image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1600&auto=format&fit=crop&q=80',
        category_id: 'cat-4',
        platform: 'Minecraft',
        region: 'Global',
        activation_instructions: '1. Visit microsoft.com/redeem or minecraft.net/redeem.\n2. Sign in with your Microsoft account.\n3. Enter the 25-character key.\n4. Download the launcher and start mining!',
        current_price: 19.99,
        comparison_price: 29.99,
        currency: 'USD',
        is_published: true,
        is_featured: true,
        low_stock_threshold: 5,
        created_at: new Date('2026-01-18T10:00:00Z'),
        updated_at: new Date('2026-01-18T10:00:00Z'),
      },
      {
        id: 'prod-5',
        name: 'Helldivers 2 - Super Citizen Edition',
        slug: 'helldivers-2-super-citizen',
        description: 'The Galaxy’s Last Line of Offence. Enlist in the Helldivers and join the fight for freedom across a hostile galaxy in high-stakes co-op combat.',
        cover_image: 'https://images.unsplash.com/photo-1552824722-ddab1374e622?w=800&auto=format&fit=crop&q=80',
        banner_image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1600&auto=format&fit=crop&q=80',
        category_id: 'cat-2',
        platform: 'Steam',
        region: 'Global',
        activation_instructions: '1. Log into Steam.\n2. Navigate to "Games" -> "Activate a Product on Steam".\n3. Enter key code.\n4. Deliver freedom to the galaxy!',
        current_price: 37.99,
        comparison_price: 59.99,
        currency: 'USD',
        is_published: true,
        is_featured: true,
        low_stock_threshold: 4,
        created_at: new Date('2026-01-20T10:00:00Z'),
        updated_at: new Date('2026-01-20T10:00:00Z'),
      },
      {
        id: 'prod-6',
        name: 'PlayStation Store $50 USD Gift Card',
        slug: 'playstation-store-50-usd-gift-card',
        description: 'Top up your PlayStation Network wallet to purchase full games, DLC, and add-ons from PlayStation Store on PS5, PS4, or web.',
        cover_image: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=800&auto=format&fit=crop&q=80',
        banner_image: 'https://images.unsplash.com/photo-1486401899868-0e435ed85128?w=1600&auto=format&fit=crop&q=80',
        category_id: 'cat-5',
        platform: 'PlayStation',
        region: 'North America',
        activation_instructions: '1. Sign in to your PlayStation Network account.\n2. Go to Avatar -> "Redeem Code".\n3. Enter the 12-digit voucher code.\n4. Instant wallet credit.',
        current_price: 44.99,
        comparison_price: 50.00,
        currency: 'USD',
        is_published: true,
        is_featured: false,
        low_stock_threshold: 4,
        created_at: new Date('2026-01-22T10:00:00Z'),
        updated_at: new Date('2026-01-22T10:00:00Z'),
      },
      {
        id: 'prod-7',
        name: 'Xbox Game Pass Ultimate - 3 Months Membership',
        slug: 'xbox-game-pass-ultimate-3-months',
        description: 'Over 100 high-quality console & PC games, EA Play membership, online multiplayer, and Cloud Gaming across all your devices.',
        cover_image: 'https://images.unsplash.com/photo-1605901309584-818e25960a8f?w=800&auto=format&fit=crop&q=80',
        banner_image: 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=1600&auto=format&fit=crop&q=80',
        category_id: 'cat-5',
        platform: 'Xbox',
        region: 'Global',
        activation_instructions: '1. Go to redeem.microsoft.com.\n2. Sign in to your Xbox account.\n3. Enter the 25-character digital code.\n4. Access hundreds of games immediately.',
        current_price: 32.99,
        comparison_price: 44.99,
        currency: 'USD',
        is_published: true,
        is_featured: true,
        low_stock_threshold: 3,
        created_at: new Date('2026-01-24T10:00:00Z'),
        updated_at: new Date('2026-01-24T10:00:00Z'),
      },
      {
        id: 'prod-8',
        name: 'EA SPORTS FC 25 Standard Edition',
        slug: 'ea-sports-fc-25-standard-edition',
        description: 'Experience tactical realism with FC IQ overhaul. Play as the biggest clubs and leagues in football with hyper-realistic movement.',
        cover_image: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&auto=format&fit=crop&q=80',
        banner_image: 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=1600&auto=format&fit=crop&q=80',
        category_id: 'cat-6',
        platform: 'EA App',
        region: 'Global',
        activation_instructions: '1. Launch the EA App on Windows.\n2. Click "My Collection" and then "Redeem Code".\n3. Paste the activation code.\n4. Download and play.',
        current_price: 46.99,
        comparison_price: 69.99,
        currency: 'USD',
        is_published: true,
        is_featured: false,
        low_stock_threshold: 3,
        created_at: new Date('2026-01-26T10:00:00Z'),
        updated_at: new Date('2026-01-26T10:00:00Z'),
      },
      {
        id: 'prod-fivem-code',
        name: 'FiveM Activation Code',
        slug: 'fivem-activation-code',
        description: 'Instant FiveM Rockstar activation digital key for custom GTA roleplay servers.',
        cover_image: '/card-rockstar-hd.png',
        category_id: 'cat-1',
        platform: 'Fivem',
        region: 'Global',
        current_price: 0.50,
        comparison_price: 2.00,
        currency: 'USD',
        is_published: false,
        is_featured: false,
        low_stock_threshold: 3,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'prod-fivem-ready',
        real_id: '10000000-0000-0000-0000-000000000010',
        name: 'Account rockstar',
        slug: 'rockstar-account',
        description: 'Pre-activated Rockstar Games Account Ready for instant play.',
        cover_image: '/card-rockstar-account.png',
        category_id: 'cat-1',
        platform: 'Fivem',
        region: 'Global',
        current_price: 4.50,
        comparison_price: 6.00,
        currency: 'USD',
        is_published: true,
        is_featured: true,
        low_stock_threshold: 3,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'prod-gemini-18m',
        name: 'gemini pro 18month',
        slug: 'gemini-pro-18month',
        description: 'Google Gemini Pro 18-Month Premium AI Subscription upgrade voucher.',
        cover_image: '/card-gemini.png',
        category_id: 'cat-3',
        platform: 'Giftlink',
        region: 'Global',
        current_price: 3.00,
        comparison_price: 18.00,
        currency: 'USD',
        is_published: true,
        is_featured: true,
        low_stock_threshold: 3,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'prod-nitro-3m',
        name: 'Nitro Discord 3Month',
        slug: 'nitro-discord-3month',
        description: 'Discord Nitro 3-Month promotional gift link with custom emojis, 2 server boosts & 500MB uploads.',
        cover_image: '/card-nitro.png',
        category_id: 'cat-3',
        platform: 'Giftlink',
        region: 'Global',
        current_price: 4.00,
        comparison_price: 29.99,
        currency: 'USD',
        is_published: true,
        is_featured: true,
        low_stock_threshold: 3,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'prod-nitro-boosts',
        name: '14x 1 Month Server Boosts',
        slug: '14x-1-month-server-boosts',
        description: 'Instantly Level 3 boost your Discord guild with 14x 1-month server boosts.',
        cover_image: '/card-nitro-boosts-hd.png',
        category_id: 'cat-3',
        platform: 'Giftlink',
        region: 'Global',
        current_price: 7.00,
        comparison_price: 49.99,
        currency: 'USD',
        is_published: true,
        is_featured: false,
        low_stock_threshold: 2,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'prod-outlook-mail',
        name: 'Outlook E-Mail Accounts',
        slug: 'outlook-e-mail-accounts',
        description: 'Clean POP3/IMAP enabled Outlook mail accounts verified with recovery safeguards.',
        cover_image: 'https://images.unsplash.com/photo-1596526131083-e8c633c948d2?w=800&auto=format&fit=crop&q=80',
        category_id: 'cat-3',
        platform: 'mail',
        region: 'Global',
        current_price: 0.20,
        comparison_price: 1.00,
        currency: 'USD',
        is_published: true,
        is_featured: false,
        low_stock_threshold: 10,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'prod-nord-vpn',
        name: 'Nord VPN Lifetime',
        slug: 'nord-vpn-lifetime',
        description: 'NordVPN premium high-speed encrypted VPN license with double encryption & threat protection.',
        cover_image: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&auto=format&fit=crop&q=80',
        category_id: 'cat-3',
        platform: 'vpn',
        region: 'Global',
        current_price: 2.00,
        comparison_price: 59.99,
        currency: 'USD',
        is_published: true,
        is_featured: true,
        low_stock_threshold: 4,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'prod-discord-group',
        name: 'Discord account',
        slug: 'discord-account',
        description: 'Aged Discord user accounts with token, mail access, and phone verification.',
        cover_image: '/card-discord.png',
        category_id: 'cat-3',
        platform: 'Discord',
        region: 'Global',
        current_price: 0.30,
        comparison_price: 6.00,
        currency: 'USD',
        is_published: true,
        is_featured: true,
        low_stock_threshold: 5,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'prod-steam-group',
        name: 'Steam',
        slug: 'steam-account-ready',
        description: 'Steam accounts ready for gaming with unlimited community market access.',
        cover_image: 'https://images.unsplash.com/photo-1612287233214-a957d553e1a0?w=800&auto=format&fit=crop&q=80',
        category_id: 'cat-1',
        platform: 'Steam',
        region: 'Global',
        current_price: 0.10,
        comparison_price: 10.00,
        currency: 'USD',
        is_published: true,
        is_featured: true,
        low_stock_threshold: 5,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'prod-ipvanish',
        name: 'IP Vanish VPN 1 Year',
        slug: 'ip-vanish-vpn-1-year',
        description: 'IPVanish VPN 1-Year subscription for anonymous browsing and gaming P2P.',
        cover_image: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=800&auto=format&fit=crop&q=80',
        category_id: 'cat-3',
        platform: 'vpn',
        region: 'Global',
        current_price: 1.00,
        comparison_price: 39.99,
        currency: 'USD',
        is_published: true,
        is_featured: false,
        low_stock_threshold: 3,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'prod-rockstar-tool',
        name: 'Rockstar Tool',
        slug: 'rockstar-tool',
        description: 'Rockstar Game Launcher management and activation utility software.',
        cover_image: '/card-rockstar-hd.png',
        category_id: 'cat-1',
        platform: 'Tool',
        region: 'Global',
        current_price: 10.00,
        comparison_price: 25.00,
        currency: 'USD',
        is_published: true,
        is_featured: false,
        low_stock_threshold: 2,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'prod-mc-group',
        name: 'Minecraft Account [Full Access]',
        slug: 'minecraft-account-full-access',
        description: 'Full security access Minecraft Java + Bedrock edition with change email capability.',
        cover_image: '/card-minecraft-java.png',
        category_id: 'cat-4',
        platform: 'Minecraft',
        region: 'Global',
        current_price: 7.50,
        comparison_price: 29.99,
        currency: 'USD',
        is_published: true,
        is_featured: true,
        low_stock_threshold: 4,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    // Seed Real Encrypted Keys into Inventory for Each Product
    const sampleKeyPool = {
      'prod-1': ['CP77-PL-9F4K-8A2D-7X9P', 'CP77-PL-1L3M-8P0K-5R2Q', 'CP77-PL-4N8B-2C6V-9Y1W', 'CP77-PL-7M2Q-6T4R-8K9L', 'CP77-PL-3X8J-1P5N-6D9C'],
      'prod-2': ['ELDN-SOTE-7T8Y-9U1I-2O3P', 'ELDN-SOTE-4A5S-6D7F-8G9H', 'ELDN-SOTE-1Z2X-3C4V-5B6N'],
      'prod-3': ['WUKG-DLX-9A8S-7D6F-5G4H', 'WUKG-DLX-3J2K-1L9P-8O7I'],
      'prod-4': ['MCFT-JBPC-4X7K-9P2M-5R8Q', 'MCFT-JBPC-1B3N-6V8C-2X4Z', 'MCFT-JBPC-8M9L-4K2J-7H5G', 'MCFT-JBPC-3F2D-6S8A-1Q9W', 'MCFT-JBPC-5T7Y-2U4I-9O1P', 'MCFT-JBPC-6P8O-3I5U-1Y7T'],
      'prod-5': ['HD2-SCIT-8K4F-2N9P-7X1L', 'HD2-SCIT-3M5Q-9R2T-6V8B', 'HD2-SCIT-1P7Z-4C8X-2V6N', 'HD2-SCIT-5D9F-7G2H-4J8K'],
      'prod-6': ['PSN-50USD-9842-1274-8831', 'PSN-50USD-4721-9938-1029', 'PSN-50USD-3392-8172-5501', 'PSN-50USD-7729-4102-8492'],
      'prod-7': ['XBOX-GPU3M-5K8L-9P2N-4X7M', 'XBOX-GPU3M-1Q3W-5E7R-9T2Y', 'XBOX-GPU3M-8U4I-2O6P-7A9S'],
      'prod-8': ['FC25-PCST-9K2L-4M7N-1P8Q', 'FC25-PCST-3R5T-7Y9U-2I4O', 'FC25-PCST-6P8A-1S3D-5F7G'],
      'prod-fivem-code': ['FIVEM-ACT-8812-7749-0192', 'FIVEM-ACT-3382-9912-4402', 'FIVEM-ACT-5501-1182-3391', 'FIVEM-ACT-9921-4471-8823'],
      'prod-fivem-ready': ['FIVEM-ACC-USER881:PASS99201', 'FIVEM-ACC-USER332:PASS44812'],
      'prod-nitro-boosts': ['BOOST-14X-DISC-99128-44910', 'BOOST-14X-DISC-77281-33019'],
      'prod-outlook-mail': ['sbay_customer101@outlook.com:SecurePass#2026', 'sbay_customer102@outlook.com:SecurePass#2026', 'sbay_customer103@outlook.com:SecurePass#2026'],
      'prod-nord-vpn': ['NORD-VPN-LIFE-8849-1120-7731', 'NORD-VPN-LIFE-3391-4481-9920'],
      'prod-ipvanish': ['IPVANISH-1YR-9941-2281-5502', 'IPVANISH-1YR-7712-4491-3382'],
    };

    let invId = 1;
    for (const [productId, keys] of Object.entries(sampleKeyPool)) {
      keys.forEach((plainKey) => {
        const enc = encryptGameKey(plainKey);
        this.inventory.push({
          id: `inv-${invId++}`,
          product_id: productId,
          encrypted_key: enc.encryptedKey,
          key_iv: enc.keyIv,
          key_tag: enc.keyTag,
          key_hash: enc.keyHash,
          status: 'available',
          reserved_at: null,
          reservation_token: null,
          order_item_id: null,
          created_at: new Date(),
          redeemed_at: null,
        });
      });
    }

    // Default Coupons
    this.coupons = [
      { id: '20000000-0000-0000-0000-000000000001', code: 'NIGHTMARE', discount_type: 'percentage', discount_value: 15, min_spend: 0, max_uses: 9999, times_used: 128, is_active: true, expires_at: null },
      { id: '20000000-0000-0000-0000-000000000002', code: 'CYBER15', discount_type: 'percentage', discount_value: 15, min_spend: 20, max_uses: 1000, times_used: 42, is_active: true, expires_at: null },
      { id: '20000000-0000-0000-0000-000000000003', code: 'NEON10', discount_type: 'percentage', discount_value: 10, min_spend: 10, max_uses: 500, times_used: 19, is_active: true, expires_at: null },
      { id: '20000000-0000-0000-0000-000000000004', code: 'DARA5OFF', discount_type: 'fixed', discount_value: 5, min_spend: 30, max_uses: 200, times_used: 8, is_active: true, expires_at: null },
    ];

    // Seed Verified Reviews
    this.reviews = [
      { id: 'rev-1', product_id: 'prod-1', user_id: 'user-demo', user_name: 'VortexPilot', rating: 5, comment: 'Key arrived within seconds after checkout! Phantom Liberty activated flawlessly on Steam.', is_verified_purchase: true, created_at: new Date('2026-02-01') },
      { id: 'rev-2', product_id: 'prod-2', user_id: 'user-demo2', user_name: 'TarnishedHero', rating: 5, comment: 'Cheapest price on the web for Shadow of the Erdtree. Code worked on first try.', is_verified_purchase: true, created_at: new Date('2026-02-05') },
      { id: 'rev-3', product_id: 'prod-4', user_id: 'user-demo3', user_name: 'CraftMaster99', rating: 5, comment: 'Redeemed on microsoft.com/redeem with zero issues. Great store UI too!', is_verified_purchase: true, created_at: new Date('2026-02-10') },
      { id: 'rev-4', product_id: 'prod-5', user_id: 'user-demo4', user_name: 'DemocracyOfficer', rating: 5, comment: 'Super Citizen edition armor unlocked instantly in my Steam inventory. 10/10.', is_verified_purchase: true, created_at: new Date('2026-02-14') },
    ];

    // Seed Admin and Demo User
    this.users = [
      {
        id: 'usr-admin-1',
        discord_id: '123456789012345678',
        username: 'dara_admin',
        display_name: 'DA-RA Commander',
        avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
        email: 'admin@darastore.gg',
        role: 'admin',
        created_at: new Date('2026-01-01'),
      },
      {
        id: 'usr-cust-1',
        discord_id: '987654321098765432',
        username: 'cyber_gamer',
        display_name: 'CyberGamer',
        avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
        email: 'gamer@nightcity.io',
        role: 'customer',
        created_at: new Date('2026-01-15'),
      },
    ];

    // Seed Past Orders for Analytics and Demo
    this.seedPastOrders();
  }

  seedPastOrders() {
    // Orders start empty unless created by customers or live transactions
  }

  logAudit({ actorId, actorRole, action, targetResource, targetId, details, ipAddress }) {
    const entry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      actor_id: actorId || null,
      actor_role: actorRole || 'system',
      action,
      target_resource: targetResource,
      target_id: targetId || null,
      details: details || {},
      ip_address: ipAddress || '127.0.0.1',
      created_at: new Date(),
    };
    this.auditLogs.unshift(entry);
    if (this.auditLogs.length > 500) {
      this.auditLogs.pop();
    }
    return entry;
  }

  async syncFromSupabase() {
    if (!supabaseClient) return;
    try {
      const [pRes, cRes, iRes, cpRes, rRes, profRes, oaRes, oRes, oiRes] = await Promise.all([
        supabaseClient.from('products').select('*'),
        supabaseClient.from('categories').select('*'),
        supabaseClient.from('product_inventory').select('*'),
        supabaseClient.from('coupons').select('*'),
        supabaseClient.from('reviews').select('*'),
        supabaseClient.from('profiles').select('*'),
        supabaseClient.from('oauth_accounts').select('*'),
        supabaseClient.from('orders').select('*'),
        supabaseClient.from('order_items').select('*'),
      ]);

      if (pRes.data && pRes.data.length > 0) {
        const syncedProducts = [];
        pRes.data.forEach((p, idx) => {
          const cover = resolveProductCover(p);
          const fullProd = {
            ...p,
            cover_image: cover,
          };
          syncedProducts.push(fullProd);
          // Also alias by legacy id if it has one (e.g. prod-1, prod-fivem-code, etc.)
          const suffixNum = parseInt(p.id.slice(-2), 10);
          const legacyId = !isNaN(suffixNum) ? `prod-${suffixNum}` : `prod-${idx + 1}`;
          if (legacyId !== p.id && !syncedProducts.some((sp) => sp.id === legacyId)) {
            syncedProducts.push({
              ...fullProd,
              id: legacyId,
              real_id: p.id,
            });
          }
          if (p.id === '10000000-0000-0000-0000-000000000010' || legacyId === 'prod-10') {
            syncedProducts.push({
              ...fullProd,
              id: 'prod-fivem-ready',
              real_id: p.id,
            });
          }
        });
        this.products = syncedProducts;

        // Fire-and-forget sync to update remote Supabase products table
        for (const p of pRes.data) {
          const cover = resolveProductCover(p);
          supabaseClient.from('products').update({ cover_image: cover }).eq('id', p.id).then().catch(() => {});
        }
      }
      if (cRes.data && cRes.data.length > 0) {
        this.categories = cRes.data;
      }
      if (Array.isArray(iRes.data)) {
        if (iRes.data.length > 0) {
          const remoteIds = new Set(iRes.data.map((k) => k.id));
          const localOnly = this.inventory.filter((k) => !remoteIds.has(k.id));
          this.inventory = [...iRes.data, ...localOnly];
        }
      }
      if (cpRes.data && cpRes.data.length > 0) {
        this.coupons = cpRes.data;
      } else if (supabaseClient) {
        for (const cp of this.coupons) {
          await supabaseClient.from('coupons').upsert(cp).catch(() => {});
        }
      }
      if (rRes.data && rRes.data.length > 0) {
        this.reviews = rRes.data;
      }
      if (profRes.data && profRes.data.length > 0) {
        for (const prof of profRes.data) {
          const idx = this.users.findIndex((u) => u.id === prof.id);
          if (idx !== -1) {
            this.users[idx] = { ...this.users[idx], ...prof };
          } else {
            this.users.push(prof);
          }
        }
      }
      if (oaRes.data && oaRes.data.length > 0) {
        this.oauthAccounts = oaRes.data;
      }
      if (oRes.data && oRes.data.length > 0) {
        const remoteIds = new Set(oRes.data.map((o) => o.id));
        const localOnly = this.orders.filter((o) => !remoteIds.has(o.id));
        this.orders = [...oRes.data, ...localOnly];
      }
      if (oiRes.data && oiRes.data.length > 0) {
        const remoteIds = new Set(oiRes.data.map((oi) => oi.id));
        const localOnly = this.orderItems.filter((oi) => !remoteIds.has(oi.id));
        this.orderItems = [...oiRes.data, ...localOnly];
      }
      console.log(`✅ Supabase Database Synced: ${this.products.length} products, ${this.categories.length} categories, ${this.inventory.length} keys, ${this.coupons.length} coupons, ${this.reviews.length} reviews, ${this.users.length} users.`);
    } catch (err) {
      console.warn('⚠️ Supabase initial hydration warning:', err.message);
    }
  }
}

export const localStore = new LocalStore();

// ============================================================================
// Supabase Live Persistence Helpers
// ============================================================================
export async function saveProductToSupabase(product) {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient.from('products').upsert({
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      cover_image: product.cover_image,
      banner_image: product.banner_image || null,
      category_id: product.category_id || null,
      platform: product.platform,
      region: product.region || 'Global',
      activation_instructions: product.activation_instructions || '',
      current_price: product.current_price,
      comparison_price: product.comparison_price || null,
      currency: product.currency || 'USD',
      is_published: product.is_published ?? true,
      is_featured: product.is_featured ?? false,
      low_stock_threshold: product.low_stock_threshold || 3,
      updated_at: new Date().toISOString(),
    });
    if (error) console.error('Error saving product to Supabase:', error.message);
  } catch (err) {
    console.error('saveProductToSupabase exception:', err.message);
  }
}

export async function deleteProductFromSupabase(productId, isPermanent = false) {
  if (!supabaseClient || !productId) return { success: true };
  try {
    // 1. Resolve to canonical Supabase UUID
    let targetProductId = productId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetProductId);
    if (!isUuid) {
      if (targetProductId === 'prod-fivem-ready' || targetProductId === 'prod-10') {
        targetProductId = '10000000-0000-0000-0000-000000000010';
      } else if (targetProductId === 'prod-1') {
        targetProductId = '10000000-0000-0000-0000-000000000001';
      } else {
        const matched = (localStore.products || []).find(
          (p) => p.id === targetProductId || p.real_id === targetProductId || p.slug === targetProductId
        );
        if (matched?.real_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(matched.real_id)) {
          targetProductId = matched.real_id;
        } else if (matched?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(matched.id)) {
          targetProductId = matched.id;
        }
      }
    }

    const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetProductId);
    if (!validUuid) {
      return { success: true, localOnly: true };
    }

    // 2. Check if orders reference this product
    const { data: orderRefs } = await supabaseClient
      .from('order_items')
      .select('id')
      .eq('product_id', targetProductId)
      .limit(1);

    const hasOrderRefs = Array.isArray(orderRefs) && orderRefs.length > 0;

    // 3. Clean unallocated available digital keys from product_inventory
    try {
      await supabaseClient
        .from('product_inventory')
        .delete()
        .eq('product_id', targetProductId)
        .eq('status', 'available');
    } catch (e) {}

    // 4. Clean cart references
    try {
      await supabaseClient
        .from('cart_items')
        .delete()
        .eq('product_id', targetProductId);
    } catch (e) {}

    // 5. Clean review references
    try {
      await supabaseClient
        .from('reviews')
        .delete()
        .eq('product_id', targetProductId);
    } catch (e) {}

    if (hasOrderRefs && !isPermanent) {
      // Archive: Soft delete to preserve historical customer orders
      const { error } = await supabaseClient
        .from('products')
        .update({
          is_published: false,
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetProductId);

      if (error) console.error('Error archiving product in Supabase:', error.message);
      return { success: !error, archived: true };
    } else {
      // If there are order references in Supabase, ON DELETE RESTRICT on order_items prevents row deletion
      if (hasOrderRefs) {
        const { error } = await supabaseClient
          .from('products')
          .update({
            is_published: false,
            is_active: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', targetProductId);
        return { success: !error, archived: true };
      }

      // Safe permanent deletion from Supabase products table
      const { error } = await supabaseClient.from('products').delete().eq('id', targetProductId);
      if (error) {
        console.error('Error deleting product from Supabase:', error.message);
        // Fallback: archive so it never appears in store
        try {
          await supabaseClient
            .from('products')
            .update({ is_published: false, is_active: false })
            .eq('id', targetProductId);
        } catch (e) {}
      }
      return { success: !error, deleted: true };
    }
  } catch (err) {
    console.error('deleteProductFromSupabase exception:', err.message);
    return { success: false, error: err.message };
  }
}

export async function saveProfileToSupabase(user) {
  if (!supabaseClient || !user || !user.id) return;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id);
  if (!isUuid) return; // Keep non-UUID demo/test accounts in memory only
  try {
    const { error } = await supabaseClient.from('profiles').upsert({
      id: user.id,
      username: user.username,
      display_name: user.display_name || user.displayName || user.username,
      email: user.email,
      role: user.role || 'customer',
      status: user.status || 'active',
      avatar_url: user.avatar_url || user.avatarUrl || null,
      discord_id: user.discord_id || null,
      google_id: user.google_id || null,
      email_verified: user.email_verified ?? true,
      wallet_balance: parseFloat(user.wallet_balance ?? user.walletBalance ?? 0),
      last_login_at: user.last_login_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) {
      if (error.message && error.message.includes('Privilege escalation')) {
        // Supabase DB trigger prevents non-superuser setting role: 'admin'. Omit role to preserve DB role.
        await supabaseClient.from('profiles').upsert({
          id: user.id,
          username: user.username,
          display_name: user.display_name || user.displayName || user.username,
          email: user.email,
          status: user.status || 'active',
          avatar_url: user.avatar_url || user.avatarUrl || null,
          discord_id: user.discord_id || null,
          google_id: user.google_id || null,
          email_verified: user.email_verified ?? true,
          wallet_balance: parseFloat(user.wallet_balance ?? user.walletBalance ?? 0),
          last_login_at: user.last_login_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } else {
        console.error('Error saving profile to Supabase:', error.message);
      }
    }
  } catch (err) {
    console.error('saveProfileToSupabase exception:', err.message);
  }
}

export async function saveOAuthAccountToSupabase(oauth) {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient.from('oauth_accounts').upsert({
      id: oauth.id,
      user_id: oauth.user_id,
      provider: oauth.provider,
      provider_user_id: oauth.provider_user_id,
      email: oauth.email,
      email_verified: oauth.email_verified ?? true,
      display_name: oauth.display_name,
      avatar_url: oauth.avatar_url,
      metadata: oauth.metadata || {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider,provider_user_id' });
    if (error) console.error('Error saving oauth account to Supabase:', error.message);
  } catch (err) {
    console.error('saveOAuthAccountToSupabase exception:', err.message);
  }
}

export async function unlinkOAuthAccountOnSupabase(userId, provider) {
  if (!supabaseClient) return;
  try {
    await supabaseClient
      .from('oauth_accounts')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider);

    const updateObj = { updated_at: new Date().toISOString() };
    if (provider === 'google') updateObj.google_id = null;
    if (provider === 'discord') updateObj.discord_id = null;

    await supabaseClient.from('profiles').update(updateObj).eq('id', userId);
  } catch (err) {
    console.error('unlinkOAuthAccountOnSupabase exception:', err.message);
  }
}

export async function saveOrderToSupabase(order, items = [], allocatedKeys = []) {
  if (!supabaseClient || !order) return;
  try {
    const isUuid = order.user_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order.user_id);
    let orderUserId = isUuid ? order.user_id : null;
    if (orderUserId && supabaseClient) {
      try {
        const { data: profExists } = await supabaseClient.from('profiles').select('id').eq('id', orderUserId).single();
        if (!profExists) {
          orderUserId = null;
        }
      } catch (e) {
        orderUserId = null;
      }
    }

    const { error: ordErr } = await supabaseClient.from('orders').upsert({
      id: order.id,
      order_number: order.order_number,
      user_id: orderUserId,
      customer_email: order.customer_email || 'guest@nightcity.io',
      subtotal: order.subtotal,
      discount_amount: order.discount_amount || 0,
      total_amount: order.total_amount,
      currency: order.currency || 'USD',
      status: order.status,
      payment_method: order.payment_method || 'test_gateway',
      coupon_id: order.coupon_id || null,
      created_at: order.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (ordErr) console.error('Error saving order to Supabase:', ordErr.message);

    for (const it of items) {
      let resolvedPid = it.product_id;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resolvedPid);
      if (!isUuid) {
        if (resolvedPid === 'prod-fivem-ready' || resolvedPid === 'prod-10') {
          resolvedPid = '10000000-0000-0000-0000-000000000010';
        } else if (resolvedPid === 'prod-1') {
          resolvedPid = '10000000-0000-0000-0000-000000000001';
        } else {
          const matched = (localStore.products || []).find(
            (p) => p.id === resolvedPid || p.real_id === resolvedPid || p.slug === resolvedPid
          );
          if (matched?.real_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(matched.real_id)) {
            resolvedPid = matched.real_id;
          } else if (matched?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(matched.id)) {
            resolvedPid = matched.id;
          }
        }
      }

      const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resolvedPid);
      await supabaseClient.from('order_items').upsert({
        id: it.id,
        order_id: it.order_id,
        product_id: validUuid ? resolvedPid : null,
        product_name: it.product_name,
        unit_price: it.unit_price,
        quantity: it.quantity,
        subtotal: it.subtotal,
      });
    }

    for (const key of allocatedKeys) {
      await supabaseClient.from('product_inventory').update({
        status: key.status,
        reserved_at: key.reserved_at || null,
        reservation_token: key.reservation_token || null,
        order_item_id: key.order_item_id || null,
        redeemed_at: key.redeemed_at || null,
      }).eq('id', key.id);
    }
  } catch (err) {
    console.error('saveOrderToSupabase exception:', err.message);
  }
}

export async function saveInventoryKeyToSupabase(item) {
  if (!supabaseClient || !item) return;
  try {
    let targetProductId = item.product_id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetProductId);
    if (!isUuid) {
      if (item.product_id === 'prod-fivem-ready' || item.product_id === 'prod-10') {
        targetProductId = '10000000-0000-0000-0000-000000000010';
      } else if (item.product_id === 'prod-1') {
        targetProductId = '10000000-0000-0000-0000-000000000001';
      } else {
        const matched = (localStore.products || []).find(
          (p) => p.id === targetProductId || p.real_id === targetProductId || p.slug === targetProductId
        );
        if (matched?.real_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(matched.real_id)) {
          targetProductId = matched.real_id;
        } else if (matched?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(matched.id)) {
          targetProductId = matched.id;
        }
      }
    }

    const { error } = await supabaseClient.from('product_inventory').upsert({
      id: item.id,
      product_id: targetProductId,
      encrypted_key: item.encrypted_key,
      key_iv: item.key_iv,
      key_tag: item.key_tag,
      key_hash: item.key_hash,
      status: item.status || 'available',
      created_at: item.created_at || new Date().toISOString(),
    });
    if (error) console.error('saveInventoryKeyToSupabase error:', error.message);
  } catch (err) {
    console.error('saveInventoryKeyToSupabase exception:', err.message);
  }
}

export async function saveDiscordVerificationToSupabase(record) {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient.from('discord_verifications').upsert({
      id: record.id || crypto.randomUUID(),
      user_id: record.user_id || null,
      discord_user_id: record.discord_user_id,
      discord_guild_id: record.discord_guild_id,
      verified_role_id: record.verified_role_id,
      verification_status: record.verification_status || 'verified',
      verified_at: record.verified_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'discord_user_id,discord_guild_id' });
    if (error) console.error('saveDiscordVerificationToSupabase error:', error.message);
  } catch (err) {
    console.error('saveDiscordVerificationToSupabase exception:', err.message);
  }
}

export async function saveVerificationLogToSupabase(log) {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient.from('verification_logs').insert({
      id: log.id || crypto.randomUUID(),
      user_id: log.user_id || null,
      discord_user_id: log.discord_user_id || null,
      event_type: log.event_type,
      status: log.status,
      ip_address: log.ip_address || null,
      user_agent: log.user_agent || null,
      details: log.details || {},
      created_at: new Date().toISOString(),
    });
    if (error) console.error('saveVerificationLogToSupabase error:', error.message);
  } catch (err) {
    console.error('saveVerificationLogToSupabase exception:', err.message);
  }
}

export async function consumeVerificationSessionInSupabase(stateHash, discordUserId = null) {
  if (!supabaseClient) {
    // Local store fallback
    const session = (localStore.verificationSessions || []).find(
      (s) => s.state_hash === stateHash && !s.consumed_at && new Date(s.expires_at) > new Date()
    );
    if (!session) return { success: false, error: 'Invalid or expired verification session' };
    session.consumed_at = new Date().toISOString();
    return { success: true, session };
  }

  try {
    // Call the database atomic function consume_verification_session
    const { data, error } = await supabaseClient.rpc('consume_verification_session', {
      p_state_hash: stateHash,
      p_discord_user_id: discordUserId,
    });
    if (error) {
      console.warn('RPC consume_verification_session error, falling back to manual update:', error.message);
      const { data: row } = await supabaseClient
        .from('verification_sessions')
        .select('*')
        .eq('state_hash', stateHash)
        .is('consumed_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (!row) {
        return { success: false, error: 'Invalid, expired, or already consumed verification session' };
      }

      await supabaseClient
        .from('verification_sessions')
        .update({ consumed_at: new Date().toISOString(), discord_user_id: discordUserId || row.discord_user_id })
        .eq('id', row.id);

      return { success: true, session: row };
    }
    return data;
  } catch (err) {
    console.error('consumeVerificationSessionInSupabase exception:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getDiscordVerificationsFromSupabase() {
  if (!supabaseClient) return localStore.discordVerifications || [];
  try {
    const { data, error } = await supabaseClient
      .from('discord_verifications')
      .select('*, profiles(username, display_name, avatar_url, email)')
      .order('verified_at', { ascending: false });
    if (error) {
      console.error('getDiscordVerificationsFromSupabase error:', error.message);
      return localStore.discordVerifications || [];
    }
    return data || [];
  } catch (err) {
    return localStore.discordVerifications || [];
  }
}

export async function getVerificationLogsFromSupabase(limit = 100) {
  if (!supabaseClient) return localStore.verificationLogs || [];
  try {
    const { data, error } = await supabaseClient
      .from('verification_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('getVerificationLogsFromSupabase error:', error.message);
      return localStore.verificationLogs || [];
    }
    return data || [];
  } catch (err) {
    return localStore.verificationLogs || [];
  }
}

