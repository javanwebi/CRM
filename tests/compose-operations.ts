import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
if (process.env.QUEUE_SMOKE_ALLOWED !== "test")
  throw Error("Test environment required");
const origin = "http://localhost:3000";
let cookie = "";
async function call(path: string, body?: unknown) {
  const response = await fetch(origin + "/api" + path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.headers.get("set-cookie"))
    cookie = response.headers.get("set-cookie")!.split(";")[0];
  const data = await response.json();
  assert.ok(response.ok, JSON.stringify(data));
  return data;
}
await call("/auth/register", {
  name: "Compose ops",
  email: `compose-${randomUUID()}@example.test`,
  password: "ComposeOperations123!",
});
const tenant = await call("/tenants", { name: "Compose operations" });
const base = `/t/${tenant.id}`;
const channel = await call(base + "/channels", {
  name: "Internal",
  kind: "internal",
});
await call(base + "/workflows", {
  name: "Worker generated task",
  trigger: "conversation.created",
  action: "task.create",
  enabled: true,
});
await call(base + "/conversations", {
  name: "Compose conversation",
  channel_id: channel.id,
});
let verified = false;
for (let i = 0; i < 15; i++) {
  const r = await call(base + "/tasks?search=Worker%20generated");
  if (r.total === 1) {
    verified = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
assert.ok(
  verified,
  "BullMQ scanner must consume durable PostgreSQL workflow job",
);
console.log("Real BullMQ → scoped PostgreSQL → task workflow passed");
