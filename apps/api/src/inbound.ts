import { createHmac, timingSafeEqual } from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import { scoped, type Database } from "./database.js";
const configSchema = z.record(
  z.string().uuid(),
  z
    .object({
      tenantId: z.string().uuid(),
      userId: z.string().uuid(),
      secret: z.string().min(32),
    })
    .strict(),
);
const eventSchema = z
  .object({
    event_id: z.string().min(8).max(200),
    conversation_id: z.string().uuid(),
    body: z.string().min(1).max(20000),
    sender: z.string().min(1).max(254),
  })
  .strict();
/** Generic signed adapter ingress; provider bridges normalize their verified events here. */
export function installInbound(app: Express, db: Database) {
  app.post("/api/inbound/:channel", async (req, res, next) => {
    try {
      const configs = configSchema.parse(
        JSON.parse(process.env.INBOUND_CHANNELS_JSON ?? "{}"),
      );
      const config = configs[req.params.channel];
      if (!config)
        return res.status(404).json({ error: "Channel not configured" });
      const timestamp = String(req.headers["x-crm-timestamp"] ?? "");
      const signature = String(req.headers["x-crm-signature"] ?? "");
      if (
        !/^\d+$/.test(timestamp) ||
        Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
        !/^[a-f0-9]{64}$/.test(signature)
      )
        return res.status(401).json({ error: "Invalid webhook signature" });
      const raw = (req as typeof req & { rawBody?: Buffer }).rawBody;
      if (!raw) return res.status(400).json({ error: "Missing webhook body" });
      const expected = createHmac("sha256", config.secret)
        .update(timestamp + ".")
        .update(raw)
        .digest();
      if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
        return res.status(401).json({ error: "Invalid webhook signature" });
      const b = eventSchema.parse(req.body);
      const result = await scoped(db, config.userId, async (tx) => {
        const [access] = await tx.query<{ allowed: boolean }>(
          "SELECT private.can($1::uuid,'crm.write') AS allowed",
          [config.tenantId],
        );
        if (!access.allowed) return null;
        const [conversation] = await tx.query(
          "SELECT id FROM conversations WHERE tenant_id=$1::uuid AND id=$2::uuid AND channel_id=$3::uuid",
          [config.tenantId, b.conversation_id, req.params.channel],
        );
        if (!conversation) return null;
        const [message] = await tx.query(
          "INSERT INTO messages(tenant_id,name,conversation_id,body,direction,provider_event_id) VALUES($1::uuid,$2,$3::uuid,$4,'inbound',$5) ON CONFLICT(tenant_id,conversation_id,provider_event_id) DO NOTHING RETURNING id",
          [config.tenantId, b.sender, b.conversation_id, b.body, b.event_id],
        );
        if (message)
          await tx.query(
            "INSERT INTO audit_logs(tenant_id,actor_id,action,resource,record_id) VALUES($1::uuid,$2::uuid,'receive','messages',$3::uuid) RETURNING id",
            [config.tenantId, config.userId, message.id],
          );
        return { received: true, duplicate: !message };
      });
      if (!result) return res.status(403).json({ error: "Permission denied" });
      return res.json(result);
    } catch (e) {
      next(e);
    }
  });
}
