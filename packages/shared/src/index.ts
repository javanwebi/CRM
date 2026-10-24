import { z } from "zod";
export const uuid = z.string().uuid();
export const credentials = z
  .object({
    email: z
      .string()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(12).max(128),
    name: z.string().min(1).max(120).optional(),
  })
  .strict();
export const paging = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(100).default(""),
  status: z.string().max(30).default(""),
  sort: z.enum(["name", "created_at"]).default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
});
export const resources = {
  channels: z.object({
    name: z.string().min(1).max(200),
    kind: z.enum(["email", "sms", "whatsapp", "internal"]),
    enabled: z.literal(false).default(false),
  }),
  conversations: z.object({
    name: z.string().min(1).max(200),
    channel_id: uuid,
    account_id: uuid.nullable().default(null),
    contact_id: uuid.nullable().default(null),
    deal_id: uuid.nullable().default(null),
    status: z.enum(["open", "pending", "closed"]).default("open"),
  }),
  participants: z.object({
    name: z.string().min(1).max(200),
    conversation_id: uuid,
    address: z.string().min(1).max(254),
  }),
  messages: z.object({
    name: z.string().min(1).max(200).default("Draft"),
    conversation_id: uuid,
    body: z.string().min(1).max(20000),
    direction: z.enum(["draft", "internal"]).default("draft"),
  }),
  call_logs: z.object({
    name: z.string().min(1).max(200),
    account_id: uuid.nullable().default(null),
    outcome: z.enum(["answered", "no_answer", "busy", "follow_up"]),
    duration_seconds: z.number().int().min(0).max(86400).default(0),
    description: z.string().max(5000).default(""),
  }),
  workflows: z.object({
    name: z.string().min(1).max(200),
    trigger: z.enum(["conversation.created", "manual"]),
    condition_status: z.enum(["open", "pending", "closed"]).default("open"),
    action: z.enum(["task.create", "notification.create"]),
    enabled: z.boolean().default(false),
  }),
  accounts: z.object({
    name: z.string().min(1).max(200),
    kind: z.enum(["company", "person"]).default("company"),
    email: z.string().email().or(z.literal("")).default(""),
    phone: z.string().max(30).default(""),
    description: z.string().max(5000).default(""),
  }),
  contacts: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email().or(z.literal("")).default(""),
    phone: z.string().max(30).default(""),
    account_id: uuid.nullable().default(null),
  }),
  leads: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email().or(z.literal("")).default(""),
    status: z.enum(["new", "qualified", "lost", "converted"]).default("new"),
    source: z.string().max(120).default(""),
  }),
  pipelines: z.object({ name: z.string().min(1).max(200) }),
  pipeline_stages: z.object({
    name: z.string().min(1).max(200),
    pipeline_id: uuid,
    position: z.number().int().min(0).max(100),
    probability: z.number().int().min(0).max(100).default(0),
  }),
  deals: z.object({
    name: z.string().min(1).max(200),
    account_id: uuid.nullable().default(null),
    pipeline_id: uuid,
    stage_id: uuid,
    value: z.number().min(0).max(1e14).default(0),
    currency: z.enum(["IRR", "USD", "EUR"]).default("IRR"),
    status: z.enum(["open", "won", "lost"]).default("open"),
  }),
  tasks: z.object({
    account_id: uuid.nullable().default(null),
    reminder_at: z.string().datetime().nullable().default(null),
    name: z.string().min(1).max(200),
    status: z.enum(["todo", "doing", "done"]).default("todo"),
    due_at: z.string().datetime().nullable().default(null),
    description: z.string().max(5000).default(""),
  }),
  activities: z.object({
    name: z.string().min(1).max(200),
    kind: z.enum(["call", "meeting", "email"]).default("call"),
    account_id: uuid.nullable().default(null),
    description: z.string().max(5000).default(""),
  }),
  notes: z.object({
    name: z.string().min(1).max(200),
    body: z.string().max(10000),
    account_id: uuid.nullable().default(null),
  }),
};
export type Resource = keyof typeof resources;
