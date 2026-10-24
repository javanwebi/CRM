/** Providers implement this server-side interface; draft storage never invokes it. */
export interface CommunicationAdapter {
  readonly kind: "email" | "sms" | "whatsapp";
  send(input: {
    tenantId: string;
    recipient: string;
    body: string;
    idempotencyKey: string;
  }): Promise<{ providerId: string }>;
}
export class CommunicationRegistry {
  private adapters = new Map<string, CommunicationAdapter>();
  register(tenantId: string, adapter: CommunicationAdapter) {
    this.adapters.set(`${tenantId}:${adapter.kind}`, adapter);
  }
  async send(
    context: {
      tenantId: string;
      kind: CommunicationAdapter["kind"];
      permission: boolean;
      approved: boolean;
      configured: boolean;
    },
    input: { recipient: string; body: string; idempotencyKey: string },
  ) {
    if (!context.permission || !context.approved || !context.configured)
      throw Error("Delivery not authorized");
    const adapter = this.adapters.get(`${context.tenantId}:${context.kind}`);
    if (!adapter) throw Error("Provider not configured");
    return adapter.send({ ...input, tenantId: context.tenantId });
  }
}
