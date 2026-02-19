CREATE TABLE IF NOT EXISTS app.ads_ai_notifications (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  module TEXT NOT NULL DEFAULT 'ads',
  integration_key TEXT NOT NULL DEFAULT 'default',
  source TEXT NOT NULL DEFAULT 'ai_daily_observer',
  recommendation_type TEXT NOT NULL DEFAULT 'optimization',
  fingerprint TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  recommendation_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision_note TEXT,
  decided_by_user_id UUID REFERENCES app.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ads_ai_notifications_priority_chk CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT ads_ai_notifications_status_chk CHECK (status IN ('open', 'accepted', 'denied'))
);

CREATE INDEX IF NOT EXISTS ads_ai_notifications_org_status_created_idx
  ON app.ads_ai_notifications (organization_id, module, integration_key, status, created_at DESC);

CREATE INDEX IF NOT EXISTS ads_ai_notifications_org_created_idx
  ON app.ads_ai_notifications (organization_id, module, integration_key, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ads_ai_notifications_open_fingerprint_uk
  ON app.ads_ai_notifications (organization_id, module, integration_key, fingerprint)
  WHERE status = 'open';

CREATE TRIGGER set_updated_at_ads_ai_notifications
BEFORE UPDATE ON app.ads_ai_notifications
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();
