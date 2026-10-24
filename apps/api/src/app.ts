import { installOperations } from "./operations.js";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { z, ZodError } from "zod";
import {
  credentials,
  paging,
  resources,
  uuid,
  type Resource,
} from "../../../packages/shared/src/index.js";
import { scoped, type Database, type Executor } from "./database.js";
import { hashPassword, verifyPassword, token, digest } from "./auth.js";
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
type User = { id: string; email: string; name: string; password_hash: string };
export function createApp(
  db: Database,
  options: { production?: boolean; origin?: string; webPath?: string } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(express.json({ limit: "128kb" }));
  app.use(cookieParser());
  app.use("/api", rateLimit({ windowMs: 60_000, limit: 150 }));
  app.use("/api", (req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== options.origin
    )
      return res.status(403).json({ error: "Untrusted origin" });
    next();
  });
  const asyncRoute =
    (fn: (r: Request, s: Response) => Promise<unknown>) =>
    (r: Request, s: Response, n: NextFunction) => {
      Promise.resolve(fn(r, s)).catch(n);
    };
  app.get(
    "/api/health",
    asyncRoute(async (_req, res) => {
      await db.query("SELECT 1");
      res.json({ status: "ok" });
    }),
  );
  const authLimit = rateLimit({ windowMs: 900_000, limit: 20 });
  for (const mode of ["register", "login"])
    app.post(
      `/api/auth/${mode}`,
      authLimit,
      asyncRoute(async (req, res) => {
        const data = credentials.parse(req.body);
        let user: User | undefined;
        if (mode === "register") {
          if (!data.name) throw new HttpError(400, "Name required");
          const hash = await hashPassword(data.password);
          [user] = await db.query<User>(
            "INSERT INTO public.users(email,name,password_hash) VALUES($1,$2,$3) RETURNING *",
            [data.email, data.name, hash],
          );
        } else {
          [user] = await db.query<User>(
            "SELECT * FROM public.users WHERE email=$1",
            [data.email],
          );
          const valid = await verifyPassword(
            data.password,
            user?.password_hash ??
              "00000000000000000000000000000000:" + "00".repeat(64),
          );
          if (!user || !valid) throw new HttpError(401, "Invalid credentials");
        }
        const session = token();
        await db.query(
          "INSERT INTO private.sessions(id,user_id,expires_at) VALUES($1,$2::uuid,now()+interval '7 days') RETURNING id",
          [digest(session), user!.id],
        );
        res
          .cookie("crm_session", session, {
            httpOnly: true,
            secure: options.production,
            sameSite: "lax",
            maxAge: 604800000,
            path: "/",
          })
          .status(mode === "register" ? 201 : 200)
          .json({
            user: { id: user!.id, email: user!.email, name: user!.name },
          });
      }),
    );
  app.use("/api", (req, res, next) => {
    void (async () => {
      if (!req.cookies.crm_session)
        throw new HttpError(401, "Authentication required");
      const [user] = await db.query<User>(
        "SELECT u.* FROM public.users u JOIN private.sessions s ON s.user_id=u.id WHERE s.id=$1 AND s.expires_at>now()",
        [digest(req.cookies.crm_session)],
      );
      if (!user) throw new HttpError(401, "Session expired");
      res.locals.user = user;
      // Express async middleware explicitly advances only after verified authentication.
      res.locals.authenticated = true;
      next();
    })().catch(next);
  });
  app.get(
    "/api/me",
    asyncRoute(async (_req, res) =>
      res.json({
        user: {
          id: res.locals.user.id,
          name: res.locals.user.name,
          email: res.locals.user.email,
        },
      }),
    ),
  );
  app.post(
    "/api/auth/logout",
    asyncRoute(async (req, res) => {
      await db.query("DELETE FROM private.sessions WHERE id=$1 RETURNING id", [
        digest(req.cookies.crm_session),
      ]);
      res.clearCookie("crm_session", { path: "/" }).json({ ok: true });
    }),
  );
  app.get(
    "/api/tenants",
    asyncRoute(async (_req, res) => {
      const rows = await scoped(db, res.locals.user.id, (tx) =>
        tx.query("SELECT * FROM public.tenants ORDER BY created_at"),
      );
      res.json(rows);
    }),
  );
  app.post(
    "/api/tenants",
    asyncRoute(async (req, res) => {
      const { name } = z
        .object({ name: z.string().min(2).max(120) })
        .strict()
        .parse(req.body);
      const tenant = await db.transaction(async (tx) => {
        const [t] = await tx.query<{ id: string; name: string }>(
          "INSERT INTO public.tenants(name) VALUES($1) RETURNING *",
          [name],
        );
        const [role] = await tx.query<{ id: string }>(
          "INSERT INTO public.roles(tenant_id,name,grants) VALUES($1::uuid,$2,$3::text[]) RETURNING id",
          [
            t.id,
            "Owner",
            [
              "crm.read",
              "crm.write",
              "team.manage",
              "settings.manage",
              "ai.run",
            ],
          ],
        );
        await tx.query(
          "INSERT INTO public.memberships(tenant_id,user_id,role_id) VALUES($1::uuid,$2::uuid,$3::uuid) RETURNING id",
          [t.id, res.locals.user.id, role.id],
        );
        await tx.query(
          "INSERT INTO public.tenant_settings(tenant_id) VALUES($1::uuid) RETURNING id",
          [t.id],
        );
        const [pipeline] = await tx.query<{ id: string }>(
          "INSERT INTO public.pipelines(tenant_id,name) VALUES($1::uuid,$2) RETURNING id",
          [t.id, "Sales"],
        );
        for (const [position, name] of [
          "New",
          "Qualified",
          "Proposal",
          "Negotiation",
          "Closed",
        ].entries())
          await tx.query(
            "INSERT INTO public.pipeline_stages(tenant_id,pipeline_id,name,position,probability) VALUES($1::uuid,$2::uuid,$3,$4,$5) RETURNING id",
            [t.id, pipeline.id, name, position, position * 25],
          );
        await audit(tx, t.id, res.locals.user.id, "create", "tenants", t.id);
        return t;
      });
      res.status(201).json(tenant);
    }),
  );
  const authorized = async <T>(
    req: Request,
    res: Response,
    permission: string,
    fn: (tx: Executor, t: string) => Promise<T>,
  ) => {
    const t = uuid.parse(req.params.tenant);
    return scoped(db, res.locals.user.id, async (tx) => {
      const [row] = await tx.query<{ allowed: boolean }>(
        "SELECT private.can($1::uuid,$2) AS allowed",
        [t, permission],
      );
      if (!row.allowed) throw new HttpError(403, "Permission denied");
      return fn(tx, t);
    });
  };
  app.get(
    "/api/t/:tenant/dashboard",
    asyncRoute(async (req, res) =>
      res.json(
        await authorized(req, res, "crm.read", async (tx, t) => {
          const [summary] = await tx.query(
            `SELECT (SELECT count(*) FROM accounts WHERE tenant_id=$1::uuid)::int AS accounts,(SELECT count(*) FROM contacts WHERE tenant_id=$1::uuid)::int AS contacts,(SELECT count(*) FROM leads WHERE tenant_id=$1::uuid)::int AS leads,(SELECT count(*) FROM tasks WHERE tenant_id=$1::uuid AND status<>'done')::int AS tasks`,
            [t],
          );
          const totals = await tx.query(
            "SELECT currency,sum(value)::text AS value FROM deals WHERE tenant_id=$1::uuid AND status=$2 GROUP BY currency",
            [t, "open"],
          );
          return {
            ...summary,
            totals,
            recent: await tx.query(
              "SELECT action,resource,created_at FROM audit_logs WHERE tenant_id=$1::uuid ORDER BY created_at DESC LIMIT 10",
              [t],
            ),
          };
        }),
      ),
    ),
  );
  installOperations(app, authorized, asyncRoute, audit);
  for (const table of Object.keys(resources) as Resource[]) {
    const base = `/api/t/:tenant/${table}`;
    const schema = resources[table].strict();
    app.get(
      base,
      asyncRoute(async (req, res) =>
        res.json(
          await authorized(req, res, "crm.read", async (tx, t) => {
            const p = paging.parse(req.query);
            let where = `tenant_id=$1::uuid AND name ILIKE $2`;
            const values = [t, `%${p.search}%`];
            if (p.status) {
              if (!("status" in schema.shape))
                throw new HttpError(400, "Status filter unavailable");
              values.push(p.status);
              where += " AND status=$3";
            }
            const [count] = await tx.query<{ total: number }>(
              `SELECT count(*)::int AS total FROM ${table} WHERE ${where}`,
              values,
            );
            const rows = await tx.query(
              `SELECT * FROM ${table} WHERE ${where} ORDER BY ${p.sort} ${p.order},id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
              [...values, p.limit, (p.page - 1) * p.limit],
            );
            return {
              data: rows,
              total: count.total,
              page: p.page,
              limit: p.limit,
            };
          }),
        ),
      ),
    );
    app.get(
      `${base}/:id`,
      asyncRoute(async (req, res) =>
        res.json(
          await authorized(req, res, "crm.read", async (tx, t) => {
            const [row] = await tx.query(
              `SELECT * FROM ${table} WHERE tenant_id=$1::uuid AND id=$2::uuid`,
              [t, uuid.parse(req.params.id)],
            );
            if (!row) throw new HttpError(404, "Record not found");
            return row;
          }),
        ),
      ),
    );
    app.post(
      base,
      asyncRoute(async (req, res) =>
        res.status(201).json(
          await authorized(
            req,
            res,
            ["channels", "workflows"].includes(table)
              ? "settings.manage"
              : "crm.write",
            async (tx, t) => {
              const body = schema.parse(req.body);
              const keys = Object.keys(body);
              const [row] = await tx.query<{ id: string }>(
                `INSERT INTO ${table}(tenant_id,${keys.join(",")}) VALUES($1::uuid,${keys.map((k, i) => "$" + (i + 2) + sqlCast(k)).join(",")}) RETURNING *`,
                [t, ...Object.values(body)],
              );
              await audit(tx, t, res.locals.user.id, "create", table, row.id);
              return row;
            },
          ),
        ),
      ),
    );
    app.patch(
      `${base}/:id`,
      asyncRoute(async (req, res) =>
        res.json(
          await authorized(
            req,
            res,
            ["channels", "workflows"].includes(table)
              ? "settings.manage"
              : "crm.write",
            async (tx, t) => {
              const id = uuid.parse(req.params.id);
              const body = schema.partial().parse(req.body);
              const keys = Object.keys(body);
              if (!keys.length) throw new HttpError(400, "No fields");
              const [row] = await tx.query(
                `UPDATE ${table} SET ${keys.map((k, i) => `${k}=$${i + 3}${sqlCast(k)}`).join(",")},updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid RETURNING *`,
                [t, id, ...Object.values(body)],
              );
              if (!row) throw new HttpError(404, "Record not found");
              await audit(tx, t, res.locals.user.id, "update", table, id);
              return row;
            },
          ),
        ),
      ),
    );
    // No destructive deletion endpoint in phase one. Records remain preserved.
  }
  app.get(
    "/api/t/:tenant/team",
    asyncRoute(async (req, res) => {
      const t = uuid.parse(req.params.tenant);
      await authorized(req, res, "team.manage", async () => true);
      const members = await db.query(
        "SELECT m.id,m.user_id,m.role_id,u.name,u.email,r.name AS role FROM memberships m JOIN users u ON u.id=m.user_id JOIN roles r ON r.id=m.role_id WHERE m.tenant_id=$1::uuid",
        [t],
      );
      const roles = await db.query(
        "SELECT id,name,grants FROM roles WHERE tenant_id=$1::uuid",
        [t],
      );
      res.json({ members, roles });
    }),
  );
  app.post(
    "/api/t/:tenant/roles",
    asyncRoute(async (req, res) => {
      const t = uuid.parse(req.params.tenant);
      const body = z
        .object({
          name: z.string().min(1).max(80),
          grants: z
            .array(
              z.enum([
                "crm.read",
                "crm.write",
                "team.manage",
                "settings.manage",
                "ai.run",
              ]),
            )
            .refine((v) => v.includes("crm.read")),
        })
        .strict()
        .parse(req.body);
      await authorized(req, res, "team.manage", async () => true);
      const result = await db.transaction(async (tx) => {
        const [row] = await tx.query<{ id: string }>(
          "INSERT INTO roles(tenant_id,name,grants) VALUES($1::uuid,$2,$3::text[]) RETURNING *",
          [t, body.name, body.grants],
        );
        await audit(tx, t, res.locals.user.id, "create", "roles", row.id);
        return row;
      });
      res.status(201).json(result);
    }),
  );
  app.patch(
    "/api/t/:tenant/memberships/:id",
    asyncRoute(async (req, res) => {
      const t = uuid.parse(req.params.tenant),
        id = uuid.parse(req.params.id);
      const { role_id } = z.object({ role_id: uuid }).strict().parse(req.body);
      await authorized(req, res, "team.manage", async () => true);
      const row = await db.transaction(async (tx) => {
        // Serialize membership changes per tenant to preserve the final manager.
        await tx.query("SELECT id FROM tenants WHERE id=$1::uuid FOR UPDATE", [
          t,
        ]);
        const [member] = await tx.query<{ user_id: string }>(
          "SELECT user_id FROM memberships WHERE tenant_id=$1::uuid AND id=$2::uuid",
          [t, id],
        );
        if (!member) throw new HttpError(404, "Membership not found");
        if (member.user_id === res.locals.user.id)
          throw new HttpError(400, "A manager cannot change their own role");
        const [updated] = await tx.query(
          "UPDATE memberships SET role_id=$3::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid RETURNING *",
          [t, id, role_id],
        );
        await audit(tx, t, res.locals.user.id, "update", "memberships", id);
        return updated;
      });
      res.json(row);
    }),
  );
  app.patch(
    "/api/t/:tenant",
    asyncRoute(async (req, res) => {
      const t = uuid.parse(req.params.tenant);
      const { name } = z
        .object({ name: z.string().min(2).max(120) })
        .strict()
        .parse(req.body);
      await authorized(req, res, "settings.manage", async () => true);
      const row = await db.transaction(async (tx) => {
        const [updated] = await tx.query(
          "UPDATE tenants SET name=$2 WHERE id=$1::uuid RETURNING *",
          [t, name],
        );
        await audit(tx, t, res.locals.user.id, "update", "tenants", t);
        return updated;
      });
      res.json(row);
    }),
  );
  app.post(
    "/api/t/:tenant/invitations",
    asyncRoute(async (req, res) => {
      const t = uuid.parse(req.params.tenant);
      const body = z
        .object({
          email: z
            .string()
            .email()
            .transform((v) => v.toLowerCase()),
          role_id: uuid,
        })
        .strict()
        .parse(req.body);
      await authorized(req, res, "team.manage", async () => true);
      const code = token();
      await db.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO private.invitations(tenant_id,email,role_id,token_hash,expires_at) VALUES($1::uuid,$2,$3::uuid,$4,now()+interval '48 hours') RETURNING id",
          [t, body.email, body.role_id, digest(code)],
        );
        await audit(tx, t, res.locals.user.id, "invite", "memberships", null);
      });
      res.status(201).json({ invitation_token: code, expires_in_hours: 48 });
    }),
  );
  app.post(
    "/api/invitations/accept",
    asyncRoute(async (req, res) => {
      const { code } = z
        .object({ code: z.string().length(64) })
        .strict()
        .parse(req.body);
      await db.transaction(async (tx) => {
        const [invite] = await tx.query<{
          id: string;
          tenant_id: string;
          role_id: string;
          email: string;
        }>(
          "SELECT * FROM private.invitations WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE",
          [digest(code)],
        );
        if (!invite || invite.email !== res.locals.user.email)
          throw new HttpError(403, "Invalid invitation");
        await tx.query(
          "INSERT INTO memberships(tenant_id,user_id,role_id) VALUES($1::uuid,$2::uuid,$3::uuid) RETURNING id",
          [invite.tenant_id, res.locals.user.id, invite.role_id],
        );
        await tx.query(
          "UPDATE private.invitations SET accepted_at=now() WHERE id=$1::uuid RETURNING id",
          [invite.id],
        );
        await audit(
          tx,
          invite.tenant_id,
          res.locals.user.id,
          "join",
          "memberships",
          null,
        );
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/t/:tenant/settings",
    asyncRoute(async (req, res) =>
      res.json(
        await authorized(
          req,
          res,
          "crm.read",
          async (tx, t) =>
            (
              await tx.query(
                "SELECT * FROM tenant_settings WHERE tenant_id=$1::uuid",
                [t],
              )
            )[0],
        ),
      ),
    ),
  );
  app.patch(
    "/api/t/:tenant/settings",
    asyncRoute(async (req, res) => {
      const b = z
        .object({
          locale: z.enum(["fa", "en"]),
          currency: z.enum(["IRR", "USD", "EUR"]),
          timezone: z.enum(["Asia/Tehran", "UTC"]),
        })
        .strict()
        .parse(req.body);
      res.json(
        await authorized(req, res, "settings.manage", async (tx, t) => {
          const [s] = await tx.query(
            "UPDATE tenant_settings SET locale=$2,currency=$3,timezone=$4 WHERE tenant_id=$1::uuid RETURNING *",
            [t, b.locale, b.currency, b.timezone],
          );
          await audit(
            tx,
            t,
            res.locals.user.id,
            "update",
            "tenant_settings",
            null,
          );
          return s;
        }),
      );
    }),
  );
  app.get(
    "/api/t/:tenant/audit",
    asyncRoute(async (req, res) =>
      res.json(
        await authorized(req, res, "team.manage", (tx, t) =>
          tx.query(
            "SELECT * FROM audit_logs WHERE tenant_id=$1::uuid ORDER BY created_at DESC LIMIT 100",
            [t],
          ),
        ),
      ),
    ),
  );
  if (options.webPath) {
    app.use(express.static(options.webPath));
    app.get("/{*path}", (req, res, next) =>
      req.path.startsWith("/api/")
        ? next()
        : res.sendFile("index.html", { root: options.webPath }),
    );
  }
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
  app.use(
    (
      error: Error & { code?: string },
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      if (error instanceof ZodError)
        return res
          .status(400)
          .json({ error: "Invalid input", issues: error.issues });
      if (error instanceof HttpError)
        return res.status(error.status).json({ error: error.message });
      if (
        (error as any).meta?.code === "23505" ||
        error.code === "23505" ||
        error.message.includes("23505")
      )
        return res.status(409).json({ error: "Record already exists" });
      if (
        (error as any).meta?.code === "23503" ||
        error.code === "23503" ||
        error.message.includes("23503")
      )
        return res.status(400).json({ error: "Invalid related record" });
      console.error(
        "request_failed",
        error.name,
        error.code ?? (error as any).errorCode,
      );
      return res.status(500).json({ error: "Request failed" });
    },
  );
  return app;
}
async function audit(
  tx: Executor,
  t: string,
  u: string,
  action: string,
  resource: string,
  id: string | null,
) {
  await tx.query(
    "INSERT INTO audit_logs(tenant_id,actor_id,action,resource,record_id) VALUES($1::uuid,$2::uuid,$3,$4,$5::uuid) RETURNING id",
    [t, u, action, resource, id],
  );
}

function sqlCast(key: string) {
  return key.endsWith("_id")
    ? "::uuid"
    : ["due_at", "reminder_at"].includes(key)
      ? "::timestamptz"
      : "";
}
