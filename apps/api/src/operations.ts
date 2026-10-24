import { processOperationJobs } from "../../../packages/shared/src/operation-jobs.js";
import type { Express, Request, Response, RequestHandler } from "express";
import { z } from "zod";
import type { Executor } from "./database.js";
import { uuid } from "../../../packages/shared/src/index.js";
type Authorize = <T>(
  req: Request,
  res: Response,
  permission: string,
  fn: (tx: Executor, t: string) => Promise<T>,
) => Promise<T>;
type Audit = (
  tx: Executor,
  t: string,
  u: string,
  action: string,
  resource: string,
  id: string | null,
) => Promise<void>;
export function installOperations(
  app: Express,
  authorized: Authorize,
  route: (
    fn: (req: Request, res: Response) => Promise<unknown>,
  ) => RequestHandler,
  audit: Audit,
) {
  const base = "/api/t/:tenant";
  app.get(
    base + "/inbox",
    route(async (req, res) =>
      res.json(
        await authorized(req, res, "crm.read", async (tx, t) => ({
          conversations: await tx.query(
            "SELECT c.*,ch.kind,ch.name AS channel_name,(SELECT body FROM messages m WHERE m.tenant_id=c.tenant_id AND m.conversation_id=c.id ORDER BY created_at DESC LIMIT 1) AS preview FROM conversations c JOIN channels ch ON ch.tenant_id=c.tenant_id AND ch.id=c.channel_id WHERE c.tenant_id=$1::uuid ORDER BY c.updated_at DESC LIMIT 100",
            [t],
          ),
          channels: await tx.query(
            "SELECT * FROM channels WHERE tenant_id=$1::uuid ORDER BY name",
            [t],
          ),
        })),
      ),
    ),
  );
  app.get(
    base + "/conversations/:id/thread",
    route(async (req, res) =>
      res.json(
        await authorized(req, res, "crm.read", async (tx, t) => ({
          messages: await tx.query(
            "SELECT * FROM messages WHERE tenant_id=$1::uuid AND conversation_id=$2::uuid ORDER BY created_at,id LIMIT 200",
            [t, uuid.parse(req.params.id)],
          ),
          participants: await tx.query(
            "SELECT * FROM participants WHERE tenant_id=$1::uuid AND conversation_id=$2::uuid ORDER BY created_at LIMIT 100",
            [t, uuid.parse(req.params.id)],
          ),
        })),
      ),
    ),
  );
  // Explicit safety boundary: no external transmission is exposed in this release.
  app.post(
    base + "/conversations/:id/send",
    route(async (req, res) => {
      await authorized(req, res, "crm.write", async () => true);
      res.status(409).json({
        error:
          "External delivery requires configured adapter and explicit sending approval",
      });
    }),
  );
  app.get(
    base + "/search",
    route(async (req, res) =>
      res.json(
        await authorized(req, res, "crm.read", async (tx, t) => {
          const q = z.string().trim().min(2).max(100).parse(req.query.q);
          const results = [];
          for (const table of [
            "accounts",
            "contacts",
            "leads",
            "deals",
            "tasks",
            "conversations",
          ] as const) {
            results.push(
              ...(
                await tx.query<{ id: string; name: string }>(
                  `SELECT id,name FROM ${table} WHERE tenant_id=$1::uuid AND name ILIKE $2 ORDER BY name LIMIT 8`,
                  [t, "%" + q.replace(/[\\%_]/g, "\\$&") + "%"],
                )
              ).map((r) => ({ ...r, type: table })),
            );
          }
          return results;
        }),
      ),
    ),
  );
  app.get(
    base + "/customers/:id/360",
    route(async (req, res) =>
      res.json(
        await authorized(req, res, "crm.read", async (tx, t) => {
          const id = uuid.parse(req.params.id);
          const [customer] = await tx.query(
            "SELECT * FROM accounts WHERE tenant_id=$1::uuid AND id=$2::uuid",
            [t, id],
          );
          const related: Record<string, unknown> = {
            customer: customer ?? null,
          };
          for (const table of [
            "contacts",
            "deals",
            "tasks",
            "notes",
            "activities",
            "conversations",
            "call_logs",
          ])
            related[table] = await tx.query(
              `SELECT * FROM ${table} WHERE tenant_id=$1::uuid AND account_id=$2::uuid ORDER BY created_at DESC LIMIT 50`,
              [t, id],
            );
          return related;
        }),
      ),
    ),
  );
  app.get(
    base + "/calendar",
    route(async (req, res) =>
      res.json(
        await authorized(req, res, "crm.read", (tx, t) =>
          tx.query(
            "SELECT * FROM tasks WHERE tenant_id=$1::uuid AND due_at IS NOT NULL ORDER BY due_at LIMIT 200",
            [t],
          ),
        ),
      ),
    ),
  );
  app.get(
    base + "/notifications",
    route(async (req, res) =>
      res.json(
        await authorized(req, res, "crm.read", (tx, t) =>
          tx.query(
            "SELECT * FROM notifications WHERE tenant_id=$1::uuid AND user_id=$2::uuid ORDER BY created_at DESC LIMIT 100",
            [t, res.locals.user.id],
          ),
        ),
      ),
    ),
  );
  app.post(
    base + "/notifications/:id/read",
    route(async (req, res) =>
      res.json(
        await authorized(req, res, "crm.read", async (tx, t) => {
          const rows = await tx.query(
            "UPDATE notifications SET read_at=coalesce(read_at,now()),updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid AND user_id=$3::uuid RETURNING *",
            [t, uuid.parse(req.params.id), res.locals.user.id],
          );
          if (rows.length)
            await audit(
              tx,
              t,
              res.locals.user.id,
              "read",
              "notifications",
              uuid.parse(req.params.id),
            );
          return { data: rows };
        }),
      ),
    ),
  );
  app.get(
    base + "/jobs",
    route(async (req, res) =>
      res.json(
        await authorized(req, res, "settings.manage", (tx, t) =>
          tx.query(
            "SELECT * FROM operation_jobs WHERE tenant_id=$1::uuid ORDER BY created_at DESC LIMIT 100",
            [t],
          ),
        ),
      ),
    ),
  );
  app.post(
    base + "/workflows/:id/enqueue",
    route(async (req, res) =>
      res.status(202).json(
        await authorized(req, res, "settings.manage", async (tx, t) => {
          const b = z
            .object({
              conversation_id: uuid,
              idempotency_key: z.string().min(8).max(200),
            })
            .strict()
            .parse(req.body);
          const [job] = await tx.query(
            "INSERT INTO operation_jobs(tenant_id,name,workflow_id,conversation_id,requested_by,idempotency_key) VALUES($1::uuid,$2,$3::uuid,$4::uuid,$5::uuid,$6) ON CONFLICT(tenant_id,idempotency_key) DO UPDATE SET idempotency_key=excluded.idempotency_key RETURNING *",
            [
              t,
              "Workflow",
              uuid.parse(req.params.id),
              b.conversation_id,
              res.locals.user.id,
              b.idempotency_key,
            ],
          );
          await audit(
            tx,
            t,
            res.locals.user.id,
            "enqueue",
            "operation_jobs",
            (job as { id: string }).id,
          );
          return job;
        }),
      ),
    ),
  );
  // Transactional drain: row locks serialize competing consumers; effects + completed status commit together.
  app.post(
    base + "/jobs/process",
    route(async (req, res) =>
      res.json(
        await authorized(req, res, "crm.write", async (tx, t) => {
          return processOperationJobs(tx, t, res.locals.user.id);
        }),
      ),
    ),
  );
  app.post(
    base + "/conversations/:id/summary",
    route(async (req, res) =>
      res.json(
        await authorized(req, res, "ai.run", async (tx, t) => {
          const id = uuid.parse(req.params.id);
          const rows = await tx.query<{ body: string }>(
            "SELECT body FROM messages WHERE tenant_id=$1::uuid AND conversation_id=$2::uuid ORDER BY created_at DESC LIMIT 20",
            [t, id],
          );
          await audit(
            tx,
            t,
            res.locals.user.id,
            "summarize",
            "conversations",
            id,
          );
          return {
            mode: "extractive",
            summary: rows
              .reverse()
              .map((r) => r.body)
              .join("\n")
              .slice(0, 1800),
            suggestions: rows.length
              ? ["Review the conversation and create a follow-up task"]
              : [],
            notice:
              "Local extractive preview; no language model configured. Suggestions require human review.",
          };
        }),
      ),
    ),
  );
}
