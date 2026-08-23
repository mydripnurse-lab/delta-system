-- Delta Control Tower
-- Migration: 046_state_market_managers
-- Purpose: State-scoped administration and auditable manager commissions.

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

CREATE TABLE IF NOT EXISTS app.admin_access_profiles (
  user_id UUID PRIMARY KEY REFERENCES app.users(id) ON DELETE RESTRICT,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited',
  manager_commission_rate NUMERIC(7,4) NOT NULL DEFAULT 5.0000,
  created_by UUID REFERENCES app.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_access_profiles_role_ck
    CHECK (role IN ('platform_owner', 'state_market_manager')),
  CONSTRAINT admin_access_profiles_status_ck
    CHECK (status IN ('invited', 'active', 'suspended')),
  CONSTRAINT admin_access_profiles_commission_ck
    CHECK (manager_commission_rate >= 0 AND manager_commission_rate <= 100)
);

CREATE TABLE IF NOT EXISTS app.admin_state_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_user_id UUID NOT NULL REFERENCES app.admin_access_profiles(user_id) ON DELETE CASCADE,
  state_code TEXT NOT NULL,
  state_name TEXT NOT NULL,
  assigned_by UUID REFERENCES app.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_state_assignments_state_code_ck
    CHECK (state_code ~ '^[A-Z]{2}$'),
  CONSTRAINT admin_state_assignments_state_uq UNIQUE (state_code),
  CONSTRAINT admin_state_assignments_manager_state_uq UNIQUE (manager_user_id, state_code)
);

CREATE INDEX IF NOT EXISTS admin_state_assignments_manager_idx
  ON app.admin_state_assignments (manager_user_id);

CREATE TABLE IF NOT EXISTS app.state_manager_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL,
  manager_user_id UUID NOT NULL REFERENCES app.admin_access_profiles(user_id) ON DELETE RESTRICT,
  state_code TEXT NOT NULL,
  service_gross_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  platform_share_rate NUMERIC(7,4) NOT NULL DEFAULT 40.0000,
  manager_rate_of_platform_share NUMERIC(7,4) NOT NULL DEFAULT 5.0000,
  manager_commission_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  earned_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT state_manager_commissions_appointment_uq UNIQUE (appointment_id),
  CONSTRAINT state_manager_commissions_state_code_ck CHECK (state_code ~ '^[A-Z]{2}$'),
  CONSTRAINT state_manager_commissions_status_ck
    CHECK (status IN ('pending', 'earned', 'paid', 'reversed')),
  CONSTRAINT state_manager_commissions_amounts_ck
    CHECK (
      service_gross_amount >= 0 AND
      platform_share_rate >= 0 AND platform_share_rate <= 100 AND
      manager_rate_of_platform_share >= 0 AND manager_rate_of_platform_share <= 100 AND
      manager_commission_amount >= 0
    )
);

