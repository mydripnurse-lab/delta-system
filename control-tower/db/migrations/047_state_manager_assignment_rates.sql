-- Delta Control Tower
-- Migration: 047_state_manager_assignment_rates
-- Purpose: Store Market Manager commission rates per state assignment.

BEGIN;

ALTER TABLE app.admin_state_assignments
  ADD COLUMN IF NOT EXISTS manager_commission_rate NUMERIC(7,4) NOT NULL DEFAULT 5.0000;

UPDATE app.admin_state_assignments assignment
   SET manager_commission_rate = profile.manager_commission_rate
  FROM app.admin_access_profiles profile
 WHERE profile.user_id = assignment.manager_user_id;

ALTER TABLE app.admin_state_assignments
  DROP CONSTRAINT IF EXISTS admin_state_assignments_commission_ck;

ALTER TABLE app.admin_state_assignments
  ADD CONSTRAINT admin_state_assignments_commission_ck
  CHECK (manager_commission_rate >= 0 AND manager_commission_rate <= 100);

CREATE OR REPLACE FUNCTION app.sync_state_manager_commission()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  assignment_record RECORD;
  gross_amount NUMERIC(14,2);
BEGIN
  IF NEW.status = 'completed' THEN
    IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
      RETURN NEW;
    END IF;

    SELECT assignment.manager_user_id, assignment.state_code,
           assignment.manager_commission_rate
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
        jsonb_build_object('calculation', 'gross_x_platform_share_x_state_assignment_rate')
      )
      ON CONFLICT (appointment_id) DO UPDATE SET
        manager_user_id = EXCLUDED.manager_user_id,
        state_code = EXCLUDED.state_code,
        service_gross_amount = EXCLUDED.service_gross_amount,
        platform_share_rate = EXCLUDED.platform_share_rate,
        manager_rate_of_platform_share = EXCLUDED.manager_rate_of_platform_share,
        manager_commission_amount = EXCLUDED.manager_commission_amount,
        status = CASE WHEN app.state_manager_commissions.status = 'paid' THEN 'paid' ELSE 'earned' END,
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

COMMIT;
