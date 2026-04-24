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
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
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
      CREATE TABLE IF NOT EXISTS doffice_user_roles (
        user_id VARCHAR(64) NOT NULL REFERENCES doffice_users(id) ON DELETE CASCADE,
        role_id VARCHAR(64) NOT NULL REFERENCES doffice_roles(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, role_id)
      );
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

    await client.query(
      `INSERT INTO doffice_roles (id, name, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO NOTHING`,
      ["role_super_admin", "Super Admin", "Global administrator role"]
    );

    await client.query(
      `INSERT INTO doffice_roles (id, name, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO NOTHING`,
      ["role_org_user", "Organization User", "Default organization user role"]
    );

    await client.query(
      `INSERT INTO doffice_roles (id, name, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO NOTHING`,
      ["role_org_admin", "Organization Admin", "Organization administrator role"]
    );

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
