-- ============================================================================
-- NIGHTMARE STORE: COMPLETE MASTER SUPABASE SQL SETUP
-- Paste this entire script into your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/wzcerytdyboigwjyqkoc/sql/new
-- ============================================================================

-- Enable required cryptographic & UUID extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. PROFILES & USER ACCOUNTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_id TEXT UNIQUE,
    google_id TEXT,
    username TEXT,
    display_name TEXT,
    avatar_url TEXT,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'moderator')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'disabled')),
    email_verified BOOLEAN DEFAULT false,
    wallet_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (wallet_balance >= 0),
    last_login_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure non-blocking constraints and guarantee all columns exist even on existing tables
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS discord_id TEXT;
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer';
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_profiles_discord_id ON public.profiles(discord_id);
CREATE INDEX IF NOT EXISTS idx_profiles_google_id ON public.profiles(google_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Trigger to automatically populate public.profiles when someone signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, display_name, avatar_url, role, email_verified, wallet_balance)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'),
    'customer',
    COALESCE((new.raw_user_meta_data->>'email_verified')::boolean, false),
    0.00
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = timezone('utc'::text, now());
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================================
-- 2. MULTI-PROVIDER OAUTH ACCOUNTS & SESSIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.oauth_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google', 'discord')),
    provider_user_id TEXT NOT NULL,
    email TEXT,
    email_verified BOOLEAN DEFAULT false,
    display_name TEXT,
    username TEXT,
    avatar_url TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_oauth_provider_user UNIQUE (provider, provider_user_id),
    CONSTRAINT uq_oauth_user_provider UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON public.oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_lookup ON public.oauth_accounts(provider, provider_user_id);

CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_token_hash TEXT NOT NULL UNIQUE,
    user_agent TEXT,
    ip_address TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_lookup ON public.user_sessions(session_token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);

-- ============================================================================
-- 3. CATEGORIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    icon_name TEXT DEFAULT 'Gamepad2',
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);

-- ============================================================================
-- 4. PRODUCTS & DIGITAL KEY INVENTORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    cover_image TEXT NOT NULL,
    banner_image TEXT,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    platform TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT 'Global',
    activation_instructions TEXT NOT NULL DEFAULT 'Redeem using standard platform client instructions.',
    current_price NUMERIC(10, 2) NOT NULL CHECK (current_price >= 0),
    comparison_price NUMERIC(10, 2) CHECK (comparison_price IS NULL OR comparison_price >= current_price),
    currency TEXT NOT NULL DEFAULT 'USD',
    is_published BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    low_stock_threshold INT NOT NULL DEFAULT 3 CHECK (low_stock_threshold >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Guarantee all product columns exist even if products table was created in an earlier migration
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS low_stock_threshold INT NOT NULL DEFAULT 3;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS banner_image TEXT;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS activation_instructions TEXT DEFAULT 'Redeem using standard platform client instructions.';

CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_published ON public.products(is_published);
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products(is_featured);

CREATE TABLE IF NOT EXISTS public.product_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    encrypted_key TEXT NOT NULL,
    key_iv TEXT NOT NULL,
    key_tag TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold', 'revoked')),
    reserved_at TIMESTAMPTZ,
    reservation_token TEXT,
    order_item_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    redeemed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_product_key_hash ON public.product_inventory(product_id, key_hash);
CREATE INDEX IF NOT EXISTS idx_inventory_product_status ON public.product_inventory(product_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_reservation ON public.product_inventory(reservation_token, reserved_at);
CREATE INDEX IF NOT EXISTS idx_inventory_order_item ON public.product_inventory(order_item_id);

CREATE TABLE IF NOT EXISTS public.inventory_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('add_batch', 'revoke', 'export', 'auto_reserve', 'release_reservation', 'sold')),
    actor_id TEXT NOT NULL,
    keys_count INT NOT NULL DEFAULT 1,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 5. CARTS & COUPONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_token TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_cart_product UNIQUE(cart_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
    min_spend NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (min_spend >= 0),
    max_uses INT,
    times_used INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 6. ORDERS & ORDER ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    customer_email TEXT NOT NULL,
    subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'processing', 'completed', 'cancelled', 'failed', 'refunded')),
    payment_method TEXT DEFAULT 'khqr_cutluy',
    coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.product_inventory 
    DROP CONSTRAINT IF EXISTS fk_inventory_order_item;
