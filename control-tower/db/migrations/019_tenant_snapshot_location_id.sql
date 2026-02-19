ALTER TABLE app.organization_settings
  ADD COLUMN IF NOT EXISTS snapshot_location_id TEXT;

