import request from "supertest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../apps/api/src/app";
import { database } from "../apps/api/src/database";
if (process.env.DATABASE_ENV !== "test")
  throw new Error(
    "Native smoke only runs against an explicitly designated test database",
  );
const db = database();
const client = request.agent(createApp(db));
try {
  const registration = await client
    .post("/api/auth/register")
    .send({
      name: "Native smoke",
      email: `native-${randomUUID()}@example.test`,
      password: "NativeSmokePassword123!",
    });
  assert.equal(registration.status, 201, JSON.stringify(registration.body));
  const organization = await client
    .post("/api/tenants")
    .send({ name: "Native test company" });
  assert.equal(organization.status, 201, JSON.stringify(organization.body));
  const id = organization.body.id;
  const list = await client.get("/api/tenants");
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assert.equal(list.body.length, 1);
  const account = await client
    .post(`/api/t/${id}/accounts`)
    .send({ name: "Native customer" });
  assert.equal(account.status, 201, JSON.stringify(account.body));
  const contact = await client
    .post(`/api/t/${id}/contacts`)
    .send({ name: "Native contact", account_id: account.body.id });
  assert.equal(contact.status, 201, JSON.stringify(contact.body));
  const task = await client
    .post(`/api/t/${id}/tasks`)
    .send({ name: "Native task", due_at: "2027-01-01T12:00:00.000Z" });
  assert.equal(task.status, 201, JSON.stringify(task.body));
  const updated = await client
    .patch(`/api/t/${id}/contacts/${contact.body.id}`)
    .send({ account_id: null });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  const dashboard = await client.get(`/api/t/${id}/dashboard`);
  assert.equal(dashboard.status, 200, JSON.stringify(dashboard.body));
  assert.equal(dashboard.body.accounts, 1);
  console.log(
    "Native Prisma/PostgreSQL auth, organization, UUID, nullable relationship and timestamp CRUD smoke passed",
  );
} finally {
  await db.disconnect?.();
}
