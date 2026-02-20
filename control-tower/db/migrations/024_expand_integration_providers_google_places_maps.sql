-- Delta Control Tower
-- Migration: 024_expand_integration_providers_google_places_maps
-- Purpose: Allow Google Maps/Places providers for tenant integrations.

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

ALTER TABLE app.organization_integrations
  DROP CONSTRAINT IF EXISTS organization_integrations_provider_ck;

ALTER TABLE app.organization_integrations
  ADD CONSTRAINT organization_integrations_provider_ck CHECK (
    provider IN (
      'ghl',
      'google_search_console',
      'google_analytics',
      'google_ads',
      'google_sheets',
      'google_cloud',
      'google_maps',
      'google_places',
      'bing_webmaster',
      'openai',
      'facebook_ads',
      'tiktok_ads',
      'custom'
    )
  );

COMMIT;
