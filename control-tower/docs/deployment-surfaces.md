# Independent deployment surfaces

The Partner Platform and Telahagocrecer share selected application code and
database contracts, but they are released as independent Vercel projects.

## Partner Platform

- `admin.mydripnurse.com`
- `partners.mydripnurse.com`
- `onboarding.mydripnurse.com`
- `policy.mydripnurse.com`
- Environment: `DEPLOYMENT_SURFACE=partner-platform`
- Vercel configuration: `vercel.partner.json`
- No Telahagocrecer cron jobs.

## Telahagocrecer

- `telahagocrecer.com`
- `www.telahagocrecer.com`
- `search-embedded.telahagocrecer.com`
- Environment: `DEPLOYMENT_SURFACE=telahagocrecer`
- Vercel configuration: `vercel.telahagocrecer.json`
- Owns the control-tower cron jobs.

## Safe migration order

1. Leave the current production project at `DEPLOYMENT_SURFACE=combined`.
2. Create the new Partner Platform Vercel project from this repository with
   root directory `control-tower` and `vercel.partner.json`.
3. Copy only the Partner Platform environment variables and set
   `DEPLOYMENT_SURFACE=partner-platform`.
4. Verify the preview deployment: admin login, Automations webhook fields,
   Partner portal, public Partner website, booking and Stripe test mode.
5. Transfer the four Partner Platform domains one at a time. Verify after each
   transfer. A domain can be moved back to the current project for rollback.
6. Rename or retain the existing project as Telahagocrecer, set
   `DEPLOYMENT_SURFACE=telahagocrecer`, and keep its three domains and crons.

The two projects may continue using the same Supabase database and webhook
payload contracts. Deployments, environment variables, domains, and cron jobs
remain independent.
