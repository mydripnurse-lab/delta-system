BEGIN;

ALTER TABLE app.staff_form_configs
  ADD COLUMN IF NOT EXISTS calendar_names TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE app.staff_form_configs
  DROP CONSTRAINT IF EXISTS staff_form_configs_calendar_mode_ck;

ALTER TABLE app.staff_form_configs
  ADD CONSTRAINT staff_form_configs_calendar_mode_ck
  CHECK (calendar_mode IN ('all_compatible', 'specific', 'specific_names'));

COMMIT;
