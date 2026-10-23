# Deployment

## Live service

- Repository: https://github.com/javanwebi/CRM
- Railway service: crm, ID 98bd9e26-3a68-4aaf-ba84-b39fe7a33c27
- Existing Railway project: atlassanatpish1, ID 4e79172e-f7d3-4570-a9aa-634b26bd0e7a
- Environment: production, ID 5ea44549-9ba0-45ae-8e4a-7e1f178ed0e9
- Public URL: https://crm-production-bee3.up.railway.app
- Supabase: crm, project syktwppqycdkttieokzz (eu-west-1)

Creating a new Railway project exceeded the free plan project limit. A separate crm service was successfully created inside the existing project. The pre-existing website service and database were not modified. This is service separation within a shared billing/project scope, not a new Railway project.

## Server secrets

The live service uses DATABASE_URL for the dedicated NOINHERIT/NOBYPASSRLS crm_server login, APP_ORIGIN for the exact public URL, NODE_ENV=production and PORT=3000. Credentials are stored only in service variables. No database secret is included in this repository.

The Supabase direct database host requires outbound IPv6. The Railway service has ipv6EgressEnabled=true. Without it the application may listen successfully while database initialization fails. A verified session-pooler address is an alternative for IPv4-only hosts.

The deployed service uses a database-backed /api/health check (120-second startup timeout). Railway's old railway.json Config as Code is deprecated in this account. Live settings were applied through Railway's API; docs/railway-legacy-reference.json is an historical reference, not active deployment configuration. Configure the above settings in Railway or its current Infrastructure as Code tooling when reproducing this service.

GitHub main changes auto-deploy the crm service. Verify the terminal deployment status and /api/health before declaring a release healthy. CI must separately pass; a running process alone is insufficient.

## Worker

The self-hosted Compose file includes Redis and a BullMQ worker. No managed Redis/worker service has been provisioned on Railway for this release. AI execution is intentionally disabled and no API accepts AI jobs yet. To enable it in phase two, add server-validated tenant/user/run context, tool permission checks, a verified approval state and execution logs before enabling any handler.

## Backups and upgrades

Use pg_dump or your provider's backup service before applying future migrations to real customer data, and test restoration. Use a development database first. Never edit an already applied migration or run the standalone installer against an already initialized Supabase database. Supabase migration filenames match the versions returned by its migration ledger.
