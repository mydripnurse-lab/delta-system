-- Apply explicitly after 048. No backfill or change to existing partner referrals.
begin;
alter table app.clinics add column if not exists affiliate_commission_rate numeric(5,2)
  check (affiliate_commission_rate >= 0 and affiliate_commission_rate <= 100);
create table if not exists app.clinic_affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references app.clinics(id),
  referred_profile_id uuid not null references app.partner_profiles(id),
  appointment_id uuid not null unique references app.appointments(id),
  service_id uuid references app.services(id),
  amount numeric(12,2) not null check (amount >= 0),
  rate numeric(5,2) not null check (rate >= 0 and rate <= 100),
  currency text not null,
  status text not null default 'pending' check (status in ('pending','approved','payable','paid','void')),
  paid_at timestamptz,
  payout_reference text,
  created_at timestamptz not null default now()
);
create index if not exists clinic_affiliate_commissions_clinic_idx
  on app.clinic_affiliate_commissions(clinic_id,created_at desc);
create index if not exists staff_applications_clinic_referral_idx
  on app.staff_applications((request_payload->>'clinicReferralId'))
  where request_payload ? 'clinicReferralId';
commit;
