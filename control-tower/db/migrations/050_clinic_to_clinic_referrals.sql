-- Additive: no reassignment, backfill, payout, or changes to existing appointments.
begin;
alter table app.clinics add column if not exists referred_by_clinic_id uuid references app.clinics(id);
create index if not exists clinics_referrer_idx on app.clinics(referred_by_clinic_id,created_at desc)
  where referred_by_clinic_id is not null;
alter table app.clinic_affiliate_commissions alter column referred_profile_id drop not null;
alter table app.clinic_affiliate_commissions add column if not exists referred_clinic_id uuid references app.clinics(id);
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='app.clinic_affiliate_commissions'::regclass and conname='clinic_commission_one_recipient') then
    alter table app.clinic_affiliate_commissions add constraint clinic_commission_one_recipient
      check(num_nonnulls(referred_profile_id,referred_clinic_id)=1);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='app.clinics'::regclass and conname='clinic_referral_not_self') then
    alter table app.clinics add constraint clinic_referral_not_self check(referred_by_clinic_id is distinct from id);
  end if;
end $$;
commit;
