const db = require("../config/db");

async function runMigrations() {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_roles (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        type VARCHAR(16) NOT NULL DEFAULT 'system',
        inherits_from VARCHAR(64),
        org_id VARCHAR(64),
        is_system BOOLEAN NOT NULL DEFAULT FALSE,
        created_by VARCHAR(64),
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE doffice_roles
      ADD COLUMN IF NOT EXISTS type VARCHAR(16) NOT NULL DEFAULT 'system';
    `);

    await client.query(`
      ALTER TABLE doffice_roles
      ADD COLUMN IF NOT EXISTS inherits_from VARCHAR(64);
    `);

    await client.query(`
      ALTER TABLE doffice_roles
      ADD COLUMN IF NOT EXISTS org_id VARCHAR(64);
    `);

    await client.query(`
      ALTER TABLE doffice_roles
      ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await client.query(`
      ALTER TABLE doffice_roles
      ADD COLUMN IF NOT EXISTS created_by VARCHAR(64);
    `);

    await client.query(`
      ALTER TABLE doffice_roles
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await client.query(`
      UPDATE doffice_roles
      SET is_system = CASE
        WHEN id IN ('role_super_admin', 'role_org_admin', 'role_org_user', 'role_manager', 'role_employee') THEN TRUE
        ELSE is_system
      END,
      type = CASE
        WHEN id IN ('role_super_admin', 'role_org_admin', 'role_org_user', 'role_manager', 'role_employee') THEN 'system'
        WHEN type IS NULL OR type = '' THEN 'custom'
        ELSE type
      END
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_roles
      DROP CONSTRAINT IF EXISTS doffice_roles_name_key;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doffice_roles_active_name_scope
      ON doffice_roles(COALESCE(org_id, '__global__'), LOWER(name))
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_roles_org_id ON doffice_roles(org_id) WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_roles_type ON doffice_roles(type) WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_organizations (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(100) UNIQUE NOT NULL,
        parent_id VARCHAR(64) REFERENCES doffice_organizations(id) ON DELETE SET NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        type VARCHAR(64) NOT NULL DEFAULT 'root',
        logo TEXT,
        depth INTEGER NOT NULL DEFAULT 0,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE doffice_organizations
      ADD COLUMN IF NOT EXISTS type VARCHAR(64) NOT NULL DEFAULT 'root';
    `);

    await client.query(`
      ALTER TABLE doffice_organizations
      ADD COLUMN IF NOT EXISTS logo TEXT;
    `);

    await client.query(`
      ALTER TABLE doffice_organizations
      ADD COLUMN IF NOT EXISTS depth INTEGER NOT NULL DEFAULT 0;
    `);

    await client.query(`
      ALTER TABLE doffice_organizations
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_organizations_status_check'
        ) THEN
          ALTER TABLE doffice_organizations
          ADD CONSTRAINT doffice_organizations_status_check
          CHECK (status IN ('active', 'archived', 'deactivated'));
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_orgs_parent_id ON doffice_organizations(parent_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_orgs_status ON doffice_organizations(status);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_users (
        id VARCHAR(64) PRIMARY KEY,
        username VARCHAR(120) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name VARCHAR(255),
        employee_id VARCHAR(100),
        designation VARCHAR(255),
        department VARCHAR(255),
        bio TEXT,
        avatar TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        contact_phone VARCHAR(64),
        contact_address TEXT,
        org_id VARCHAR(64) REFERENCES doffice_organizations(id) ON DELETE SET NULL,
        is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
        manager_id VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        location VARCHAR(255),
        skills TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
        last_seen_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE doffice_users
      ADD COLUMN IF NOT EXISTS manager_id VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_users
      ADD COLUMN IF NOT EXISTS location VARCHAR(255);
    `);

    await client.query(`
      ALTER TABLE doffice_users
      ADD COLUMN IF NOT EXISTS skills TEXT[] NOT NULL DEFAULT ARRAY[]::text[];
    `);

    await client.query(`
      ALTER TABLE doffice_users
      ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
    `);

    await client.query(`
      ALTER TABLE doffice_users
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_users_status_check'
        ) THEN
          ALTER TABLE doffice_users
          ADD CONSTRAINT doffice_users_status_check
          CHECK (status IN ('active', 'suspended', 'on-leave', 'deactivated', 'retired'));
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_users_email_format_check'
        ) THEN
          ALTER TABLE doffice_users
          ADD CONSTRAINT doffice_users_email_format_check
          CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$')
          NOT VALID;
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_users_status ON doffice_users(status);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_users_manager_id ON doffice_users(manager_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_users_deleted_at ON doffice_users(deleted_at);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_users_org_id ON doffice_users(org_id);
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_roles_org_id_fkey'
        ) THEN
          ALTER TABLE doffice_roles
          ADD CONSTRAINT doffice_roles_org_id_fkey
          FOREIGN KEY (org_id) REFERENCES doffice_organizations(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_roles_created_by_fkey'
        ) THEN
          ALTER TABLE doffice_roles
          ADD CONSTRAINT doffice_roles_created_by_fkey
          FOREIGN KEY (created_by) REFERENCES doffice_users(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_user_roles (
        user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        role_id VARCHAR(64) NOT NULL REFERENCES doffice_roles(id) ON DELETE CASCADE,
        org_id VARCHAR(64) REFERENCES doffice_organizations(id) ON DELETE CASCADE,
        assigned_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, role_id)
      );
    `);

    await client.query(`
      ALTER TABLE doffice_user_roles
      ADD COLUMN IF NOT EXISTS org_id VARCHAR(64) REFERENCES doffice_organizations(id) ON DELETE CASCADE;
    `);

    await client.query(`
      ALTER TABLE doffice_user_roles
      ADD COLUMN IF NOT EXISTS assigned_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_user_roles
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_user_roles_pkey'
        ) THEN
          ALTER TABLE doffice_user_roles DROP CONSTRAINT doffice_user_roles_pkey;
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doffice_user_roles_active
      ON doffice_user_roles(user_id, role_id, COALESCE(org_id, '__global__'))
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_user_roles_user_org
      ON doffice_user_roles(user_id, org_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_user_roles_role_org
      ON doffice_user_roles(role_id, org_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_role_permissions (
        id BIGSERIAL PRIMARY KEY,
        role_id VARCHAR(64) NOT NULL REFERENCES doffice_roles(id) ON DELETE CASCADE,
        module VARCHAR(100) NOT NULL,
        action VARCHAR(100) NOT NULL,
        allow BOOLEAN NOT NULL DEFAULT TRUE,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_role_permissions_role
      ON doffice_role_permissions(role_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doffice_role_permissions_active
      ON doffice_role_permissions(role_id, module, action)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_teams (
        id VARCHAR(64) PRIMARY KEY,
        org_id VARCHAR(64) NOT NULL REFERENCES doffice_organizations(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        type VARCHAR(32) NOT NULL DEFAULT 'static',
        dynamic_filter JSONB,
        created_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        deleted_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE doffice_teams
      ADD COLUMN IF NOT EXISTS description TEXT;
    `);

    await client.query(`
      ALTER TABLE doffice_teams
      ADD COLUMN IF NOT EXISTS type VARCHAR(32) NOT NULL DEFAULT 'static';
    `);

    await client.query(`
      ALTER TABLE doffice_teams
      ADD COLUMN IF NOT EXISTS dynamic_filter JSONB;
    `);

    await client.query(`
      ALTER TABLE doffice_teams
      ADD COLUMN IF NOT EXISTS created_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_teams
      ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_teams
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await client.query(`
      ALTER TABLE doffice_teams
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);

    await client.query(`
      ALTER TABLE doffice_teams
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_teams_org_id
      ON doffice_teams(org_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doffice_teams_org_name_active
      ON doffice_teams(org_id, LOWER(name))
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_team_members (
        id BIGSERIAL PRIMARY KEY,
        team_id VARCHAR(64) NOT NULL REFERENCES doffice_teams(id) ON DELETE CASCADE,
        user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        added_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE doffice_team_members
      ADD COLUMN IF NOT EXISTS added_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_team_members
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await client.query(`
      ALTER TABLE doffice_team_members
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doffice_team_members_active
      ON doffice_team_members(team_id, user_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_team_members_user_id
      ON doffice_team_members(user_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_team_permission_overrides (
        id BIGSERIAL PRIMARY KEY,
        team_id VARCHAR(64) NOT NULL REFERENCES doffice_teams(id) ON DELETE CASCADE,
        module VARCHAR(100) NOT NULL,
        action VARCHAR(100) NOT NULL,
        allow BOOLEAN NOT NULL DEFAULT TRUE,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE doffice_team_permission_overrides
      ADD COLUMN IF NOT EXISTS allow BOOLEAN NOT NULL DEFAULT TRUE;
    `);

    await client.query(`
      ALTER TABLE doffice_team_permission_overrides
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await client.query(`
      ALTER TABLE doffice_team_permission_overrides
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);

    await client.query(`
      ALTER TABLE doffice_team_permission_overrides
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_team_permission_overrides_team_id
      ON doffice_team_permission_overrides(team_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doffice_team_permission_overrides_active
      ON doffice_team_permission_overrides(team_id, module, action)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_delegations (
        id VARCHAR(64) PRIMARY KEY,
        delegator_user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        delegate_user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        start_date TIMESTAMPTZ NOT NULL,
        end_date TIMESTAMPTZ NOT NULL,
        reason TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        scope JSONB NOT NULL DEFAULT '{}'::jsonb,
        revoked_at TIMESTAMPTZ,
        revoked_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT doffice_delegations_date_check CHECK (end_date >= start_date)
      );
    `);

    await client.query(`
      ALTER TABLE doffice_delegations
      ADD COLUMN IF NOT EXISTS reason TEXT;
    `);

    await client.query(`
      ALTER TABLE doffice_delegations
      ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active';
    `);

    await client.query(`
      ALTER TABLE doffice_delegations
      ADD COLUMN IF NOT EXISTS scope JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);

    await client.query(`
      ALTER TABLE doffice_delegations
      ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
    `);

    await client.query(`
      ALTER TABLE doffice_delegations
      ADD COLUMN IF NOT EXISTS revoked_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_delegations
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await client.query(`
      ALTER TABLE doffice_delegations
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);

    await client.query(`
      ALTER TABLE doffice_delegations
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_teams_type_check'
        ) THEN
          ALTER TABLE doffice_teams
          ADD CONSTRAINT doffice_teams_type_check
          CHECK (type IN ('static', 'dynamic'));
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_delegations_status_check'
        ) THEN
          ALTER TABLE doffice_delegations
          ADD CONSTRAINT doffice_delegations_status_check
          CHECK (status IN ('active', 'expired', 'revoked'));
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_delegations_delegator
      ON doffice_delegations(delegator_user_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_delegations_delegate
      ON doffice_delegations(delegate_user_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_user_sessions (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        access_token_hash TEXT NOT NULL,
        refresh_token_hash TEXT NOT NULL,
        device_type VARCHAR(32),
        browser VARCHAR(120),
        os VARCHAR(120),
        ip VARCHAR(64),
        last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);

    await client.query(`
      ALTER TABLE doffice_user_sessions
      ADD COLUMN IF NOT EXISTS device_type VARCHAR(32);
    `);

    await client.query(`
      ALTER TABLE doffice_user_sessions
      ADD COLUMN IF NOT EXISTS browser VARCHAR(120);
    `);

    await client.query(`
      ALTER TABLE doffice_user_sessions
      ADD COLUMN IF NOT EXISTS os VARCHAR(120);
    `);

    await client.query(`
      ALTER TABLE doffice_user_sessions
      ADD COLUMN IF NOT EXISTS ip VARCHAR(64);
    `);

    await client.query(`
      ALTER TABLE doffice_user_sessions
      ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_user_sessions_user_active
      ON doffice_user_sessions(user_id, is_revoked, expires_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_audits (
        id BIGSERIAL PRIMARY KEY,
        user_id VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        action VARCHAR(255) NOT NULL,
        method VARCHAR(16) NOT NULL,
        endpoint TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_org_relationships (
        id VARCHAR(64) PRIMARY KEY,
        source_org_id VARCHAR(64) NOT NULL REFERENCES doffice_organizations(id) ON DELETE CASCADE,
        target_org_id VARCHAR(64) NOT NULL REFERENCES doffice_organizations(id) ON DELETE CASCADE,
        type VARCHAR(64) NOT NULL,
        description TEXT,
        shared_modules TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
        created_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        deleted_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT doffice_org_relationships_source_target_check CHECK (source_org_id <> target_org_id)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_org_relationships_source_org_id
      ON doffice_org_relationships(source_org_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_org_relationships_target_org_id
      ON doffice_org_relationships(target_org_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doffice_org_relationships_active
      ON doffice_org_relationships(source_org_id, target_org_id, type)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_channel_categories (
        id VARCHAR(64) PRIMARY KEY,
        org_id VARCHAR(64) NOT NULL REFERENCES doffice_organizations(id) ON DELETE CASCADE,
        name VARCHAR(160) NOT NULL,
        position INTEGER NOT NULL DEFAULT 1,
        created_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        deleted_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE doffice_channel_categories
      ADD COLUMN IF NOT EXISTS created_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_channel_categories
      ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_channel_categories
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doffice_channel_categories_active_name_scope
      ON doffice_channel_categories(org_id, LOWER(name))
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_channel_categories_org_position
      ON doffice_channel_categories(org_id, position)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_channels (
        id VARCHAR(64) PRIMARY KEY,
        org_id VARCHAR(64) NOT NULL REFERENCES doffice_organizations(id) ON DELETE CASCADE,
        category_id VARCHAR(64) REFERENCES doffice_channel_categories(id) ON DELETE SET NULL,
        name VARCHAR(160) NOT NULL,
        type VARCHAR(32) NOT NULL,
        description TEXT,
        topic TEXT,
        e2ee BOOLEAN NOT NULL DEFAULT FALSE,
        slow_mode_interval INTEGER NOT NULL DEFAULT 0,
        created_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        deleted_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE doffice_channels
      ADD COLUMN IF NOT EXISTS category_id VARCHAR(64) REFERENCES doffice_channel_categories(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_channels
      ADD COLUMN IF NOT EXISTS description TEXT;
    `);

    await client.query(`
      ALTER TABLE doffice_channels
      ADD COLUMN IF NOT EXISTS topic TEXT;
    `);

    await client.query(`
      ALTER TABLE doffice_channels
      ADD COLUMN IF NOT EXISTS e2ee BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await client.query(`
      ALTER TABLE doffice_channels
      ADD COLUMN IF NOT EXISTS slow_mode_interval INTEGER NOT NULL DEFAULT 0;
    `);

    await client.query(`
      ALTER TABLE doffice_channels
      ADD COLUMN IF NOT EXISTS created_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_channels
      ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_channels
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_channels_type_check'
        ) THEN
          ALTER TABLE doffice_channels
          ADD CONSTRAINT doffice_channels_type_check
          CHECK (type IN ('public', 'private', 'announcement', 'cross-org'));
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doffice_channels_active_name_scope
      ON doffice_channels(org_id, LOWER(name))
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_channels_org_id
      ON doffice_channels(org_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_channels_category_id
      ON doffice_channels(category_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_channels_type
      ON doffice_channels(type)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_channel_members (
        channel_id VARCHAR(64) NOT NULL REFERENCES doffice_channels(id) ON DELETE CASCADE,
        user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        role VARCHAR(16) NOT NULL DEFAULT 'member',
        invited_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (channel_id, user_id)
      );
    `);

    await client.query(`
      ALTER TABLE doffice_channel_members
      ADD COLUMN IF NOT EXISTS invited_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_channel_members
      ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);

    await client.query(`
      ALTER TABLE doffice_channel_members
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await client.query(`
      ALTER TABLE doffice_channel_members
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_channel_members_role_check'
        ) THEN
          ALTER TABLE doffice_channel_members
          ADD CONSTRAINT doffice_channel_members_role_check
          CHECK (role IN ('admin', 'moderator', 'member'));
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_channel_members_channel_role
      ON doffice_channel_members(channel_id, role)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_channel_members_user_id
      ON doffice_channel_members(user_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_conversations (
        id VARCHAR(64) PRIMARY KEY,
        type VARCHAR(16) NOT NULL,
        name VARCHAR(255),
        created_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        e2ee BOOLEAN NOT NULL DEFAULT FALSE,
        disappearing_timer INTEGER NOT NULL DEFAULT 0,
        dm_key TEXT,
        deleted_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE doffice_conversations
      ADD COLUMN IF NOT EXISTS created_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_conversations
      ADD COLUMN IF NOT EXISTS e2ee BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await client.query(`
      ALTER TABLE doffice_conversations
      ADD COLUMN IF NOT EXISTS disappearing_timer INTEGER NOT NULL DEFAULT 0;
    `);

    await client.query(`
      ALTER TABLE doffice_conversations
      ADD COLUMN IF NOT EXISTS dm_key TEXT;
    `);

    await client.query(`
      ALTER TABLE doffice_conversations
      ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_conversations
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_conversations_type_check'
        ) THEN
          ALTER TABLE doffice_conversations
          ADD CONSTRAINT doffice_conversations_type_check
          CHECK (type IN ('dm', 'group'));
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doffice_conversations_active_dm_key
      ON doffice_conversations(dm_key)
      WHERE type = 'dm' AND deleted_at IS NULL AND dm_key IS NOT NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_conversations_created_by
      ON doffice_conversations(created_by)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_conversation_participants (
        conversation_id VARCHAR(64) NOT NULL REFERENCES doffice_conversations(id) ON DELETE CASCADE,
        user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        role VARCHAR(16) NOT NULL DEFAULT 'member',
        added_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (conversation_id, user_id)
      );
    `);

    await client.query(`
      ALTER TABLE doffice_conversation_participants
      ADD COLUMN IF NOT EXISTS added_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_conversation_participants
      ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);

    await client.query(`
      ALTER TABLE doffice_conversation_participants
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await client.query(`
      ALTER TABLE doffice_conversation_participants
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_conversation_participants_role_check'
        ) THEN
          ALTER TABLE doffice_conversation_participants
          ADD CONSTRAINT doffice_conversation_participants_role_check
          CHECK (role IN ('admin', 'member'));
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_conversation_participants_user_id
      ON doffice_conversation_participants(user_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_conversation_participants_conversation_role
      ON doffice_conversation_participants(conversation_id, role)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_messages (
        id VARCHAR(64) PRIMARY KEY,
        body TEXT NOT NULL,
        format VARCHAR(24) NOT NULL DEFAULT 'plaintext',
        message_type VARCHAR(24) NOT NULL DEFAULT 'regular',
        sender_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE RESTRICT,
        target_type VARCHAR(24) NOT NULL,
        channel_id VARCHAR(64) REFERENCES doffice_channels(id) ON DELETE CASCADE,
        conversation_id VARCHAR(64) REFERENCES doffice_conversations(id) ON DELETE CASCADE,
        thread_parent_id VARCHAR(64) REFERENCES doffice_messages(id) ON DELETE SET NULL,
        reply_to_message_id VARCHAR(64) REFERENCES doffice_messages(id) ON DELETE SET NULL,
        attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
        mentions TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
        encryption JSONB,
        poll_id VARCHAR(64),
        is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
        pinned_at TIMESTAMPTZ,
        pinned_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        edited BOOLEAN NOT NULL DEFAULT FALSE,
        edited_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        deleted_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE doffice_messages
      ADD COLUMN IF NOT EXISTS format VARCHAR(24) NOT NULL DEFAULT 'plaintext';
    `);

    await client.query(`
      ALTER TABLE doffice_messages
      ADD COLUMN IF NOT EXISTS message_type VARCHAR(24) NOT NULL DEFAULT 'regular';
    `);

    await client.query(`
      ALTER TABLE doffice_messages
      ADD COLUMN IF NOT EXISTS channel_id VARCHAR(64) REFERENCES doffice_channels(id) ON DELETE CASCADE;
    `);

    await client.query(`
      ALTER TABLE doffice_messages
      ADD COLUMN IF NOT EXISTS conversation_id VARCHAR(64) REFERENCES doffice_conversations(id) ON DELETE CASCADE;
    `);

    await client.query(`
      ALTER TABLE doffice_messages
      ADD COLUMN IF NOT EXISTS thread_parent_id VARCHAR(64) REFERENCES doffice_messages(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_messages
      ADD COLUMN IF NOT EXISTS reply_to_message_id VARCHAR(64) REFERENCES doffice_messages(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_messages
      ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);

    await client.query(`
      ALTER TABLE doffice_messages
      ADD COLUMN IF NOT EXISTS mentions TEXT[] NOT NULL DEFAULT ARRAY[]::text[];
    `);

    await client.query(`
      ALTER TABLE doffice_messages
      ADD COLUMN IF NOT EXISTS encryption JSONB;
    `);

    await client.query(`
      ALTER TABLE doffice_messages
      ADD COLUMN IF NOT EXISTS client_msg_id VARCHAR(128);
    `);

    await client.query(`
      ALTER TABLE doffice_messages
      ADD COLUMN IF NOT EXISTS poll_id VARCHAR(64);
    `);

    await client.query(`
      ALTER TABLE doffice_messages
      ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await client.query(`
      ALTER TABLE doffice_messages
      ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
    `);

    await client.query(`
      ALTER TABLE doffice_messages
      ADD COLUMN IF NOT EXISTS pinned_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_messages
      ADD COLUMN IF NOT EXISTS edited BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await client.query(`
      ALTER TABLE doffice_messages
      ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
    `);

    await client.query(`
      ALTER TABLE doffice_messages
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
    `);

    await client.query(`
      ALTER TABLE doffice_messages
      ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL;
    `);

    await client.query(`
      ALTER TABLE doffice_messages
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_messages_target_type_check'
        ) THEN
          ALTER TABLE doffice_messages
          ADD CONSTRAINT doffice_messages_target_type_check
          CHECK (target_type IN ('channel', 'conversation'));
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_messages_format_check'
        ) THEN
          ALTER TABLE doffice_messages
          ADD CONSTRAINT doffice_messages_format_check
          CHECK (format IN ('plaintext', 'markdown', 'encrypted'));
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_messages_message_type_check'
        ) THEN
          ALTER TABLE doffice_messages
          ADD CONSTRAINT doffice_messages_message_type_check
          CHECK (message_type IN ('regular', 'poll'));
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_messages_single_target_check'
        ) THEN
          ALTER TABLE doffice_messages
          ADD CONSTRAINT doffice_messages_single_target_check
          CHECK (
            (target_type = 'channel' AND channel_id IS NOT NULL AND conversation_id IS NULL)
            OR (target_type = 'conversation' AND conversation_id IS NOT NULL AND channel_id IS NULL)
          );
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_messages_channel_created_at
      ON doffice_messages(channel_id, created_at DESC, id DESC)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_messages_conversation_created_at
      ON doffice_messages(conversation_id, created_at DESC, id DESC)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_messages_thread_parent_id
      ON doffice_messages(thread_parent_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_messages_sender_id
      ON doffice_messages(sender_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doffice_messages_sender_client_msg_id
      ON doffice_messages(sender_id, client_msg_id)
      WHERE deleted_at IS NULL
        AND client_msg_id IS NOT NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_messages_body_fts
      ON doffice_messages
      USING GIN (to_tsvector('simple', COALESCE(body, '')))
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_messages_pinned
      ON doffice_messages(channel_id, is_pinned, pinned_at DESC)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_message_edits (
        id BIGSERIAL PRIMARY KEY,
        message_id VARCHAR(64) NOT NULL REFERENCES doffice_messages(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_message_edits_message_id
      ON doffice_message_edits(message_id, edited_at ASC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_message_reactions (
        message_id VARCHAR(64) NOT NULL REFERENCES doffice_messages(id) ON DELETE CASCADE,
        user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        emoji VARCHAR(64) NOT NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (message_id, user_id, emoji)
      );
    `);

    await client.query(`
      ALTER TABLE doffice_message_reactions
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_message_reactions_message_id
      ON doffice_message_reactions(message_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_user_bookmarks (
        user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        message_id VARCHAR(64) NOT NULL REFERENCES doffice_messages(id) ON DELETE CASCADE,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, message_id)
      );
    `);

    await client.query(`
      ALTER TABLE doffice_user_bookmarks
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_user_bookmarks_user_id
      ON doffice_user_bookmarks(user_id, created_at DESC)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_polls (
        id VARCHAR(64) PRIMARY KEY,
        channel_id VARCHAR(64) NOT NULL REFERENCES doffice_channels(id) ON DELETE CASCADE,
        message_id VARCHAR(64) NOT NULL REFERENCES doffice_messages(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        options JSONB NOT NULL,
        multiple_choice BOOLEAN NOT NULL DEFAULT FALSE,
        anonymous BOOLEAN NOT NULL DEFAULT FALSE,
        expires_at TIMESTAMPTZ,
        created_by VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE RESTRICT,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE doffice_polls
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doffice_polls_message_id
      ON doffice_polls(message_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_polls_channel_id
      ON doffice_polls(channel_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_poll_votes (
        poll_id VARCHAR(64) NOT NULL REFERENCES doffice_polls(id) ON DELETE CASCADE,
        user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        option_index INTEGER NOT NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (poll_id, user_id, option_index)
      );
    `);

    await client.query(`
      ALTER TABLE doffice_poll_votes
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_poll_votes_poll_id
      ON doffice_poll_votes(poll_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(
      `INSERT INTO doffice_roles (id, name, description, type, is_system)
       VALUES ($1, $2, $3, 'system', TRUE)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             description = EXCLUDED.description,
             type = 'system',
             is_system = TRUE,
             updated_at = NOW()`,
      ["role_super_admin", "Super Admin", "Global administrator role"]
    );

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_messages_expires_at
      ON doffice_messages(expires_at)
      WHERE deleted_at IS NULL AND expires_at IS NOT NULL;
    `);

    await client.query(
      `INSERT INTO doffice_roles (id, name, description, type, is_system)
       VALUES ($1, $2, $3, 'system', TRUE)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             description = EXCLUDED.description,
             type = 'system',
             is_system = TRUE,
             updated_at = NOW()`,
      ["role_org_user", "Organization User", "Default organization user role"]
    );

    await client.query(
      `INSERT INTO doffice_roles (id, name, description, type, is_system)
       VALUES ($1, $2, $3, 'system', TRUE)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             description = EXCLUDED.description,
             type = 'system',
             is_system = TRUE,
             updated_at = NOW()`,
      ["role_org_admin", "Organization Admin", "Organization administrator role"]
    );

    await client.query(
      `INSERT INTO doffice_roles (id, name, description, type, is_system)
       VALUES ($1, $2, $3, 'system', TRUE)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             description = EXCLUDED.description,
             type = 'system',
             is_system = TRUE,
             updated_at = NOW()`,
      ["role_manager", "Manager", "Manager role"]
    );

    await client.query(
      `INSERT INTO doffice_roles (id, name, description, type, is_system)
       VALUES ($1, $2, $3, 'system', TRUE)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             description = EXCLUDED.description,
             type = 'system',
             is_system = TRUE,
             updated_at = NOW()`,
      ["role_employee", "Employee", "Employee role"]
    );

    await client.query(`
      UPDATE doffice_roles
      SET type = 'system', is_system = TRUE, updated_at = NOW()
      WHERE id IN ('role_super_admin', 'role_org_admin', 'role_org_user', 'role_manager', 'role_employee');
    `);

    await client.query(`
      INSERT INTO doffice_role_permissions (role_id, module, action, allow)
      SELECT seed.role_id, seed.module, seed.action, seed.allow
      FROM (
        VALUES
          ('role_super_admin', 'organizations', '*', TRUE),
          ('role_super_admin', 'users', '*', TRUE),
          ('role_super_admin', 'messaging', '*', TRUE),
          ('role_super_admin', 'tasks', '*', TRUE),
          ('role_org_admin', 'organizations', 'read', TRUE),
          ('role_org_admin', 'organizations', 'update', TRUE),
          ('role_org_admin', 'users', '*', TRUE),
          ('role_org_admin', 'messaging', '*', TRUE),
          ('role_org_admin', 'tasks', '*', TRUE),
          ('role_manager', 'organizations', 'read', TRUE),
          ('role_manager', 'users', 'read', TRUE),
          ('role_manager', 'users', 'update', TRUE),
          ('role_manager', 'tasks', '*', TRUE),
          ('role_manager', 'messaging', 'create_channel', TRUE),
          ('role_employee', 'organizations', 'read', TRUE),
          ('role_employee', 'users', 'read', TRUE),
          ('role_employee', 'messaging', 'send_message', TRUE),
          ('role_employee', 'tasks', 'create_task', TRUE),
          ('role_org_user', 'organizations', 'read', TRUE),
          ('role_org_user', 'users', 'read', TRUE),
          ('role_org_user', 'messaging', 'send_message', TRUE),
          ('role_org_user', 'tasks', 'create_task', TRUE)
      ) AS seed(role_id, module, action, allow)
      WHERE NOT EXISTS (
        SELECT 1
        FROM doffice_role_permissions rp
        WHERE rp.role_id = seed.role_id
          AND rp.module = seed.module
          AND rp.action = seed.action
          AND rp.deleted_at IS NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_message_reports (
        id VARCHAR(64) PRIMARY KEY,
        org_id VARCHAR(64) NOT NULL REFERENCES doffice_organizations(id) ON DELETE CASCADE,
        message_id VARCHAR(64) NOT NULL REFERENCES doffice_messages(id) ON DELETE CASCADE,
        reported_by VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        reason VARCHAR(32) NOT NULL,
        details TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        action VARCHAR(32),
        notes TEXT,
        resolved_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        resolved_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doffice_message_reports_active_unique
      ON doffice_message_reports(message_id, reported_by)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_message_reports_org_status
      ON doffice_message_reports(org_id, status, created_at DESC)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_message_reports_message
      ON doffice_message_reports(message_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_uploaded_files (
        id VARCHAR(64) PRIMARY KEY,
        org_id VARCHAR(64) NOT NULL REFERENCES doffice_organizations(id) ON DELETE CASCADE,
        uploaded_by VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        context VARCHAR(32) NOT NULL,
        context_id VARCHAR(64),
        filename VARCHAR(255) NOT NULL,
        mime_type VARCHAR(255) NOT NULL,
        size BIGINT NOT NULL,
        storage_path TEXT NOT NULL,
        deleted_by VARCHAR(64) REFERENCES doffice_users(id) ON DELETE SET NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_uploaded_files_org
      ON doffice_uploaded_files(org_id, created_at DESC)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_uploaded_files_uploader
      ON doffice_uploaded_files(uploaded_by)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_user_devices (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        name VARCHAR(255),
        session_id VARCHAR(64),
        identity_key_fingerprint VARCHAR(255),
        last_seen_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doffice_user_devices_active
      ON doffice_user_devices(user_id, id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_user_devices_user
      ON doffice_user_devices(user_id, updated_at DESC)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_user_prekeys (
        user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        device_id VARCHAR(64) NOT NULL REFERENCES doffice_user_devices(id) ON DELETE CASCADE,
        identity_key TEXT NOT NULL,
        signed_pre_key JSONB NOT NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, device_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_user_one_time_prekeys (
        id BIGSERIAL PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        device_id VARCHAR(64) NOT NULL REFERENCES doffice_user_devices(id) ON DELETE CASCADE,
        key_id INTEGER NOT NULL,
        public_key TEXT NOT NULL,
        consumed_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doffice_one_time_prekeys_active
      ON doffice_user_one_time_prekeys(user_id, device_id, key_id)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_one_time_prekeys_available
      ON doffice_user_one_time_prekeys(user_id, device_id, created_at ASC)
      WHERE deleted_at IS NULL AND consumed_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_notifications (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        type VARCHAR(32) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT,
        link TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        read BOOLEAN NOT NULL DEFAULT FALSE,
        read_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_notifications_user_created
      ON doffice_notifications(user_id, created_at DESC)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_notifications_user_unread
      ON doffice_notifications(user_id, read)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_notification_preferences (
        user_id VARCHAR(64) PRIMARY KEY REFERENCES doffice_users(id) ON DELETE CASCADE,
        preferences JSONB NOT NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_user_presence (
        user_id VARCHAR(64) PRIMARY KEY REFERENCES doffice_users(id) ON DELETE CASCADE,
        status VARCHAR(16) NOT NULL DEFAULT 'offline',
        custom_text TEXT,
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_user_presence_status_check'
        ) THEN
          ALTER TABLE doffice_user_presence
          ADD CONSTRAINT doffice_user_presence_status_check
          CHECK (status IN ('online', 'away', 'busy', 'offline'));
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_user_presence_status
      ON doffice_user_presence(status)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_message_reads (
        user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        target_type VARCHAR(24) NOT NULL,
        target_id VARCHAR(64) NOT NULL,
        last_read_message_id VARCHAR(64) REFERENCES doffice_messages(id) ON DELETE SET NULL,
        read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, target_type, target_id)
      );
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_message_reads_target_type_check'
        ) THEN
          ALTER TABLE doffice_message_reads
          ADD CONSTRAINT doffice_message_reads_target_type_check
          CHECK (target_type IN ('channel', 'conversation'));
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_message_reads_target
      ON doffice_message_reads(target_type, target_id, read_at DESC)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_typing_states (
        user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        target_type VARCHAR(24) NOT NULL,
        target_id VARCHAR(64) NOT NULL,
        is_typing BOOLEAN NOT NULL DEFAULT FALSE,
        expires_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, target_type, target_id)
      );
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_typing_states_target_type_check'
        ) THEN
          ALTER TABLE doffice_typing_states
          ADD CONSTRAINT doffice_typing_states_target_type_check
          CHECK (target_type IN ('channel', 'conversation'));
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_typing_states_target
      ON doffice_typing_states(target_type, target_id, updated_at DESC)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_voice_channel_participants (
        id VARCHAR(64) PRIMARY KEY,
        channel_id VARCHAR(64) NOT NULL REFERENCES doffice_channels(id) ON DELETE CASCADE,
        user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        left_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_doffice_voice_channel_participants_active
      ON doffice_voice_channel_participants(channel_id, user_id)
      WHERE deleted_at IS NULL AND left_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_voice_channel_participants_user
      ON doffice_voice_channel_participants(user_id, joined_at DESC)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doffice_rtc_signals (
        id VARCHAR(64) PRIMARY KEY,
        call_id VARCHAR(64) NOT NULL,
        from_user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        target_user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        signal_type VARCHAR(24) NOT NULL,
        payload JSONB NOT NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'doffice_rtc_signals_signal_type_check'
        ) THEN
          ALTER TABLE doffice_rtc_signals
          ADD CONSTRAINT doffice_rtc_signals_signal_type_check
          CHECK (signal_type IN ('offer', 'answer', 'ice-candidate'));
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_rtc_signals_call
      ON doffice_rtc_signals(call_id, created_at DESC)
      WHERE deleted_at IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doffice_rtc_signals_target
      ON doffice_rtc_signals(target_user_id, created_at DESC)
      WHERE deleted_at IS NULL;
    `);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  runMigrations,
};
