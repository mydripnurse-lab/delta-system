BEGIN;

CREATE TABLE IF NOT EXISTS app.cron_heartbeat (
  job_key TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  last_status TEXT NOT NULL DEFAULT 'running',
  last_started_at TIMESTAMPTZ,
  last_finished_at TIMESTAMPTZ,
  last_duration_ms INTEGER,
  last_error TEXT,
  last_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  run_count BIGINT NOT NULL DEFAULT 0,
  success_count BIGINT NOT NULL DEFAULT 0,
  error_count BIGINT NOT NULL DEFAULT 0,
  unauthorized_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cron_heartbeat_status_ck CHECK (
    last_status IN ('running', 'ok', 'error', 'unauthorized')
  )
);

CREATE INDEX IF NOT EXISTS cron_heartbeat_updated_idx
  ON app.cron_heartbeat (updated_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app' AND p.proname = 'set_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS set_updated_at_cron_heartbeat ON app.cron_heartbeat;
    CREATE TRIGGER set_updated_at_cron_heartbeat
    BEFORE UPDATE ON app.cron_heartbeat
    FOR EACH ROW
    EXECUTE FUNCTION app.set_updated_at();
  END IF;
END $$;

COMMIT;
