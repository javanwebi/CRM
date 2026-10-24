import type { Executor } from "../../../apps/api/src/database.js";
export async function processOperationJobs(
  tx: Executor,
  t: string,
  user: string,
) {
  const reminders = await tx.query<{ id: string; name: string }>(
    "SELECT id,name FROM tasks WHERE tenant_id=$1::uuid AND owner_id=$2::uuid AND reminder_at<=now() AND reminder_sent_at IS NULL AND status<>'done' ORDER BY reminder_at LIMIT 50 FOR UPDATE SKIP LOCKED",
    [t, user],
  );
  for (const reminder of reminders) {
    await tx.query(
      "INSERT INTO notifications(tenant_id,name,user_id) VALUES($1::uuid,$2,$3::uuid) RETURNING id",
      [t, reminder.name, user],
    );
    await tx.query(
      "UPDATE tasks SET reminder_sent_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid RETURNING id",
      [t, reminder.id],
    );
    await audit(tx, t, user, "remind", "tasks", reminder.id);
  }
  const jobs = await tx.query<{
    id: string;
    workflow_id: string;
    conversation_id: string;
    requested_by: string;
    attempts: number;
  }>(
    "SELECT * FROM operation_jobs WHERE tenant_id=$1::uuid AND requested_by=$2::uuid AND status IN ('pending','retry') AND available_at<=now() ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED",
    [t, user],
  );
  for (const job of jobs) {
    await tx.query("SAVEPOINT operation_job");
    try {
      const [w] = await tx.query<{
        name: string;
        action: string;
        condition_status: string;
        enabled: boolean;
      }>("SELECT * FROM workflows WHERE tenant_id=$1::uuid AND id=$2::uuid", [
        t,
        job.workflow_id,
      ]);
      const [c] = await tx.query<{ status: string; name: string }>(
        "SELECT status,name FROM conversations WHERE tenant_id=$1::uuid AND id=$2::uuid",
        [t, job.conversation_id],
      );
      const [grant] = await tx.query<{ allowed: boolean }>(
        "SELECT private.can($1::uuid,'crm.write') AS allowed",
        [t],
      );
      if (!grant.allowed) throw Error("permission_revoked");
      if (!w?.enabled) throw Error("workflow_disabled");
      if (c && c.status === w.condition_status) {
        if (w.action === "task.create")
          await tx.query(
            "INSERT INTO tasks(tenant_id,name,description) VALUES($1::uuid,$2,$3) RETURNING id",
            [t, w.name, c.name],
          );
        else
          await tx.query(
            "INSERT INTO notifications(tenant_id,name,user_id) VALUES($1::uuid,$2,$3::uuid) RETURNING id",
            [t, w.name, job.requested_by],
          );
      }
      await tx.query(
        "UPDATE operation_jobs SET status='completed',attempts=attempts+1,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid RETURNING id",
        [t, job.id],
      );
      await audit(tx, t, user, "complete", "operation_jobs", job.id);
    } catch {
      await tx.query("ROLLBACK TO SAVEPOINT operation_job");
      await tx.query(
        "UPDATE operation_jobs SET status=CASE WHEN attempts>=2 THEN 'dead' ELSE 'retry' END,attempts=attempts+1,last_error='Execution denied or failed',available_at=now()+interval '30 seconds',updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid RETURNING id",
        [t, job.id],
      );
    }
    await tx.query("RELEASE SAVEPOINT operation_job");
  }
  return { processed: jobs.length };
}
async function audit(
  tx: Executor,
  t: string,
  user: string,
  action: string,
  resource: string,
  id: string,
) {
  await tx.query(
    "INSERT INTO audit_logs(tenant_id,actor_id,action,resource,record_id) VALUES($1::uuid,$2::uuid,$3,$4,$5::uuid) RETURNING id",
    [t, user, action, resource, id],
  );
}
