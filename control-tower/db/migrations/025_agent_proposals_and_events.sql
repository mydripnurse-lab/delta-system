-- Delta Control Tower
-- Migration: 025_agent_proposals_and_events
-- Purpose: Add agent proposals queue + approval/execution audit trail for dashboard agents.

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

CREATE TABLE IF NOT EXISTS app.agent_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  agent_id TEXT NOT NULL,
  dashboard_id TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'P2',
  risk_level TEXT NOT NULL DEFAULT 'medium',
  expected_impact TEXT NOT NULL DEFAULT 'medium',
  summary TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  policy_auto_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approval_required BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejected_by TEXT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  execution_started_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  execution_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_proposals_action_type_ck CHECK (
    action_type IN (
      'publish_content',
      'send_leads_ghl',
      'publish_ads',
      'optimize_ads'
    )
  ),
  CONSTRAINT agent_proposals_status_ck CHECK (
    status IN ('proposed', 'approved', 'rejected', 'executed', 'failed')
  ),
  CONSTRAINT agent_proposals_priority_ck CHECK (
    priority IN ('P1', 'P2', 'P3')
  ),
  CONSTRAINT agent_proposals_risk_level_ck CHECK (
    risk_level IN ('low', 'medium', 'high')
  ),
  CONSTRAINT agent_proposals_expected_impact_ck CHECK (
    expected_impact IN ('low', 'medium', 'high')
  )
);

CREATE TABLE IF NOT EXISTS app.agent_proposal_events (
  id BIGSERIAL PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES app.agent_proposals(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT,
  before_payload JSONB,
  after_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_proposal_events_event_type_ck CHECK (
    event_type IN (
      'proposed',
      'approved',
      'rejected',
      'execute_started',
      'executed',
      'failed',
      'edited'
    )
  )
);

CREATE INDEX IF NOT EXISTS agent_proposals_org_status_created_idx
  ON app.agent_proposals (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_proposals_action_status_idx
  ON app.agent_proposals (action_type, status);

CREATE INDEX IF NOT EXISTS agent_proposals_org_dashboard_created_idx
  ON app.agent_proposals (organization_id, dashboard_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_proposal_events_proposal_created_idx
  ON app.agent_proposal_events (proposal_id, created_at DESC);

CREATE TRIGGER set_updated_at_agent_proposals
BEFORE UPDATE ON app.agent_proposals
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

COMMIT;
