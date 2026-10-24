# Phase two — operations center

## Baseline and execution plan

Inspected clean phase-one source at local 510cecc, remote main 7a915fd. Re-ran all 18 baseline tests and lint/TypeScript successfully before development. Existing limitations in DELIVERY.md remain applicable unless replaced below. Work is isolated on `feat/phase-two-operations`; production Supabase and Railway are unchanged.

1. Add versioned additive operations migration, composite tenant references and RLS.
2. Implement inbox, linked records, notifications, call logs, calendar and scoped search APIs.
3. Implement transactional persistent workflow jobs, retries, dead letters, idempotency and BullMQ scanner.
4. Redesign operations UI, command palette, customer 360, agenda and workflow builder in Persian/English with mobile layouts.
5. Verify local unit/integration/type/build; run native PostgreSQL, browser and Docker in branch CI. Review evidence before production approval.

## Current implementation

- Channels (email/SMS/WhatsApp/internal), conversations, messages, participants, notifications, call logs, workflows, operation jobs. All new tables FORCE RLS; no public or browser Data API privileges. Composite foreign keys prevent cross-tenant linking.
- Inbox/thread, customer/contact/deal links in APIs, account link in creation UI. User-authored messages are **drafts or internal notes only**. Signed inbound adapter events may store received messages. External `/send` always returns 409. The communication registry requires a tenant adapter, valid configuration, permission and explicit approval before invoking a provider. No real external sending provider is installed. Signed ingress is available only for channels explicitly mapped to a current tenant member in server environment.
- Scoped search across accounts, contacts, leads, deals, tasks and conversations; command palette with Ctrl/Cmd-K. Customer 360 joins communications, deals, tasks, contacts, call logs, notes and activities.
- Agenda of scheduled tasks, task completion, reminder timestamp and one-time in-app reminders. Notifications are visible and markable only by their recipient.
- Workflow builder supports conversation.created/manual → status condition → task or notification. Disabled by default. Enabled conversation triggers enqueue transactionally.
- PostgreSQL `operation_jobs` is durable source of truth; unique tenant/idempotency key, SKIP LOCKED locking, savepoints, transactional effect/completion, three attempts with 30-second retry delay, then `dead`. BullMQ schedules a scan every 15 seconds; persisted pending work survives Redis loss. Worker scopes every context and reloads membership permission. No automatic external communication or sensitive AI tool.
- Conversation review uses a server-only summary adapter when explicitly enabled/configured; otherwise it returns a clearly labeled local extractive preview. Model response shape and timeouts are validated; suggestions never execute. Runs and metadata logs are persisted. No production model has been configured.

## Validation status

- Baseline: 18/18 passed.
- Expanded local suite: 30/30 pending final rerun (PostgreSQL/PGlite RLS/API/workflow and adapter safety tests).
- Local lint/TypeScript: passed. Production bundle: passed.
- Native PostgreSQL, Playwright desktop/mobile, and Docker: branch CI pending; do not infer success from phase-one results.
- Initial new tests failed because phase-one fixtures logged out Alice and invited Bob into tenant A. Fixed by re-authenticating Alice and introducing a genuinely independent outsider. The corrected isolation assertions pass.

## Installation / review

Use README setup and Docker Compose. `pnpm db:migrate` now applies `operations.sql` after the phase-one migrations. Hosted Supabase equivalent: `supabase/migrations/20261024002451_operations_center.sql`. **Do not apply to production until approved.** Back up production first and exercise the migration on a development clone. Existing applied migrations are unchanged.

Compose worker now requires DATABASE_URL as well as Redis. Only routing metadata is accessible to the backend login before switching to restricted runtime role. Existing Railway has no managed Redis/worker; this branch does not provision or deploy one.

## Boundaries and remaining work

This is a reviewable phase-two increment, not a claim that every enterprise feature is finished. Native provider-specific bridges and delivery receipts, delivery approval UI, attachments, provider delivery receipts, a production-configured summary model, richer AI execution history UI, month/week calendar, richer workflow conditions/actions, draggable graph editing, dead-letter replay UI and cursor pagination for operations views remain. Inbox currently displays newest 100 conversations, thread first 200 messages; customer relationships are bounded to 50 per module. Core resource endpoints have pagination. Operations pages need cursor pagination before high-volume use. Call log forms and task/agenda reminder controls are included. No production deploy or database mutation is authorized by this branch's existence.

## Signed ingress and AI adapter configuration

`INBOUND_CHANNELS_JSON` is server-only JSON keyed by channel UUID with `{tenantId,userId,secret}`. Use a dedicated member with only CRM read/write; the worker and webhook recheck permissions. POST `/api/inbound/:channel` with exact UTF-8 JSON `{event_id,conversation_id,body,sender}`; headers `x-crm-timestamp` (Unix seconds) and `x-crm-signature` (hex HMAC-SHA256 of timestamp + `.` + raw body). Requests older than five minutes or with invalid signatures fail. Existing conversation must belong to configured tenant and channel; repeated event IDs are ignored atomically. Native providers require a bridge normalizing their verified payload into this contract. Never put the shared secret in browser code.

Summary service: set `SUMMARY_ADAPTER_ENABLED=true`, `SUMMARY_ADAPTER_URL` and `SUMMARY_ADAPTER_TOKEN` in server environment only. The URL may point to a self-hosted service. Contract: POST JSON `{task:'conversation.summary',text,instructions}`, Bearer authorization; return exactly `{summary:string,suggestions:string[]}`. Eight-second timeout; no tool execution. Provider receives up to 30,000 characters of the selected conversation only. Enable only after choosing a provider and approving its data handling. The shipped production environment is unchanged and has no model configured.

First branch CI run 40045498218 passed native PostgreSQL/migration and legacy browser flows, failed the two new browser flows because a text locator matched both conversation preview and message. Fixed locator scopes to `.thread-messages`. Docker was skipped after this failure; rerun required.
