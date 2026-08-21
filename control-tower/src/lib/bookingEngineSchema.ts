import { getDbPool } from "@/lib/db";
import { ensureServiceCatalogSchema } from "@/lib/myDripNurseServiceCatalog";
import { ensureStaffSchema } from "@/lib/publicStaffProvisioning";

let bookingEngineSchemaReady: Promise<void> | null = null;

export async function ensureBookingEngineSchema() {
  if (bookingEngineSchemaReady) return bookingEngineSchemaReady;
  bookingEngineSchemaReady = (async () => {
    await Promise.all([ensureStaffSchema(), ensureServiceCatalogSchema()]);
    await getDbPool().query(`
      create table if not exists app.partner_service_assignments (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references app.organizations(id) on delete cascade,
        partner_profile_id uuid not null references app.partner_profiles(id) on delete cascade,
        service_id uuid not null references app.services(id) on delete cascade,
        status text not null default 'active',
        price_override numeric(12,2),
        priority_weight numeric(8,4) not null default 1,
        activated_at timestamptz,
        deactivated_at timestamptz,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (partner_profile_id, service_id),
        check (status in ('active', 'paused', 'revoked')),
        check (price_override is null or price_override >= 0),
        check (priority_weight > 0)
      );
      create index if not exists partner_service_assignments_service_status_idx
        on app.partner_service_assignments (organization_id, service_id, status, partner_profile_id);
      do $$
      begin
        if not exists (
          select 1
            from pg_constraint
           where conname = 'partner_service_assignments_status_check'
             and pg_get_constraintdef(oid) ilike '%out_of_stock%'
        ) then
          alter table app.partner_service_assignments
            drop constraint if exists partner_service_assignments_status_check;
          alter table app.partner_service_assignments
            add constraint partner_service_assignments_status_check
            check (status in ('active', 'paused', 'out_of_stock', 'revoked'));
        end if;
      end $$;

      create table if not exists app.partner_coverage_areas (
        id uuid primary key default gen_random_uuid(),
        assignment_id uuid not null references app.partner_service_assignments(id) on delete cascade,
        state text not null,
        county text not null,
        city text,
        postal_codes text[] not null default array[]::text[],
        status text not null default 'active',
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (status in ('active', 'paused'))
      );
      create unique index if not exists partner_coverage_areas_scope_uq
        on app.partner_coverage_areas (
          assignment_id,
          lower(state),
          lower(county),
          lower(coalesce(city, ''))
        );
      create index if not exists partner_coverage_areas_lookup_idx
        on app.partner_coverage_areas (lower(state), lower(county), lower(coalesce(city, '')), status);
      alter table app.partner_coverage_areas add column if not exists state_fips text;
      alter table app.partner_coverage_areas add column if not exists county_fips text;
      alter table app.partner_coverage_areas add column if not exists county_geoid text;
      alter table app.partner_coverage_areas add column if not exists place_geoid text;
      alter table app.partner_coverage_areas add column if not exists geography_source text;
      alter table app.partner_coverage_areas add column if not exists geography_verified_at timestamptz;
      create index if not exists partner_coverage_areas_geoid_idx
        on app.partner_coverage_areas (county_geoid, status, assignment_id)
        where county_geoid is not null;

      create table if not exists app.partner_availability_rules (
        id uuid primary key default gen_random_uuid(),
        partner_profile_id uuid not null references app.partner_profiles(id) on delete cascade,
        service_id uuid references app.services(id) on delete cascade,
        timezone text not null default 'America/New_York',
        day_of_week smallint not null,
        start_time time not null,
        end_time time not null,
        effective_from date,
        effective_until date,
        is_active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (day_of_week between 0 and 6),
        check (start_time < end_time),
        check (effective_until is null or effective_from is null or effective_until >= effective_from)
      );
      create index if not exists partner_availability_rules_lookup_idx
        on app.partner_availability_rules (partner_profile_id, service_id, day_of_week, is_active);

      create table if not exists app.partner_availability_exceptions (
        id uuid primary key default gen_random_uuid(),
        partner_profile_id uuid not null references app.partner_profiles(id) on delete cascade,
        service_id uuid references app.services(id) on delete cascade,
        starts_at timestamptz not null,
        ends_at timestamptz not null,
        kind text not null default 'unavailable',
        reason text not null default '',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (ends_at > starts_at),
        check (kind in ('available', 'unavailable'))
      );
      create index if not exists partner_availability_exceptions_lookup_idx
        on app.partner_availability_exceptions (partner_profile_id, starts_at, ends_at);

      create table if not exists app.booking_customers (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references app.organizations(id) on delete cascade,
        full_name text not null,
        email text not null default '',
        phone text not null default '',
        normalized_email text not null default '',
        normalized_phone text not null default '',
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (normalized_email <> '' or normalized_phone <> '')
      );
      create unique index if not exists booking_customers_email_uq
        on app.booking_customers (organization_id, normalized_email) where normalized_email <> '';
      create unique index if not exists booking_customers_phone_uq
        on app.booking_customers (organization_id, normalized_phone) where normalized_phone <> '';

      create table if not exists app.appointments (
        id uuid primary key default gen_random_uuid(),
        public_reference text not null unique,
        organization_id uuid not null references app.organizations(id) on delete cascade,
        service_id uuid not null references app.services(id) on delete restrict,
        service_calendar_id uuid not null references app.service_calendars(id) on delete restrict,
        partner_profile_id uuid references app.partner_profiles(id) on delete set null,
        customer_id uuid not null references app.booking_customers(id) on delete restrict,
        status text not null default 'payment_pending',
        selection_mode text not null default 'balanced',
        starts_at timestamptz not null,
        ends_at timestamptz not null,
        timezone text not null,
        address_line_1 text not null,
        address_line_2 text not null default '',
        city text not null,
        county text not null,
        state text not null,
        postal_code text not null,
        country_code text not null default 'US',
        source_url text not null default '',
        source_city text not null default '',
        source_county text not null default '',
        source_state text not null default '',
        service_price numeric(12,2) not null,
        deposit_type text not null,
        deposit_value numeric(12,2) not null,
        deposit_amount numeric(12,2) not null,
        currency text not null default 'USD',
        cancellation_reason text not null default '',
        partner_decline_reason text not null default '',
        metadata jsonb not null default '{}'::jsonb,
        hold_expires_at timestamptz,
        confirmed_at timestamptz,
        completed_at timestamptz,
        cancelled_at timestamptz,
        declined_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (status in (
          'payment_pending', 'confirmed', 'partner_acknowledged', 'in_progress',
          'completed', 'cancelled', 'refunded', 'failed', 'partner_declined'
        )),
        check (selection_mode in ('returning_partner', 'customer_selected', 'balanced', 'admin_assigned')),
        check (ends_at > starts_at),
        check (service_price >= 0),
        check (deposit_type in ('percentage', 'fixed')),
        check (deposit_value >= 0),
        check (deposit_amount >= 0),
        check (currency ~ '^[A-Z]{3}$'),
        check (country_code ~ '^[A-Z]{2}$')
      );
      alter table app.appointments add column if not exists hold_expires_at timestamptz;
      alter table app.appointments add column if not exists partner_decline_reason text not null default '';
      alter table app.appointments add column if not exists declined_at timestamptz;
      alter table app.appointments add column if not exists state_fips text;
      alter table app.appointments add column if not exists county_fips text;
      alter table app.appointments add column if not exists county_geoid text;
      alter table app.appointments add column if not exists place_name text;
      alter table app.appointments add column if not exists place_geoid text;
      alter table app.appointments add column if not exists latitude numeric(10,7);
      alter table app.appointments add column if not exists longitude numeric(10,7);
      alter table app.appointments add column if not exists geography_source text;
      alter table app.appointments add column if not exists geography_verified_at timestamptz;
      alter table app.appointments drop constraint if exists appointments_status_check;
      alter table app.appointments add constraint appointments_status_check check (status in (
        'payment_pending', 'confirmed', 'partner_acknowledged', 'in_progress',
        'completed', 'cancelled', 'refunded', 'failed', 'partner_declined'
      ));
      create index if not exists appointments_calendar_time_idx
        on app.appointments (service_calendar_id, starts_at, status);
      create index if not exists appointments_partner_time_idx
        on app.appointments (partner_profile_id, starts_at, status) where partner_profile_id is not null;
      create index if not exists appointments_customer_history_idx
        on app.appointments (customer_id, service_id, completed_at desc) where status = 'completed';
      create unique index if not exists appointments_partner_start_active_uq
        on app.appointments (partner_profile_id, starts_at)
        where partner_profile_id is not null
          and status in ('payment_pending', 'confirmed', 'partner_acknowledged', 'in_progress');

      create table if not exists app.partner_affiliate_commissions (
        id uuid primary key default gen_random_uuid(),
        referrer_profile_id uuid not null references app.partner_profiles(id) on delete cascade,
        referred_profile_id uuid not null references app.partner_profiles(id) on delete cascade,
        appointment_id uuid not null unique references app.appointments(id) on delete cascade,
        service_id uuid references app.services(id) on delete set null,
        amount numeric(12,2) not null,
        rate numeric(5,2) not null,
        currency text not null default 'USD',
        status text not null default 'pending',
        paid_at timestamptz,
        payout_reference text,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (amount >= 0),
        check (rate >= 0 and rate <= 100),
        check (status in ('pending', 'approved', 'payable', 'paid', 'void'))
      );
      create index if not exists partner_affiliate_commissions_referrer_idx
        on app.partner_affiliate_commissions (referrer_profile_id, status, created_at desc);
      create index if not exists partner_affiliate_commissions_referred_idx
        on app.partner_affiliate_commissions (referred_profile_id, created_at desc);

      create table if not exists app.appointment_payments (
        id uuid primary key default gen_random_uuid(),
        appointment_id uuid not null unique references app.appointments(id) on delete cascade,
        provider text not null default 'stripe',
        status text not null default 'pending',
        amount numeric(12,2) not null,
        currency text not null default 'USD',
        checkout_session_id text,
        payment_intent_id text,
        charge_id text,
        refund_id text,
        refunded_amount numeric(12,2) not null default 0,
        failure_code text not null default '',
        failure_message text not null default '',
        metadata jsonb not null default '{}'::jsonb,
        paid_at timestamptz,
        refunded_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (status in ('pending', 'processing', 'paid', 'failed', 'refunded', 'partially_refunded', 'cancelled')),
        check (amount >= 0),
        check (currency ~ '^[A-Z]{3}$')
      );
      alter table app.appointment_payments add column if not exists refunded_amount numeric(12,2) not null default 0;
      create unique index if not exists appointment_payments_checkout_session_uq
        on app.appointment_payments (checkout_session_id) where checkout_session_id is not null;
      create unique index if not exists appointment_payments_intent_uq
        on app.appointment_payments (payment_intent_id) where payment_intent_id is not null;

      create table if not exists app.appointment_refunds (
        id uuid primary key default gen_random_uuid(),
        appointment_payment_id uuid not null references app.appointment_payments(id) on delete cascade,
        stripe_refund_id text not null unique,
        amount numeric(12,2) not null,
        currency text not null default 'USD',
        status text not null default 'pending',
        reason text not null default '',
        failure_reason text not null default '',
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        succeeded_at timestamptz,
        failed_at timestamptz,
        check (amount > 0),
        check (currency ~ '^[A-Z]{3}$'),
        check (status in ('pending', 'requires_action', 'succeeded', 'failed', 'canceled'))
      );
      create index if not exists appointment_refunds_payment_idx
        on app.appointment_refunds (appointment_payment_id, status, created_at desc);

      create table if not exists app.appointment_refund_requests (
        id uuid primary key default gen_random_uuid(),
        public_reference text not null unique,
        appointment_id uuid not null references app.appointments(id) on delete cascade,
        client_account_id uuid,
        requester_name text not null default '',
        requester_email text not null default '',
        requester_phone text not null default '',
        reason_code text not null,
        details text not null default '',
        status text not null default 'submitted',
        policy_assessment text not null default 'manual_review',
        policy_version text not null,
        policy_snapshot jsonb not null default '{}'::jsonb,
        source_url text not null default '',
        reviewed_by text not null default '',
        reviewed_at timestamptz,
        resolution_note text not null default '',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (reason_code in (
          'cancel_24_hours', 'provider_unavailable', 'provider_no_show',
          'duplicate_charge', 'incorrect_charge', 'exceptional_circumstance', 'other'
        )),
        check (status in ('submitted', 'under_review', 'approved', 'declined', 'completed', 'cancelled')),
        check (policy_assessment in (
          'likely_eligible', 'manual_review', 'outside_standard_window',
          'already_refunded', 'no_payment', 'not_eligible'
        ))
      );
      create index if not exists appointment_refund_requests_queue_idx
        on app.appointment_refund_requests (status, created_at desc);
      create index if not exists appointment_refund_requests_appointment_idx
        on app.appointment_refund_requests (appointment_id, created_at desc);
      create unique index if not exists appointment_refund_requests_open_uq
        on app.appointment_refund_requests (appointment_id)
        where status in ('submitted', 'under_review', 'approved');

      create table if not exists app.appointment_refund_request_events (
        id uuid primary key default gen_random_uuid(),
        refund_request_id uuid not null references app.appointment_refund_requests(id) on delete cascade,
        event_type text not null,
        actor_type text not null default 'system',
        actor_id text not null default '',
        payload jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        check (actor_type in ('system', 'admin', 'customer'))
      );
      create index if not exists appointment_refund_request_events_idx
        on app.appointment_refund_request_events (refund_request_id, created_at);

      create table if not exists app.customer_partner_affinities (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references app.organizations(id) on delete cascade,
        customer_id uuid not null references app.booking_customers(id) on delete cascade,
        partner_profile_id uuid not null references app.partner_profiles(id) on delete cascade,
        successful_appointments integer not null default 0,
        last_completed_at timestamptz,
        status text not null default 'preferred',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (customer_id, partner_profile_id),
        check (successful_appointments >= 0),
        check (status in ('preferred', 'neutral', 'blocked'))
      );
      create index if not exists customer_partner_affinities_lookup_idx
        on app.customer_partner_affinities (customer_id, status, last_completed_at desc);

      create table if not exists app.appointment_events (
        id uuid primary key default gen_random_uuid(),
        appointment_id uuid not null references app.appointments(id) on delete cascade,
        event_type text not null,
        actor_type text not null default 'system',
        actor_id text not null default '',
        payload jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        check (actor_type in ('system', 'admin', 'partner', 'customer', 'stripe', 'webhook'))
      );
      create index if not exists appointment_events_appointment_idx
        on app.appointment_events (appointment_id, created_at);

      create table if not exists app.partner_push_subscriptions (
        id uuid primary key default gen_random_uuid(),
        partner_profile_id uuid not null references app.partner_profiles(id) on delete cascade,
        endpoint text not null unique,
        p256dh text not null,
        auth_secret text not null,
        expiration_time bigint,
        user_agent text not null default '',
        enabled boolean not null default true,
        last_success_at timestamptz,
        last_error text not null default '',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists partner_push_subscriptions_profile_idx
        on app.partner_push_subscriptions (partner_profile_id, enabled, updated_at desc);

      create table if not exists app.partner_portal_notifications (
        id uuid primary key default gen_random_uuid(),
        partner_profile_id uuid not null references app.partner_profiles(id) on delete cascade,
        appointment_id uuid references app.appointments(id) on delete cascade,
        event_key text not null,
        event_type text not null,
        title text not null,
        message text not null,
        action_url text not null default '/partner-portal',
        delivered_at timestamptz,
        read_at timestamptz,
        created_at timestamptz not null default now(),
        unique (partner_profile_id, event_key)
      );
      create index if not exists partner_portal_notifications_inbox_idx
        on app.partner_portal_notifications (partner_profile_id, read_at, created_at desc);

      create table if not exists app.stripe_webhook_events (
        event_id text primary key,
        event_type text not null,
        livemode boolean not null default false,
        status text not null default 'processing',
        error text not null default '',
        processed_at timestamptz,
        created_at timestamptz not null default now(),
        check (status in ('processing', 'processed', 'ignored', 'failed'))
      );

      create table if not exists app.booking_demand_requests (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references app.organizations(id) on delete cascade,
        service_id uuid not null references app.services(id) on delete cascade,
        full_name text not null default '',
        email text not null default '',
        phone text not null default '',
        city text not null,
        county text not null,
        state text not null,
        postal_code text not null default '',
        source_url text not null default '',
        status text not null default 'new',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (status in ('new', 'reviewing', 'notified', 'covered', 'closed'))
      );
      create index if not exists booking_demand_requests_market_idx
        on app.booking_demand_requests (state, county, city, service_id, status, created_at desc);

      create table if not exists app.booking_lead_events (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references app.organizations(id) on delete cascade,
        idempotency_key text not null,
        event_type text not null default 'booking.lead.created',
        public_key text not null,
        payload jsonb not null default '{}'::jsonb,
        status text not null default 'pending',
        http_status integer,
        response_text text not null default '',
        error text not null default '',
        sent_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (organization_id, idempotency_key),
        check (status in ('pending', 'sent', 'failed'))
      );
      alter table app.booking_lead_events
        add column if not exists identity_key text not null default '',
        add column if not exists normalized_email text not null default '',
        add column if not exists normalized_phone text not null default '',
        add column if not exists attempt_count integer not null default 1,
        add column if not exists last_activity_at timestamptz,
        add column if not exists send_after timestamptz,
        add column if not exists next_attempt_at timestamptz,
        add column if not exists processing_started_at timestamptz,
        add column if not exists retry_count integer not null default 0,
        add column if not exists converted_at timestamptz,
        add column if not exists appointment_id uuid references app.appointments(id) on delete set null;
      update app.booking_lead_events
         set last_activity_at = greatest(created_at, updated_at)
       where last_activity_at is null;
      update app.booking_lead_events
         set send_after = created_at + interval '10 minutes'
       where send_after is null;
      alter table app.booking_lead_events
        alter column last_activity_at set default now(),
        alter column last_activity_at set not null,
        alter column send_after set default (now() + interval '10 minutes'),
        alter column send_after set not null;
      alter table app.booking_lead_events
        drop constraint if exists booking_lead_events_status_check;
      alter table app.booking_lead_events
        add constraint booking_lead_events_status_check
        check (status in ('pending', 'processing', 'sent', 'failed', 'converted'));
      create index if not exists booking_lead_events_created_idx
        on app.booking_lead_events (organization_id, created_at desc);
      create unique index if not exists booking_lead_events_identity_uidx
        on app.booking_lead_events (organization_id, identity_key)
        where identity_key <> '';
      create index if not exists booking_lead_events_due_idx
        on app.booking_lead_events (coalesce(next_attempt_at, send_after), created_at)
        where status = 'pending';

      create table if not exists app.booking_attribution_sessions (
        session_id text primary key,
        visitor_id text not null,
        first_url text not null default '',
        first_referrer text not null default '',
        first_source text not null default 'direct',
        first_channel text not null default 'direct',
        first_campaign text not null default '',
        last_url text not null default '',
        last_referrer text not null default '',
        last_source text not null default 'direct',
        last_channel text not null default 'direct',
        last_campaign text not null default '',
        touch_count integer not null default 0,
        first_touched_at timestamptz not null default now(),
        last_touched_at timestamptz not null default now(),
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (touch_count >= 0)
      );
      create index if not exists booking_attribution_sessions_visitor_idx
        on app.booking_attribution_sessions (visitor_id, last_touched_at desc);

      create table if not exists app.booking_attribution_touchpoints (
        id uuid primary key default gen_random_uuid(),
        event_id text not null unique,
        session_id text not null references app.booking_attribution_sessions(session_id) on delete cascade,
        visitor_id text not null,
        event_type text not null,
        page_url text not null default '',
        referrer text not null default '',
        source text not null default 'direct',
        channel text not null default 'direct',
        campaign text not null default '',
        service_slug text not null default '',
        partner_profile_id text not null default '',
        metadata jsonb not null default '{}'::jsonb,
        occurred_at timestamptz not null default now(),
        created_at timestamptz not null default now()
      );
      create index if not exists booking_attribution_touchpoints_session_idx
        on app.booking_attribution_touchpoints (session_id, occurred_at, created_at);
      create index if not exists booking_attribution_touchpoints_visitor_idx
        on app.booking_attribution_touchpoints (visitor_id, occurred_at desc);

      alter table app.booking_lead_events
        add column if not exists attribution_session_id text not null default '',
        add column if not exists attribution_visitor_id text not null default '';
      alter table app.appointments
        add column if not exists attribution_session_id text not null default '',
        add column if not exists attribution_visitor_id text not null default '';
      create index if not exists booking_lead_events_attribution_idx
        on app.booking_lead_events (attribution_session_id) where attribution_session_id <> '';
      create index if not exists appointments_attribution_idx
        on app.appointments (attribution_session_id) where attribution_session_id <> '';

      create table if not exists app.appointment_webhook_events (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references app.organizations(id) on delete cascade,
        appointment_id uuid not null references app.appointments(id) on delete cascade,
        event_type text not null,
        idempotency_key text not null,
        webhook_url text not null,
        status text not null default 'pending',
        http_status integer,
        response_excerpt text not null default '',
        error_message text not null default '',
        created_at timestamptz not null default now(),
        sent_at timestamptz,
        updated_at timestamptz not null default now(),
        unique (organization_id, appointment_id, event_type),
        check (status in ('pending', 'sent', 'failed'))
      );
      create index if not exists appointment_webhook_events_created_idx
        on app.appointment_webhook_events (organization_id, created_at desc);
    `);
  })().catch((error) => {
    bookingEngineSchemaReady = null;
    throw error;
  });
  return bookingEngineSchemaReady;
}