CREATE INDEX IF NOT EXISTS state_manager_commissions_manager_created_idx
  ON app.state_manager_commissions (manager_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS state_manager_commissions_state_created_idx
  ON app.state_manager_commissions (state_code, created_at DESC);

CREATE OR REPLACE FUNCTION app.sync_state_manager_commission()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  assignment_record RECORD;
  gross_amount NUMERIC(14,2);
BEGIN
  IF NEW.status = 'completed' THEN
    -- A commission is a financial snapshot. Do not recalculate an already
    -- completed appointment when unrelated appointment fields are edited.
    IF TG_OP = 'UPDATE' THEN
      IF OLD.status = 'completed' THEN
        RETURN NEW;
      END IF;
    END IF;

    SELECT assignment.manager_user_id, assignment.state_code,
           profile.manager_commission_rate
      INTO assignment_record
      FROM app.admin_state_assignments assignment
      JOIN app.admin_access_profiles profile
        ON profile.user_id = assignment.manager_user_id
       AND profile.role = 'state_market_manager'
       AND profile.status = 'active'
     WHERE upper(trim(coalesce(NEW.state, ''))) = assignment.state_code
        OR lower(trim(coalesce(NEW.state, ''))) = lower(assignment.state_name)
     LIMIT 1;

    IF assignment_record.manager_user_id IS NOT NULL THEN
      gross_amount := greatest(coalesce(NEW.service_price, 0), 0);
      INSERT INTO app.state_manager_commissions (
        appointment_id, manager_user_id, state_code, service_gross_amount,
        platform_share_rate, manager_rate_of_platform_share,
        manager_commission_amount, status, earned_at, metadata
      ) VALUES (
        NEW.id, assignment_record.manager_user_id, assignment_record.state_code, gross_amount,
        40, assignment_record.manager_commission_rate,
        round(gross_amount * 0.40 * assignment_record.manager_commission_rate / 100, 2),
        'earned', coalesce(NEW.completed_at, now()),
        jsonb_build_object('calculation', 'gross_x_platform_share_x_manager_rate')
      )
      ON CONFLICT (appointment_id) DO UPDATE SET
        manager_user_id = EXCLUDED.manager_user_id,
        state_code = EXCLUDED.state_code,
        service_gross_amount = EXCLUDED.service_gross_amount,
        platform_share_rate = EXCLUDED.platform_share_rate,
        manager_rate_of_platform_share = EXCLUDED.manager_rate_of_platform_share,
        manager_commission_amount = EXCLUDED.manager_commission_amount,
        status = CASE
          WHEN app.state_manager_commissions.status = 'paid' THEN 'paid'
          ELSE 'earned'
        END,
        earned_at = EXCLUDED.earned_at,
        reversed_at = NULL,
        updated_at = now();
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    UPDATE app.state_manager_commissions
       SET status = CASE WHEN status = 'paid' THEN status ELSE 'reversed' END,
           reversed_at = CASE WHEN status = 'paid' THEN reversed_at ELSE now() END,
           updated_at = now()
     WHERE appointment_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_state_manager_commission_trg ON app.appointments;
CREATE TRIGGER appointments_state_manager_commission_trg
AFTER INSERT OR UPDATE
ON app.appointments
FOR EACH ROW EXECUTE FUNCTION app.sync_state_manager_commission();

CREATE TABLE IF NOT EXISTS app.admin_access_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES app.users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES app.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  before_payload JSONB,
  after_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_access_audit_target_created_idx
  ON app.admin_access_audit_log (target_user_id, created_at DESC);

INSERT INTO app.admin_access_profiles (user_id, role, status, manager_commission_rate)
SELECT id, 'platform_owner', 'active', 0
FROM app.users
WHERE lower(email) = 'ac@devasks.com'
ON CONFLICT (user_id) DO UPDATE
SET role = 'platform_owner', status = 'active', updated_at = NOW();

INSERT INTO app.agency_settings (setting_key, payload)
VALUES (
  'market_commission_model_v1',
  '{"platformShareRate":40,"managerRateOfPlatformShare":5,"affiliatePartnerRateOfGross":3}'::jsonb
)
ON CONFLICT (setting_key) DO NOTHING;

-- The platform deposit is the 40% platform share for every active service.
UPDATE app.services
   SET deposit_type = 'percentage', deposit_value = 40, updated_at = NOW()
 WHERE is_active = TRUE
   AND (deposit_type <> 'percentage' OR deposit_value <> 40);

-- Affiliate Partners receive 3% of gross appointment value by default.
UPDATE app.staff_form_configs
   SET affiliate_commission_rate = 3
 WHERE affiliate_commission_rate IS DISTINCT FROM 3;

-- Materialize historical completed appointments that already have an assigned manager.
INSERT INTO app.state_manager_commissions (
  appointment_id, manager_user_id, state_code, service_gross_amount,
  platform_share_rate, manager_rate_of_platform_share,
  manager_commission_amount, status, earned_at, metadata
)
SELECT appointment.id, assignment.manager_user_id, assignment.state_code,
       greatest(coalesce(appointment.service_price, 0), 0), 40,
       profile.manager_commission_rate,
       round(greatest(coalesce(appointment.service_price, 0), 0) * 0.40 * profile.manager_commission_rate / 100, 2),
       'earned', coalesce(appointment.completed_at, appointment.updated_at, now()),
       jsonb_build_object('backfilled', true, 'calculation', 'gross_x_platform_share_x_manager_rate')
  FROM app.appointments appointment
  JOIN app.admin_state_assignments assignment
    ON upper(trim(coalesce(appointment.state, ''))) = assignment.state_code
    OR lower(trim(coalesce(appointment.state, ''))) = lower(assignment.state_name)
  JOIN app.admin_access_profiles profile
    ON profile.user_id = assignment.manager_user_id
   AND profile.role = 'state_market_manager'
 WHERE appointment.status = 'completed'
ON CONFLICT (appointment_id) DO NOTHING;

COMMIT;