ALTER TABLE public.product_inventory 
    ADD CONSTRAINT fk_inventory_order_item FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE SET NULL;

-- ============================================================================
-- 7. CUTLUY KHQR PAYMENTS & WALLET TRANSACTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cutluy_payments (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    order_id TEXT,
    purpose TEXT NOT NULL CHECK (purpose IN ('topup', 'order')),
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'USD',
    reference_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scanned', 'paid', 'expired', 'failed')),
    qr_string TEXT,
    checkout_url TEXT,
    approved_at TIMESTAMPTZ,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cutluy_payments_reference ON public.cutluy_payments(reference_id);
CREATE INDEX IF NOT EXISTS idx_cutluy_payments_user ON public.cutluy_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_cutluy_payments_status ON public.cutluy_payments(status);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    payment_id TEXT REFERENCES public.cutluy_payments(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('topup', 'spend', 'refund')),
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    balance_before NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    balance_after NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created ON public.wallet_transactions(created_at DESC);

-- ============================================================================
-- 8. REVIEWS, SUPPORT TICKETS, & AUDIT LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    is_verified_purchase BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    order_number TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID,
    actor_role TEXT,
    action TEXT NOT NULL,
    target_resource TEXT NOT NULL,
    target_id TEXT,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 9. DISCORD BOT VERIFICATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.discord_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    discord_user_id TEXT NOT NULL,
    discord_guild_id TEXT NOT NULL,
    verified_role_id TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('pending', 'verified', 'revoked', 'failed')),
    verified_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_discord_member_guild UNIQUE (discord_user_id, discord_guild_id)
);

CREATE INDEX IF NOT EXISTS idx_discord_verif_user_id ON public.discord_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_discord_verif_discord_id ON public.discord_verifications(discord_user_id);

CREATE TABLE IF NOT EXISTS public.verification_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    discord_user_id TEXT,
    state_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 10. ADMIN EMAIL OTP & TWO-FACTOR SESSIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_email_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_email TEXT NOT NULL,
    otp_code_hash TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'admin_login',
    attempts_count INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.admin_active_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    admin_email TEXT NOT NULL,
    session_token_hash TEXT NOT NULL UNIQUE,
    user_agent TEXT,
    ip_address TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 11. KEY ATOMIC ASSIGNMENT FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assign_keys_to_order_item(
    p_order_item_id UUID,
    p_product_id UUID,
    p_quantity INT
)
RETURNS TABLE (assigned_key_id UUID) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_available_count INT;
    v_locked_ids UUID[];
BEGIN
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be greater than zero';
    END IF;

    SELECT array_agg(id) INTO v_locked_ids
    FROM (
        SELECT id
        FROM public.product_inventory
        WHERE product_id = p_product_id AND status = 'available'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_quantity
    ) sub;

    v_available_count := COALESCE(array_length(v_locked_ids, 1), 0);

    IF v_available_count < p_quantity THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Requested %, but only % available for product %', 
            p_quantity, v_available_count, p_product_id;
    END IF;

    UPDATE public.product_inventory
    SET status = 'sold',
        order_item_id = p_order_item_id,
        redeemed_at = timezone('utc'::text, now()),
        reservation_token = NULL,
        reserved_at = NULL
    WHERE id = ANY(v_locked_ids);

    RETURN QUERY SELECT unnest(v_locked_ids);
END;
$$;

-- ============================================================================
-- 12. ROW LEVEL SECURITY (RLS) POLICIES & PERMISSIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant schema permissions to avoid 'permission denied' errors
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id OR public.is_admin());

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Categories are readable by everyone" ON public.categories;
CREATE POLICY "Categories are readable by everyone" ON public.categories FOR SELECT USING (true);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Published products are viewable by everyone" ON public.products;
CREATE POLICY "Published products are viewable by everyone" ON public.products FOR SELECT USING (is_published = true OR public.is_admin());

