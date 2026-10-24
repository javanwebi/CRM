import { database, scoped } from "../../api/src/database.js";
import { processOperationJobs } from "../../../packages/shared/src/operation-jobs.js";
import { Queue, Worker } from "bullmq";
// PostgreSQL is the durable source of truth. BullMQ only schedules scans.
export function startOperationsWorker(redis: string) {
  const db = database();
  const connection = { url: redis };
  const queue = new Queue("crm-operations", { connection });
  const worker = new Worker(
    "crm-operations",
    async () => {
      const contexts = await db.query<{
        tenant_id: string;
        requested_by: string;
      }>(
        "SELECT tenant_id,requested_by FROM operation_jobs WHERE status IN ('pending','retry') AND available_at<=now() UNION SELECT tenant_id,owner_id AS requested_by FROM tasks WHERE reminder_at<=now() AND reminder_sent_at IS NULL AND owner_id IS NOT NULL AND status<>'done' LIMIT 100",
      );
      for (const c of contexts)
        await scoped(db, c.requested_by, async (tx) => {
          const [grant] = await tx.query<{ allowed: boolean }>(
            "SELECT private.can($1::uuid,'crm.write') AS allowed",
            [c.tenant_id],
          );
          if (grant.allowed)
            await processOperationJobs(tx, c.tenant_id, c.requested_by);
        });
    },
    { connection, concurrency: 1 },
  );
  worker.on("failed", () => console.error("operation_scan_failed"));
  void queue
    .upsertJobScheduler(
      "operations-scan",
      { every: 15000 },
      {
        name: "scan",
        opts: {
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: 20,
          removeOnFail: 50,
        },
      },
    )
    .catch(() => console.error("operation_schedule_failed"));
  return async () => {
    await worker.close();
    await queue.close();
    await db.disconnect?.();
  };
}
