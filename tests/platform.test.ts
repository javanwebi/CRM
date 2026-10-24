import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import request from "supertest";
import { createApp } from "../apps/api/src/app";
import { scoped, type Database, type Executor } from "../apps/api/src/database";
let pg: PGlite;
let db: Database;
let app: ReturnType<typeof createApp>;
let a: ReturnType<typeof request.agent>, b: ReturnType<typeof request.agent>;
let ta: string, tb: string, ua: string, ub: string, account: string;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec("CREATE ROLE anon;CREATE ROLE authenticated;");
  await pg.exec(
    readFileSync(
      new URL("../packages/database/foundation.sql", import.meta.url),
      "utf8",
    ),
  );
  await pg.exec(
    readFileSync(
      new URL("../packages/database/backend-permissions.sql", import.meta.url),
      "utf8",
    ),
  );
  await pg.exec(
    readFileSync(
      new URL("../packages/database/hardening.sql", import.meta.url),
      "utf8",
    ),
  );
  await pg.exec(
    readFileSync(
      new URL("../packages/database/writer-audit.sql", import.meta.url),
      "utf8",
    ),
  );
  await pg.exec(
    readFileSync(
      new URL("../packages/database/operations.sql", import.meta.url),
      "utf8",
    ),
  );
  const executor: Executor = {
    query: async <T>(sql: string, values: unknown[] = []) => {
      const result = await pg.query<T>(sql, values);
      return result.rows;
    },
  };
  db = {
    ...executor,
    transaction: async (fn) => {
      await pg.exec("BEGIN");
      try {
        const r = await fn(executor);
        await pg.exec("COMMIT");
        return r;
      } catch (e) {
        await pg.exec("ROLLBACK");
        throw e;
      }
    },
  };
  app = createApp(db, { origin: "http://localhost" });
  a = request.agent(app);
  b = request.agent(app);
});
afterAll(async () => pg.close());
describe.sequential(
  "Real PostgreSQL engine: authentication, RLS, API and sales",
  () => {
    it("requires authentication", async () => {
      expect((await request(app).get("/api/tenants")).status).toBe(401);
    });
    it("registers users with hashed passwords and private cookies", async () => {
      const ar = await a.post("/api/auth/register").send({
        name: "Alice",
        email: "alice@example.test",
        password: "LongSafePassword123!",
      });
      expect(ar.status).toBe(201);
      ua = ar.body.user.id;
      expect(ar.headers["set-cookie"][0]).toContain("HttpOnly");
      expect(ar.body.user.password_hash).toBeUndefined();
      const br = await b.post("/api/auth/register").send({
        name: "Bob",
        email: "bob@example.test",
        password: "AnotherSafePassword123!",
      });
      expect(br.status).toBe(201);
      ub = br.body.user.id;
    });
    it("rejects invalid passwords and untrusted origins", async () => {
      expect(
        (
          await request(app).post("/api/auth/login").send({
            email: "alice@example.test",
            password: "WrongPassword123!",
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await a
            .post("/api/tenants")
            .set("Origin", "https://attacker.test")
            .send({ name: "bad" })
        ).status,
      ).toBe(403);
    });
    it("creates isolated organizations and default pipelines atomically", async () => {
      const ar = await a.post("/api/tenants").send({ name: "Company A" });
      expect(ar.status).toBe(201);
      ta = ar.body.id;
      const br = await b.post("/api/tenants").send({ name: "Company B" });
      expect(br.status).toBe(201);
      tb = br.body.id;
      expect((await a.get("/api/tenants")).body.map((t: any) => t.id)).toEqual([
        ta,
      ]);
    });
    it("validates input and supports customer create, read, update, search and pagination", async () => {
      expect(
        (
          await a
            .post(`/api/t/${ta}/accounts`)
            .send({ name: "bad", tenant_id: tb })
        ).status,
      ).toBe(400);
      const r = await a
        .post(`/api/t/${ta}/accounts`)
        .send({ name: "Acme", email: "sales@acme.test" });
      expect(r.status).toBe(201);
      account = r.body.id;
      const updated = await a
        .patch(`/api/t/${ta}/accounts/${account}`)
        .send({ phone: "123456789" });
      expect(updated.status).toBe(200);
      expect(updated.body.phone).toBe("123456789");
      const list = await a.get(`/api/t/${ta}/accounts?search=Acme&limit=1`);
      expect(list.status).toBe(200);
      expect(list.body.total).toBe(1);
      expect(list.body.data[0].id).toBe(account);
      expect((await a.get(`/api/t/${ta}/accounts/${account}`)).status).toBe(
        200,
      );
    });
    it("blocks cross-company API reads and writes", async () => {
      expect((await b.get(`/api/t/${ta}/accounts`)).status).toBe(403);
      expect(
        (
          await b
            .patch(`/api/t/${ta}/accounts/${account}`)
            .send({ name: "intrusion" })
        ).status,
      ).toBe(403);
    });
    it("proves RLS rejects direct cross-company SELECT, UPDATE and INSERT without API filters", async () => {
      const rows = await scoped(db, ub, (tx) =>
        tx.query("SELECT * FROM accounts"),
      );
      expect(rows).toHaveLength(0);
      const changed = await scoped(db, ub, (tx) =>
        tx.query("UPDATE accounts SET name=$1 WHERE id=$2 RETURNING id", [
          "intrusion",
          account,
        ]),
      );
      expect(changed).toHaveLength(0);
      await expect(
        scoped(db, ub, (tx) =>
          tx.query(
            "INSERT INTO accounts(tenant_id,name) VALUES($1,$2) RETURNING id",
            [ta, "intrusion"],
          ),
        ),
      ).rejects.toThrow();
      const original = await db.query<{ name: string }>(
        "SELECT name FROM accounts WHERE id=$1",
        [account],
      );
      expect(original[0].name).toBe("Acme");
    });
    it("blocks cross-tenant relationship forgery in database constraints", async () => {
      const r = await b
        .post(`/api/t/${tb}/contacts`)
        .send({ name: "Forged", account_id: account });
      expect(r.status).toBe(400);
    });
    it("moves an opportunity between valid pipeline stages and audits the change", async () => {
      const pipelines = await a.get(`/api/t/${ta}/pipelines`);
      const stages = await a.get(`/api/t/${ta}/pipeline_stages?sort=name`);
      expect(stages.body.data).toHaveLength(5);
      const first = stages.body.data[0],
        second = stages.body.data[1];
      const r = await a.post(`/api/t/${ta}/deals`).send({
        name: "Contract",
        pipeline_id: pipelines.body.data[0].id,
        stage_id: first.id,
        account_id: account,
        value: 240000,
      });
      expect(r.status).toBe(201);
      const moved = await a
        .patch(`/api/t/${ta}/deals/${r.body.id}`)
        .send({ stage_id: second.id });
      expect(moved.status).toBe(200);
      expect(moved.body.stage_id).toBe(second.id);
      const audit = await a.get(`/api/t/${ta}/audit`);
      expect(
        audit.body.some(
          (r: any) => r.action === "update" && r.resource === "deals",
        ),
      ).toBe(true);
    });
    it("invites an email-bound read-only member; enforces database and API permissions", async () => {
      const role = await a
        .post(`/api/t/${ta}/roles`)
        .send({ name: "Viewer", grants: ["crm.read"] });
      expect(role.status).toBe(201);
      const invite = await a
        .post(`/api/t/${ta}/invitations`)
        .send({ email: "bob@example.test", role_id: role.body.id });
      expect(invite.status).toBe(201);
      expect(
        (
          await a
            .post("/api/invitations/accept")
            .send({ code: invite.body.invitation_token })
        ).status,
      ).toBe(403);
      expect(
        (
          await b
            .post("/api/invitations/accept")
            .send({ code: invite.body.invitation_token })
        ).status,
      ).toBe(200);
      expect((await b.get(`/api/t/${ta}/accounts`)).status).toBe(200);
      expect(
        (await b.post(`/api/t/${ta}/accounts`).send({ name: "denied" })).status,
      ).toBe(403);
      await expect(
        scoped(db, ub, (tx) =>
          tx.query(
            "INSERT INTO accounts(tenant_id,name) VALUES($1,$2) RETURNING id",
            [ta, "denied"],
          ),
        ),
      ).rejects.toThrow();
    });
    it("keeps AI operations disabled and audit entries immutable", async () => {
      await expect(
        scoped(db, ua, (tx) =>
          tx.query(
            "INSERT INTO ai_runs(tenant_id,requested_by) VALUES($1,$2) RETURNING id",
            [ta, ua],
          ),
        ),
      ).rejects.toThrow();
      await expect(
        scoped(db, ua, (tx) => tx.query("DELETE FROM audit_logs RETURNING id")),
      ).rejects.toThrow();
    });
    it("manages another member role without allowing self-demotion or viewer escalation", async () => {
      const team = await a.get(`/api/t/${ta}/team`);
      const self = team.body.members.find((m: any) => m.user_id === ua),
        other = team.body.members.find((m: any) => m.user_id === ub);
      const owner = team.body.roles.find((r: any) => r.name === "Owner"),
        viewer = team.body.roles.find((r: any) => r.name === "Viewer");
      expect(
        (
          await a
            .patch(`/api/t/${ta}/memberships/${self.id}`)
            .send({ role_id: viewer.id })
        ).status,
      ).toBe(400);
      expect(
        (
          await b
            .patch(`/api/t/${ta}/memberships/${other.id}`)
            .send({ role_id: owner.id })
        ).status,
      ).toBe(403);
      expect(
        (
          await a
            .patch(`/api/t/${ta}/memberships/${other.id}`)
            .send({ role_id: owner.id })
        ).status,
      ).toBe(200);
      expect((await b.get(`/api/t/${ta}/team`)).status).toBe(200);
      expect(
        (
          await a
            .patch(`/api/t/${ta}/memberships/${other.id}`)
            .send({ role_id: viewer.id })
        ).status,
      ).toBe(200);
    });
    it("filters tasks in the database before pagination", async () => {
      await a
        .post(`/api/t/${ta}/tasks`)
        .send({ name: "Open task", status: "todo" });
      await a
        .post(`/api/t/${ta}/tasks`)
        .send({ name: "Finished task", status: "done" });
      const list = await a.get(`/api/t/${ta}/tasks?status=done&limit=1`);
      expect(list.status).toBe(200);
      expect(list.body.total).toBe(1);
      expect(list.body.data[0].name).toBe("Finished task");
    });
    it("enforces composite tenant relationships in AI infrastructure tables", async () => {
      const [tool] = await db.query<{ id: string }>(
        "INSERT INTO tool_registry(tenant_id,name,permission) VALUES($1,$2,$3) RETURNING id",
        [ta, "review", "ai.run"],
      );
      const [role] = await db.query<{ id: string }>(
        "SELECT id FROM roles WHERE tenant_id=$1 LIMIT 1",
        [tb],
      );
      await expect(
        db.query(
          "INSERT INTO tool_permissions(tenant_id,tool_id,role_id) VALUES($1,$2,$3) RETURNING id",
          [tb, tool.id, role.id],
        ),
      ).rejects.toThrow();
      await expect(
        db.query(
          "INSERT INTO ai_runs(tenant_id,requested_by) VALUES($1,$2) RETURNING id",
          [tb, ua],
        ),
      ).rejects.toThrow();
    });
    it("lets a non-manager writer create records and transactional audit entries", async () => {
      const editor = await a
        .post(`/api/t/${ta}/roles`)
        .send({ name: "Editor", grants: ["crm.read", "crm.write"] });
      expect(editor.status).toBe(201);
      const c = request.agent(app);
      const signup = await c.post("/api/auth/register").send({
        name: "Carla",
        email: "carla@example.test",
        password: "WriterPassword123!",
      });
      expect(signup.status).toBe(201);
      const invitation = await a
        .post(`/api/t/${ta}/invitations`)
        .send({ email: "carla@example.test", role_id: editor.body.id });
      expect(
        (
          await c
            .post("/api/invitations/accept")
            .send({ code: invitation.body.invitation_token })
        ).status,
      ).toBe(200);
      expect(
        (await c.post(`/api/t/${ta}/tasks`).send({ name: "Editor task" }))
          .status,
      ).toBe(201);
      expect((await c.get(`/api/t/${ta}/team`)).status).toBe(403);
      const logs = await scoped(db, signup.body.user.id, (tx) =>
        tx.query("SELECT * FROM audit_logs"),
      );
      expect(logs.every((r: any) => r.actor_id === signup.body.user.id)).toBe(
        true,
      );
      expect(logs.length).toBeGreaterThan(0);
    });
    it("returns real dashboard metrics and revokes logout sessions", async () => {
      const r = await a.get(`/api/t/${ta}/dashboard`);
      expect(r.status).toBe(200);
      expect(r.body.accounts).toBe(1);
      expect(r.body.totals[0].value).toBe("240000.00");
      expect((await a.post("/api/auth/logout")).status).toBe(200);
      expect((await a.get("/api/me")).status).toBe(401);
    });
  },
);

it("dedicated backend login can bootstrap while direct customer SQL remains denied", async () => {
  const restricted: Database = {
    query: (sql, values) =>
      db.transaction(async (tx) => {
        await tx.query("SET LOCAL ROLE crm_server");
        return tx.query(sql, values);
      }),
    transaction: (fn) =>
      db.transaction(async (tx) => {
        await tx.query("SET LOCAL ROLE crm_server");
        return fn(tx);
      }),
  };
  const client = request.agent(createApp(restricted));
  expect(
    (
      await client.post("/api/auth/register").send({
        name: "Server role",
        email: "server-role@example.test",
        password: "LongServerPassword123!",
      })
    ).status,
  ).toBe(201);
  const organization = await client
    .post("/api/tenants")
    .send({ name: "Least privilege" });
  expect(organization.status).toBe(201);
  const customer = await client
    .post(`/api/t/${organization.body.id}/accounts`)
    .send({ name: "Scoped write" });
  expect(customer.status).toBe(201);
  await expect(restricted.query("SELECT * FROM accounts")).rejects.toThrow();
});

describe.sequential("Phase two operations on PostgreSQL", () => {
  let outsider: ReturnType<typeof request.agent>,
    outsiderUser: string,
    outsiderTenant: string;
  beforeAll(async () => {
    outsider = request.agent(app);
    const r = await outsider.post("/api/auth/register").send({
      name: "Outside",
      email: "outside@example.test",
      password: "OutsidePassword123!",
    });
    outsiderUser = r.body.user.id;
    outsiderTenant = (
      await outsider.post("/api/tenants").send({ name: "Outside organization" })
    ).body.id;
    expect(
      (
        await a.post("/api/auth/login").send({
          email: "alice@example.test",
          password: "LongSafePassword123!",
        })
      ).status,
    ).toBe(200);
  });
  let channel: string, conversation: string, workflow: string, job: string;
  it("creates a disabled channel and prevents external delivery", async () => {
    const r = await a
      .post(`/api/t/${ta}/channels`)
      .send({ name: "Support", kind: "email" });
    expect(r.status).toBe(201);
    channel = r.body.id;
    expect(r.body.enabled).toBe(false);
    expect(
      (
        await a
          .patch(`/api/t/${ta}/channels/${channel}`)
          .send({ enabled: true })
      ).status,
    ).toBe(400);
    expect(
      (
        await outsider
          .post(`/api/t/${ta}/channels`)
          .send({ name: "Foreign", kind: "sms" })
      ).status,
    ).toBe(403);
  });
  it("links conversation to customer and blocks cross-tenant references", async () => {
    const r = await a.post(`/api/t/${ta}/conversations`).send({
      name: "Renewal discussion",
      channel_id: channel,
      account_id: account,
    });
    expect(r.status).toBe(201);
    conversation = r.body.id;
    expect(
      (
        await outsider
          .post(`/api/t/${outsiderTenant}/conversations`)
          .send({ name: "Forged", channel_id: channel })
      ).status,
    ).toBe(400);
    expect(
      (
        await a
          .post(`/api/t/${ta}/conversations/${conversation}/send`)
          .send({ body: "Do not send" })
      ).status,
    ).toBe(409);
  });
  it("stores internal notes and drafts, validates participants, and scopes the inbox", async () => {
    expect(
      (
        await a.post(`/api/t/${ta}/messages`).send({
          conversation_id: conversation,
          body: "Please follow up next week",
          direction: "internal",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await a.post(`/api/t/${ta}/participants`).send({
          name: "Customer",
          address: "customer@example.test",
          conversation_id: conversation,
        })
      ).status,
    ).toBe(201);
    expect(
      (await a.get(`/api/t/${ta}/conversations/${conversation}/thread`)).body
        .messages,
    ).toHaveLength(1);
    expect((await outsider.get(`/api/t/${ta}/inbox`)).status).toBe(403);
    expect(
      (await outsider.get(`/api/t/${outsiderTenant}/inbox`)).body.conversations,
    ).toHaveLength(0);
    await scoped(db, outsiderUser, async (tx) => {
      expect(
        await tx.query(
          "SELECT * FROM messages WHERE conversation_id=$1::uuid",
          [conversation],
        ),
      ).toHaveLength(0);
      expect(
        await tx.query(
          "UPDATE conversations SET status=$2 WHERE id=$1::uuid RETURNING id",
          [conversation, "closed"],
        ),
      ).toHaveLength(0);
    });
  });
  it("searches only current tenant and assembles customer 360", async () => {
    const r = await a.get(`/api/t/${ta}/search?q=Renewal`);
    expect(r.status).toBe(200);
    expect(r.body.some((x: any) => x.id === conversation)).toBe(true);
    expect(
      (await outsider.get(`/api/t/${outsiderTenant}/search?q=Renewal`)).body,
    ).toHaveLength(0);
    const detail = await a.get(`/api/t/${ta}/customers/${account}/360`);
    expect(
      detail.body.conversations.some((x: any) => x.id === conversation),
    ).toBe(true);
  });
  it("records call outcomes, scheduled tasks and extractive summaries", async () => {
    expect(
      (
        await a.post(`/api/t/${ta}/call_logs`).send({
          name: "Renewal call",
          account_id: account,
          outcome: "follow_up",
          duration_seconds: 85,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await a.post(`/api/t/${ta}/tasks`).send({
          name: "Follow up renewal",
          account_id: account,
          due_at: "2026-11-01T10:00:00.000Z",
          reminder_at: "2026-11-01T09:00:00.000Z",
        })
      ).status,
    ).toBe(201);
    expect(
      (await a.get(`/api/t/${ta}/calendar`)).body.some(
        (x: any) => x.name === "Follow up renewal",
      ),
    ).toBe(true);
    const r = await a.post(
      `/api/t/${ta}/conversations/${conversation}/summary`,
    );
    expect(r.status).toBe(200);
    expect(r.body.mode).toBe("extractive");
    expect(r.body.summary).toContain("follow up");
  });
  it("executes workflow once despite duplicate enqueue and repeated drains", async () => {
    const w = await a.post(`/api/t/${ta}/workflows`).send({
      name: "Renewal follow-up workflow",
      trigger: "manual",
      action: "notification.create",
      enabled: true,
    });
    expect(w.status).toBe(201);
    workflow = w.body.id;
    const body = {
      conversation_id: conversation,
      idempotency_key: "renewal-event-0001",
    };
    const j = await a
      .post(`/api/t/${ta}/workflows/${workflow}/enqueue`)
      .send(body);
    expect(j.status).toBe(202);
    job = j.body.id;
    expect(
      (await a.post(`/api/t/${ta}/workflows/${workflow}/enqueue`).send(body))
        .body.id,
    ).toBe(job);
    expect((await a.post(`/api/t/${ta}/jobs/process`)).status).toBe(200);
    expect((await a.post(`/api/t/${ta}/jobs/process`)).body.processed).toBe(0);
    const notifications = await a.get(`/api/t/${ta}/notifications`);
    expect(
      notifications.body.filter(
        (x: any) => x.name === "Renewal follow-up workflow",
      ),
    ).toHaveLength(1);
    const n = notifications.body[0];
    expect(
      (await a.post(`/api/t/${ta}/notifications/${n.id}/read`)).body.data[0]
        .read_at,
    ).toBeTruthy();
    expect(
      (await outsider.get(`/api/t/${outsiderTenant}/notifications`)).body,
    ).toHaveLength(0);
  });
  it("automatically enqueues enabled conversation triggers and makes task effects atomic", async () => {
    const w = await a.post(`/api/t/${ta}/workflows`).send({
      name: "Automatic follow-up",
      trigger: "conversation.created",
      action: "task.create",
      enabled: true,
    });
    expect(w.status).toBe(201);
    const r = await a
      .post(`/api/t/${ta}/conversations`)
      .send({ name: "Triggered conversation", channel_id: channel });
    expect(r.status).toBe(201);
    expect((await a.post(`/api/t/${ta}/jobs/process`)).body.processed).toBe(1);
    expect(
      (await a.get(`/api/t/${ta}/tasks?search=Automatic`)).body.total,
    ).toBe(1);
  });
  it("retries disabled workflows then moves to dead letter without effects", async () => {
    const w = await a.post(`/api/t/${ta}/workflows`).send({
      name: "Must never execute",
      trigger: "manual",
      action: "task.create",
    });
    const j = await a.post(`/api/t/${ta}/workflows/${w.body.id}/enqueue`).send({
      conversation_id: conversation,
      idempotency_key: "retry-disabled-0001",
    });
    expect(j.status).toBe(202);
    for (let i = 0; i < 3; i++) {
      expect((await a.post(`/api/t/${ta}/jobs/process`)).status).toBe(200);
      await db.query(
        "UPDATE operation_jobs SET available_at=now()-interval '1 second' WHERE id=$1::uuid RETURNING id",
        [j.body.id],
      );
    }
    const jobs = await a.get(`/api/t/${ta}/jobs`);
    expect(jobs.body.find((x: any) => x.id === j.body.id).status).toBe("dead");
    expect(
      (await a.get(`/api/t/${ta}/tasks?search=Must%20never`)).body.total,
    ).toBe(0);
  });
});
