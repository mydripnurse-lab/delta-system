# HEARTBEAT.md

## Health checks
- verify tenant routing maps `ads` to `soul_ads_optimizer`.
- verify tenant has Google Ads OAuth `refresh_token` + valid developer token.
- verify MCC login id (`login_customer_id`) is set when using manager accounts.
- verify `/api/dashboard/ads/ping` succeeds for the tenant.
- verify proposals are being queued and visible in Notification Hub.

