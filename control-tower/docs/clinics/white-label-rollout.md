# Clinic branding and personal photos

Clinic profile now has Clinic details, White Label, and My profile sections.
White Label uses existing clinic logo/primary/accent fields; previews are browser-local.
The dedicated branding save only changes logo/colors and invalidates the existing public clinic cache.
Personal avatars use a separate URL per account; existing public nurse photos and clinic logos are preserved.

## Release order

1. Apply `db/migrations/051_clinic_account_photos.sql` before deploying this code. Both clinic and partner session reads use the additive columns.
2. Verify both columns exist. No backfill or existing record edits are required.
3. Deploy the code. Existing Blob configuration is reused; there are no new services or polling jobs.
4. Verify a clinic owner can open Clinic profile > White Label, save a palette and reopen it; verify a nurse-owned clinic can upload a personal photo without changing the public nurse photo.

Rollback: restore the previous application deployment; the two additive columns may remain.
Image uploads use existing Blob storage and its normal usage billing; Neon stores URLs only.

## Validation

- `node tools/test-clinic-partners.cjs`: local synthetic PostgreSQL only, repeatable migration, authorization, isolated branding save, existing cache/access/lifecycle checks.
- `node tools/test-clinic-account-photo.cjs`: no network; decoded images, limits, account ownership, public-photo preservation.
- Existing workspace-access and public-contact tests.
- TypeScript and targeted ESLint.
- Browser preview: profile tabs, palettes, light/dark text contrast, website preview and simulated save.
