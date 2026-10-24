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
  const registration = await client.post("/api/auth/register").send({
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
  const channel = await client
    .post(`/api/t/${id}/channels`)
    .send({ name: "Native support", kind: "email" });
  assert.equal(channel.status, 201, JSON.stringify(channel.body));
  const workflow = await client
    .post(`/api/t/${id}/workflows`)
    .send({
      name: "Native follow-up",
      trigger: "conversation.created",
      action: "task.create",
      enabled: true,
    });
  assert.equal(workflow.status, 201, JSON.stringify(workflow.body));
  const conversation = await client
    .post(`/api/t/${id}/conversations`)
    .send({
      name: "Native conversation",
      channel_id: channel.body.id,
      account_id: account.body.id,
    });
  assert.equal(conversation.status, 201, JSON.stringify(conversation.body));
  const message = await client
    .post(`/api/t/${id}/messages`)
    .send({ conversation_id: conversation.body.id, body: "Native draft" });
  assert.equal(message.status, 201, JSON.stringify(message.body));
  const drain = await client.post(`/api/t/${id}/jobs/process`);
  assert.equal(drain.status, 200, JSON.stringify(drain.body));
  assert.equal(drain.body.processed, 1);
  assert.equal(
    (await client.get(`/api/t/${id}/tasks?search=Native%20follow-up`)).body
      .total,
    1,
  );
  const dashboard = await client.get(`/api/t/${id}/dashboard`);
  assert.equal(dashboard.status, 200, JSON.stringify(dashboard.body));
  assert.equal(dashboard.body.accounts, 1);
  console.log(
    "Native Prisma/PostgreSQL auth, organization, UUID, nullable relationship and timestamp CRUD smoke passed",
  );
} finally {
  await db.disconnect?.();
}