ALTER TABLE public.product_inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view and manage inventory" ON public.product_inventory;
CREATE POLICY "Admins can view and manage inventory" ON public.product_inventory FOR ALL TO authenticated USING (public.is_admin());

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
DROP POLICY IF EXISTS "Users can insert their own orders" ON public.orders;
CREATE POLICY "Users can insert their own orders" ON public.orders FOR INSERT WITH CHECK (true);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own order items" ON public.order_items;
CREATE POLICY "Users can view their own order items" ON public.order_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert order items" ON public.order_items;
CREATE POLICY "Users can insert order items" ON public.order_items FOR INSERT WITH CHECK (true);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Active coupons can be validated by users" ON public.coupons;
CREATE POLICY "Active coupons can be validated by users" ON public.coupons FOR SELECT USING (is_active = true);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON public.reviews;
CREATE POLICY "Reviews are viewable by everyone" ON public.reviews FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can create reviews" ON public.reviews;
CREATE POLICY "Users can create reviews" ON public.reviews FOR INSERT WITH CHECK (true);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can create a support ticket" ON public.support_tickets;
CREATE POLICY "Anyone can create a support ticket" ON public.support_tickets FOR INSERT WITH CHECK (true);

ALTER TABLE public.cutluy_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own payments" ON public.cutluy_payments;
CREATE POLICY "Users view own payments" ON public.cutluy_payments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert payments" ON public.cutluy_payments;
CREATE POLICY "Users can insert payments" ON public.cutluy_payments FOR INSERT WITH CHECK (true);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Users view own wallet transactions" ON public.wallet_transactions FOR SELECT USING (true);

-- ============================================================================
-- 13. SEED INITIAL STORE CATEGORIES & DEFAULT ADMIN
-- ============================================================================
INSERT INTO public.categories (id, name, slug, description, icon_name, display_order)
VALUES
    ('c1111111-1111-1111-1111-111111111111', 'Action & RPG', 'action-rpg', 'Immersive role-playing games and high-octane action titles', 'Sword', 1),
    ('c2222222-2222-2222-2222-222222222222', 'Shooters & Co-op', 'shooters', 'Competitive tactical shooters and battle royales', 'Crosshair', 2),
    ('c3333333-3333-3333-3333-333333333333', 'Open World & Adventure', 'open-world', 'Massive exploration worlds, survival craft, and rich stories', 'Compass', 3),
    ('c4444444-4444-4444-4444-444444444444', 'Minecraft & Sandbox', 'minecraft-sandbox', 'Minecraft keys, minecoins, and sandbox construction games', 'Pickaxe', 4),
    ('c5555555-5555-5555-5555-555555555555', 'Gift Cards & Subscriptions', 'gift-cards', 'PlayStation, Xbox, Steam wallets, and game pass memberships', 'CreditCard', 5),
    ('c6666666-6666-6666-6666-666666666666', 'Sports & Racing', 'sports-racing', 'Authentic sports simulators and racing titles', 'Trophy', 6)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    icon_name = EXCLUDED.icon_name;

-- Seed default Administrator Profile
INSERT INTO public.profiles (id, username, display_name, email, role, status, email_verified, wallet_balance)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'admin',
    'Nightmare Store Admin',
    'mdara9695@gmail.com',
    'admin',
    'active',
    true,
    9999.00
)
ON CONFLICT (id) DO UPDATE SET
    role = 'admin',
    status = 'active';

