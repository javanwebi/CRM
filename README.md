# Madar CRM / مدار

Independent, multi-organization CRM. The explicit React + Express request takes precedence over the conflicting Next.js + NestJS template in the brief. One codebase supports managed PostgreSQL (including Supabase) and private installations.

## Stack and structure

- `apps/web`: React 19, TypeScript, Vite, Tailwind 4, Radix Dialog and shadcn-style Button.
- `apps/api`: Express 5, Zod validation, Prisma transaction/query client, secure cookie sessions.
- `apps/worker`: BullMQ consumer. AI execution fails closed in phase one.
- `packages/database`: SQL source of truth, versioned Supabase SQL migrations, Prisma schema and installation runner.
- `packages/shared`, `permissions`, `ui`, `ai`: shared validation, permission vocabulary, UI components and tool registry.
- pnpm 11 + Turborepo; Vitest, Supertest and Playwright.

## Private installation

Requirements: Docker Engine with Compose plugin. Use a reverse proxy with HTTPS for public installations.

```sh
cp .env.example .env
# Set POSTGRES_PASSWORD to a long random URL-safe value.
# For HTTPS: set APP_ORIGIN=https://your-domain.example and NODE_ENV=production.
docker compose up --build -d
docker compose ps
```

Open http://localhost:3000 in local development. Register an account, create an organization and add your own data. There are no demo customers in production. The default pipeline stages are configuration, not sample customer data.

Data is stored in named PostgreSQL and Redis volumes. Never run `docker compose down -v` on a live installation. Back up PostgreSQL before upgrades. Migrations execute through the one-shot `migrate` service; the web service never silently changes schema on startup.

## Local development

Node 22.14+ or 24; pnpm 11.25.0; PostgreSQL 17; Redis for worker only.

```sh
pnpm install --frozen-lockfile
pnpm --filter @crm/api exec prisma generate --schema ../../packages/database/schema.prisma
# Load .env through your shell or secret manager, then:
pnpm db:migrate
pnpm dev
```

Vite runs on port 5173 and proxies `/api` to Express on 3000. For this mode set APP_ORIGIN=http://localhost:5173. `pnpm build` produces the frontend bundle. Express serves it from `apps/web/dist` in deployed installations. A server-only DATABASE_URL with migration-owner privileges is currently required for authentication, organization bootstrap and team administration; customer/business operations always switch transaction-locally to the non-BYPASSRLS `crm_runtime` role. See the security boundaries below.

For Supabase use the session pooler connection string from **Connect** with SSL, e.g. `?sslmode=require&connection_limit=5`. Never put the database URL in VITE_* or the frontend. The initial migration and runtime-role grant are in `supabase/migrations`. The Supabase Data API is intentionally denied to anon/authenticated for these custom-auth tables. Supabase is used as PostgreSQL hosting, not as a second competing login system.

## Verification

```sh
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
```

Vitest uses PGlite, a real PostgreSQL engine compiled to WASM, rather than a mock repository. Direct SQL tests change role to crm_runtime and attempt cross-tenant SELECT, UPDATE, INSERT and foreign-key forgery. These are separate from the hosted Supabase SQL isolation check. E2E uses an ephemeral test database only; no test fixtures are added to production. CI additionally starts PostgreSQL 17, verifies migrations, and boots Docker Compose.

## Features

- Register/login/logout; scrypt hashes and hashed seven-day database sessions.
- Organization creation/switching with default settings and sales stages.
- Customers (legal/natural persons), contacts, leads, opportunities, activities, tasks and notes: create/read/update APIs, validation, search and pagination.
- Customer detail dialog and editing; responsive RTL/LTR panel; empty/loading/error states.
- Pipeline and stages; stage transitions; separate totals by currency.
- Custom permission roles; email-bound, single-use, expiring invitation tokens, manually shared by the manager.
- Company settings and immutable application audit trail.
- AI/tool/approval/job tables and a worker which rejects execution pending phase-two authorization integration.

## API

All business routes require an HttpOnly session cookie. Mutating browser requests must match APP_ORIGIN. JSON input is bounded and unknown fields rejected.

- POST `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`
- GET `/api/me`, `/api/tenants`; POST `/api/tenants`
- GET `/api/t/:tenant/dashboard`
- GET/POST `/api/t/:tenant/{accounts,contacts,leads,pipelines,pipeline_stages,deals,tasks,activities,notes}`
- GET/PATCH the above resource paths followed by `/:id`
- GET `/api/t/:tenant/team`; POST `/api/t/:tenant/roles`, `/api/t/:tenant/invitations`
- POST `/api/invitations/accept` with `{code}`
- GET/PATCH `/api/t/:tenant/settings`; GET `/api/t/:tenant/audit`
- GET `/api/health` verifies database reachability.

Collection query: `page`, `limit` (1..100), `search`, `sort` (name/created_at), `order` (asc/desc). No destructive business-record delete endpoints are exposed in phase one.

## Security boundaries and remaining work

See [docs/SECURITY.md](docs/SECURITY.md) and [docs/DELIVERY.md](docs/DELIVERY.md). This is an initial implementation, not a claim that every enterprise requirement is complete. In particular, email verification/recovery, managed delivery, member removal/role reassignment, broad form localization, global search, full relationship timelines and large-catalog selectors are not finished. Do not call it production-ready until deployed flows and CI pass on the chosen host.
