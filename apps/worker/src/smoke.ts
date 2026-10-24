import { Queue, QueueEvents } from "bullmq";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
if (process.env.QUEUE_SMOKE_ALLOWED !== "test")
  throw new Error(
    "Queue smoke is only allowed in an explicit test environment",
  );
const connection = { url: process.env.REDIS_URL ?? "redis://redis:6379" };
const queue = new Queue("crm-ai", { connection });
const events = new QueueEvents("crm-ai", { connection });
try {
  await events.waitUntilReady();
  const job = await queue.add("disabled-execution-smoke", {
    tenantId: randomUUID(),
    userId: randomUUID(),
    runId: randomUUID(),
  });
  let reason = "";
  try {
    await job.waitUntilFinished(events, 15000);
  } catch (error) {
    reason = (error as Error).message;
  }
  assert.match(reason, /AI execution is disabled in phase one/);
  console.log(
    "Redis/BullMQ worker received the job and rejected execution as required",
  );
} finally {
  await events.close();
  await queue.close();
}
