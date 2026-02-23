BEGIN;

CREATE TABLE IF NOT EXISTS app.domain_bot_failed_runs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  loc_id TEXT NOT NULL,
  row_name TEXT,
  domain_url TEXT,
  activation_url TEXT,
  failed_step TEXT,
  error_message TEXT NOT NULL,
  run_source TEXT NOT NULL DEFAULT 'local_extension',
  logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  fail_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT domain_bot_failed_runs_kind_ck CHECK (kind IN ('counties', 'cities')),
  CONSTRAINT domain_bot_failed_runs_status_ck CHECK (status IN ('open', 'resolved', 'ignored'))
);

CREATE INDEX IF NOT EXISTS domain_bot_failed_runs_tenant_status_last_seen_idx
  ON app.domain_bot_failed_runs (tenant_id, status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS domain_bot_failed_runs_tenant_kind_loc_idx
  ON app.domain_bot_failed_runs (tenant_id, kind, loc_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app' AND p.proname = 'set_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS set_updated_at_domain_bot_failed_runs ON app.domain_bot_failed_runs;
    CREATE TRIGGER set_updated_at_domain_bot_failed_runs
    BEFORE UPDATE ON app.domain_bot_failed_runs
    FOR EACH ROW
    EXECUTE FUNCTION app.set_updated_at();
  END IF;
END $$;

COMMIT;
