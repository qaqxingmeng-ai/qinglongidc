-- ServerAI Platform Database Schema
-- PostgreSQL 16
-- Tables are auto-migrated by GORM (Go backend), this file serves as reference.

-- ==================== users ====================
CREATE TABLE IF NOT EXISTS users (
    id             VARCHAR(30) PRIMARY KEY,
    numeric_id     INTEGER NOT NULL UNIQUE DEFAULT 0,
    email          VARCHAR(255) NOT NULL UNIQUE,
    password       VARCHAR(255) NOT NULL,
    name           VARCHAR(100) NOT NULL,
    phone          VARCHAR(50),
    role           VARCHAR(20) NOT NULL DEFAULT 'USER',
    level          VARCHAR(20) NOT NULL DEFAULT 'GUEST',
    balance        DOUBLE PRECISION NOT NULL DEFAULT 0,
    invite_code    VARCHAR(20) UNIQUE,
    identity_code  VARCHAR(255),
    agent_id       VARCHAR(30) REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_agent_id ON users(agent_id);

-- ==================== cpus ====================
CREATE TABLE IF NOT EXISTS cpus (
    id          VARCHAR(30) PRIMARY KEY,
    model       VARCHAR(200) NOT NULL UNIQUE,
    cores       INTEGER NOT NULL,
    threads     INTEGER NOT NULL,
    frequency   VARCHAR(50) NOT NULL,
    benchmark   INTEGER NOT NULL,
    tags        TEXT NOT NULL DEFAULT '',
    description TEXT,
    source      VARCHAR(50) NOT NULL DEFAULT 'e81.cn',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== products ====================
CREATE TABLE IF NOT EXISTS products (
    id              VARCHAR(30) PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    category        VARCHAR(50) NOT NULL DEFAULT 'dedicated',
    region          VARCHAR(100) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    cpu_id          VARCHAR(30) NOT NULL REFERENCES cpus(id),
    cpu_display     VARCHAR(255) NOT NULL DEFAULT '',
    is_dual_cpu     BOOLEAN NOT NULL DEFAULT FALSE,
    cpu_count       INTEGER NOT NULL DEFAULT 1,
    memory          VARCHAR(100) NOT NULL,
    storage         VARCHAR(200) NOT NULL,
    bandwidth       VARCHAR(100) NOT NULL,
    ip_label        VARCHAR(100) NOT NULL DEFAULT '',
    protection_label VARCHAR(100) NOT NULL DEFAULT '',
    original_price  DOUBLE PRECISION NOT NULL,
    cost_price      DOUBLE PRECISION NOT NULL,
    supplier        VARCHAR(100) NOT NULL DEFAULT '',
    -- Core scoring dimensions (active):
    score_network        INTEGER NOT NULL DEFAULT 0,
    score_cpu_single     INTEGER NOT NULL DEFAULT 0,
    score_cpu_multi      INTEGER NOT NULL DEFAULT 0,
    score_defense        INTEGER NOT NULL DEFAULT 0,
    -- Non-core scoring columns (deprecated, kept for backward compatibility, should remain 0):
    score_memory         INTEGER NOT NULL DEFAULT 0,
    score_storage        INTEGER NOT NULL DEFAULT 0,
    score_latency        INTEGER NOT NULL DEFAULT 0,
    score_delivery       INTEGER NOT NULL DEFAULT 0,
    score_support        INTEGER NOT NULL DEFAULT 0,
    score_platform_bonus INTEGER NOT NULL DEFAULT 0,
    score_notes          TEXT NOT NULL DEFAULT '{}',
    score_updated_at     TIMESTAMPTZ,
    ai_description  TEXT,
    ai_suitable_for TEXT,
    click_count     INTEGER NOT NULL DEFAULT 0,
    order_count     INTEGER NOT NULL DEFAULT 0,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_region     ON products(region);
CREATE INDEX IF NOT EXISTS idx_products_status     ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_cpu_id     ON products(cpu_id);
CREATE INDEX IF NOT EXISTS idx_products_sort_order ON products(sort_order);

-- ==================== pricing_configs ====================
CREATE TABLE IF NOT EXISTS pricing_configs (
    id                  VARCHAR(30) PRIMARY KEY DEFAULT 'default',
    partner_markup      DOUBLE PRECISION NOT NULL DEFAULT 0.20,
    vip_top_markup      DOUBLE PRECISION NOT NULL DEFAULT 0.40,
    vip_markup          DOUBLE PRECISION NOT NULL DEFAULT 0.50,
    guest_markup        DOUBLE PRECISION NOT NULL DEFAULT 1.00,
    rounding_threshold  INTEGER NOT NULL DEFAULT 600,
    rounding_small_step INTEGER NOT NULL DEFAULT 10,
    rounding_large_step INTEGER NOT NULL DEFAULT 50,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default pricing
INSERT INTO pricing_configs (id) VALUES ('default') ON CONFLICT DO NOTHING;

-- ==================== orders ====================
CREATE TABLE IF NOT EXISTS orders (
    id          VARCHAR(30) PRIMARY KEY,
    order_no    VARCHAR(50) NOT NULL UNIQUE,
    user_id     VARCHAR(30) NOT NULL REFERENCES users(id),
    status      VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    total_price DOUBLE PRECISION NOT NULL,
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);

-- ==================== order_items ====================
CREATE TABLE IF NOT EXISTS order_items (
    id         VARCHAR(30) PRIMARY KEY,
    order_id   VARCHAR(30) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id VARCHAR(30) NOT NULL REFERENCES products(id),
    quantity   INTEGER NOT NULL DEFAULT 1,
    period     INTEGER NOT NULL DEFAULT 1,
    price      DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- ==================== server_instances ====================
CREATE TABLE IF NOT EXISTS server_instances (
    id              VARCHAR(30) PRIMARY KEY,
    user_id         VARCHAR(30) NOT NULL REFERENCES users(id),
    product_id      VARCHAR(30) NOT NULL REFERENCES products(id),
    hostname        VARCHAR(100),
    ip              VARCHAR(50),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    config          TEXT NOT NULL,
    renewal_history TEXT NOT NULL DEFAULT '[]',
    user_note       TEXT,
    admin_note      TEXT,
    start_date      TIMESTAMPTZ,
    expire_date     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_server_instances_user_id ON server_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_server_instances_status  ON server_instances(status);

-- ==================== tickets ====================
CREATE TABLE IF NOT EXISTS tickets (
    id                  VARCHAR(30) PRIMARY KEY,
    ticket_no           VARCHAR(50) NOT NULL UNIQUE,
    user_id             VARCHAR(30) NOT NULL REFERENCES users(id),
    agent_id            VARCHAR(30) REFERENCES users(id),
    order_id            VARCHAR(30) REFERENCES orders(id),
    type                VARCHAR(20) NOT NULL,
    category            VARCHAR(20) NOT NULL DEFAULT 'GENERAL',
    subject             VARCHAR(255) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    priority            VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    related_product_ids TEXT,
    on_behalf_user_id   VARCHAR(30),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tickets_user_id  ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_agent_id ON tickets(agent_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status   ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category);
CREATE INDEX IF NOT EXISTS idx_tickets_order_id ON tickets(order_id);

-- ==================== ticket_messages ====================
CREATE TABLE IF NOT EXISTS ticket_messages (
    id         VARCHAR(30) PRIMARY KEY,
    ticket_id  VARCHAR(30) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    sender     VARCHAR(30) NOT NULL,
    role       VARCHAR(20) NOT NULL,
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);

-- ==================== ai_sessions ====================
CREATE TABLE IF NOT EXISTS ai_sessions (
    id         VARCHAR(30) PRIMARY KEY,
    user_id    VARCHAR(30) REFERENCES users(id),
    status     VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    result     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_user_id ON ai_sessions(user_id);

-- ==================== ai_messages ====================
CREATE TABLE IF NOT EXISTS ai_messages (
    id         VARCHAR(30) PRIMARY KEY,
    session_id VARCHAR(30) NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
    role       VARCHAR(20) NOT NULL,
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_session_id ON ai_messages(session_id);

-- ==================== transactions ====================
CREATE TABLE IF NOT EXISTS transactions (
    id                VARCHAR(30) PRIMARY KEY,
    user_id           VARCHAR(30) NOT NULL REFERENCES users(id),
    type              VARCHAR(30) NOT NULL,
    amount            DOUBLE PRECISION NOT NULL,
    balance_before    DOUBLE PRECISION NOT NULL,
    balance_after     DOUBLE PRECISION NOT NULL,
    note              TEXT,
    related_order_id  VARCHAR(30),
    related_server_id VARCHAR(30),
    operator_id       VARCHAR(30),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id    ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type       ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_related_order_id ON transactions(related_order_id);

-- ==================== email_verifications ====================
CREATE TABLE IF NOT EXISTS email_verifications (
    id         VARCHAR(30) PRIMARY KEY,
    email      VARCHAR(255) NOT NULL,
    code       VARCHAR(10) NOT NULL,
    used       BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email);

-- ==================== analytics ====================
CREATE TABLE IF NOT EXISTS analytics (
    id         VARCHAR(30) PRIMARY KEY,
    event      VARCHAR(50) NOT NULL,
    target     VARCHAR(100),
    meta       TEXT,
    user_id    VARCHAR(30),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_event      ON analytics(event);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics(created_at);

-- ==================== user_logs ====================
CREATE TABLE IF NOT EXISTS user_logs (
    id         VARCHAR(30) PRIMARY KEY,
    user_id    VARCHAR(30) NOT NULL REFERENCES users(id),
    event      VARCHAR(50) NOT NULL,
    target_id  VARCHAR(100),
    detail     TEXT,
    meta       TEXT,
    ip         VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_logs_user_id    ON user_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_logs_event      ON user_logs(event);
CREATE INDEX IF NOT EXISTS idx_user_logs_created_at ON user_logs(created_at);
