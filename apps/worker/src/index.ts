import { Worker, UnrecoverableError } from "bullmq";
import { z } from "zod";
const env = z.object({ REDIS_URL: z.string().url() }).parse(process.env);
const worker = new Worker(
  "crm-ai",
  async (job) => {
    const parsed = z
      .object({
        tenantId: z.string().uuid(),
        userId: z.string().uuid(),
        runId: z.string().uuid(),
      })
      .strict()
      .safeParse(job.data);
    if (!parsed.success) throw new UnrecoverableError("Invalid tenant context");
    // Fail closed. A queue payload is not proof of authorization.
    // Phase two must reload membership, run, tool permission and approval from DB.
    throw new UnrecoverableError("AI execution is disabled in phase one");
  },
  { connection: { url: env.REDIS_URL }, concurrency: 2 },
);
worker.on("failed", (job, error) =>
  console.error("job_failed", job?.id, error.message),
);
process.on("SIGTERM", () => {
  void worker.close().then(() => process.exit(0));
});