-- ============================================================================
-- 14. SEED PRODUCTS
-- ============================================================================
INSERT INTO public.products (
    id, name, slug, description, cover_image, banner_image, 
    category_id, platform, region, activation_instructions, 
    current_price, comparison_price, currency, is_published, is_featured, low_stock_threshold
)
VALUES
(
    '10000000-0000-0000-0000-000000000001',
    'Cyberpunk 2077: Phantom Liberty Bundle',
    'cyberpunk-2077-phantom-liberty-bundle',
    'Phantom Liberty is a spy-thriller expansion for Cyberpunk 2077. Enter the shadows of Dogtown and master high-stakes espionage in Night City.',
    'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1600&auto=format&fit=crop&q=80',
    'c1111111-1111-1111-1111-111111111111',
    'Steam',
    'Global',
    '1. Open Steam client.\n2. Click Games -> Activate a Product on Steam.\n3. Enter key code.\n4. Enjoy the journey.',
    34.99,
    59.99,
    'USD',
    true,
    true,
    5
),
(
    '10000000-0000-0000-0000-000000000002',
    'Elden Ring: Shadow of the Erdtree Edition',
    'elden-ring-shadow-of-the-erdtree',
    'Guided by grace to brandish the power of the Elden Ring and become an Elden Lord in the Lands Between.',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
    'c1111111-1111-1111-1111-111111111111',
    'Steam',
    'Global',
    '1. Open Steam client.\n2. Click Games -> Activate a Product.\n3. Paste key and install.',
    54.99,
    79.99,
    'USD',
    true,
    true,
    4
),
(
    '10000000-0000-0000-0000-000000000003',
    'Black Myth: Wukong - Digital Deluxe Edition',
    'black-myth-wukong-deluxe',
    'An action RPG rooted in Chinese mythology. Set out as the Destined One to venture into the challenges ahead to uncover ancient truth.',
    'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1600&auto=format&fit=crop&q=80',
    'c1111111-1111-1111-1111-111111111111',
    'Steam',
    'Global',
    '1. Open Steam client.\n2. Go to Games -> Activate a Product on Steam.\n3. Enter the key.',
    49.99,
    69.99,
    'USD',
    true,
    true,
    3
),
(
    '10000000-0000-0000-0000-000000000004',
    'Minecraft: Java & Bedrock Edition for PC',
    'minecraft-java-bedrock-edition-pc',
    'Create, explore, survive, and repeat. Unified launcher gives you access to both Java and Bedrock editions.',
    '/card-minecraft-hd.png',
    'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1600&auto=format&fit=crop&q=80',
    'c4444444-4444-4444-4444-444444444444',
    'Minecraft',
    'Global',
    '1. Visit microsoft.com/redeem or minecraft.net/redeem.\n2. Enter code.\n3. Download launcher.',
    19.99,
    29.99,
    'USD',
    true,
    true,
    10
),
(
    '10000000-0000-0000-0000-000000000005',
    'Helldivers 2 - Super Citizen Edition',
    'helldivers-2-super-citizen',
    'The Galaxy’s Last Line of Offence. Enlist in the Helldivers and join the fight for freedom across a hostile galaxy.',
    'https://images.unsplash.com/photo-1552824722-ddab1374e622?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1600&auto=format&fit=crop&q=80',
    'c2222222-2222-2222-2222-222222222222',
    'Steam',
    'Global',
    '1. Log into Steam.\n2. Activate key.\n3. Play.',
    37.99,
    59.99,
    'USD',
    true,
    true,
    4
),
(
    '10000000-0000-0000-0000-000000000006',
    'PlayStation Store $50 USD Gift Card',
    'playstation-store-50-usd-gift-card',
    'Top up your PlayStation Network wallet to purchase full games, DLC, and add-ons from PlayStation Store.',
    'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1486401899868-0e435ed85128?w=1600&auto=format&fit=crop&q=80',
    'c5555555-5555-5555-5555-555555555555',
    'PlayStation',
    'North America',
    '1. Sign in to PSN.\n2. Redeem code in PlayStation Store.',
    44.99,
    50.00,
    'USD',
    true,
    false,
    4
),
(
    '10000000-0000-0000-0000-000000000007',
    'Xbox Game Pass Ultimate - 3 Months Membership',
    'xbox-game-pass-ultimate-3-months',
    'Over 100 high-quality console & PC games, EA Play membership, and Cloud Gaming.',
    'https://images.unsplash.com/photo-1605901309584-818e25960a8f?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=1600&auto=format&fit=crop&q=80',
    'c5555555-5555-5555-5555-555555555555',
    'Xbox',
    'Global',
    '1. Go to redeem.microsoft.com.\n2. Enter code.',
    32.99,
    44.99,
    'USD',
    true,
    true,
    3
),
(
    '10000000-0000-0000-0000-000000000008',
    'EA SPORTS FC 25 Standard Edition',
    'ea-sports-fc-25-standard-edition',
    'Experience tactical realism with FC IQ overhaul. Play as the biggest clubs and leagues in football.',
    'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=1600&auto=format&fit=crop&q=80',
    'c6666666-6666-6666-6666-666666666666',
    'EA App',
    'Global',
    '1. Launch EA App.\n2. Redeem code.',
    46.99,
    69.99,
    'USD',
    true,
    false,
    3
),
(
    '10000000-0000-0000-0000-000000000009',
    'FiveM Activation Code',
    'fivem-activation-code',
    'Instant FiveM Rockstar activation digital key for custom GTA roleplay servers.',
    '/card-rockstar-hd.png',
    'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1600&auto=format&fit=crop&q=80',
    'c1111111-1111-1111-1111-111111111111',
    'Fivem',
    'Global',
    'Enter key on your FiveM client or Rockstar Games Launcher.',
    0.50,
    2.00,
    'USD',
    true,
    false,
    10
),
(
    '10000000-0000-0000-0000-000000000010',
    'Account rockstar',
    'rockstar-account',
    'Pre-activated Rockstar Games Account Ready for instant play.',
    '/card-rockstar-account.png',
    'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1600&auto=format&fit=crop&q=80',
    'c1111111-1111-1111-1111-111111111111',
    'Fivem',
    'Global',
    'Credentials provided automatically on your order receipt.',
    4.50,
    6.00,
    'USD',
    true,
    true,
    5
),
(
    '10000000-0000-0000-0000-000000000011',
    'gemini pro 18month',
    'gemini-pro-18month',
    'Google Gemini Pro 18-Month Premium AI Subscription upgrade voucher.',
    '/card-gemini.png',
    'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=1600&auto=format&fit=crop&q=80',
    'c3333333-3333-3333-3333-333333333333',
    'Giftlink',
    'Global',
    'Open the private link delivered to your order page to claim.',
    3.00,
    18.00,
    'USD',
    true,
    true,
    5
),
(
    '10000000-0000-0000-0000-000000000012',
    'Nitro Discord 3Month',
    'nitro-discord-3month',
    'Discord Nitro 3-Month promotional gift link with custom emojis, 2 server boosts & 500MB uploads.',
    '/card-nitro.png',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
    'c3333333-3333-3333-3333-333333333333',
    'Giftlink',
    'Global',
    'Click the unique Discord promo link to activate on your Discord account.',
    4.00,
    29.99,
    'USD',
    true,
    true,
    8
),
(
    '10000000-0000-0000-0000-000000000013',
    '14x 1 Month Server Boosts',
    '14x-1-month-server-boosts',
    'Instantly Level 3 boost your Discord guild with 14x 1-month server boosts.',
    '/card-nitro-boosts-hd.png',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
    'c3333333-3333-3333-3333-333333333333',
    'Giftlink',
    'Global',
    'Provide invite link in order notes for automated guild boosting.',
    7.00,
    49.99,
    'USD',
    true,
    false,
    5
),
(
    '10000000-0000-0000-0000-000000000014',
    'Outlook E-Mail Accounts',
    'outlook-e-mail-accounts',
    'Clean POP3/IMAP enabled Outlook mail accounts verified with recovery safeguards.',
    'https://images.unsplash.com/photo-1596526131083-e8c633c948d2?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
    'c3333333-3333-3333-3333-333333333333',
    'mail',
    'Global',
    'Format: email|password|recovery',
    0.20,
    1.00,
    'USD',
    true,
    false,
    20
),
(
    '10000000-0000-0000-0000-000000000015',
    'Nord VPN Lifetime',
    'nord-vpn-lifetime',
    'NordVPN premium high-speed encrypted VPN license with double encryption & threat protection.',
    'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
    'c3333333-3333-3333-3333-333333333333',
    'vpn',
    'Global',
    'Log in directly using supplied account credentials.',
    2.00,
    59.99,
    'USD',
    true,
    true,
    5
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    current_price = EXCLUDED.current_price,
    comparison_price = EXCLUDED.comparison_price,
    cover_image = EXCLUDED.cover_image,
    platform = EXCLUDED.platform,
    is_published = EXCLUDED.is_published,
    is_active = EXCLUDED.is_active;

-- ============================================================================
-- 15. SEED COUPONS
-- ============================================================================
INSERT INTO public.coupons (id, code, discount_type, discount_value, min_spend, max_uses, times_used, is_active)
VALUES
    ('c0111111-1111-1111-1111-111111111111', 'CYBER15', 'percentage', 15.00, 20.00, 1000, 42, true),
    ('c0222222-2222-2222-2222-222222222222', 'NEON10', 'percentage', 10.00, 10.00, 500, 19, true),
    ('c0333333-3333-3333-3333-333333333333', 'DARA5OFF', 'fixed', 5.00, 30.00, 200, 8, true),
    ('c0444444-4444-4444-4444-444444444444', 'NIGHTMARE', 'percentage', 15.00, 1.00, 5000, 10, true)
ON CONFLICT (code) DO UPDATE SET
    is_active = true,
    discount_value = EXCLUDED.discount_value;
