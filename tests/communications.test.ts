import { it, expect } from "vitest";
import { CommunicationRegistry } from "../packages/shared/src/communications";
it("requires tenant provider, permission, configuration and explicit approval before delivery", async () => {
  const registry = new CommunicationRegistry();
  let sent = 0;
  registry.register("a", {
    kind: "email",
    send: async () => {
      sent++;
      return { providerId: "test-provider" };
    },
  });
  const input = {
    recipient: "test@example.test",
    body: "Test",
    idempotencyKey: "event-1",
  };
  for (const key of ["permission", "approved", "configured"] as const) {
    await expect(
      registry.send(
        {
          tenantId: "a",
          kind: "email",
          permission: true,
          approved: true,
          configured: true,
          [key]: false,
        },
        input,
      ),
    ).rejects.toThrow("not authorized");
  }
  await expect(
    registry.send(
      {
        tenantId: "b",
        kind: "email",
        permission: true,
        approved: true,
        configured: true,
      },
      input,
    ),
  ).rejects.toThrow("not configured");
  expect(sent).toBe(0);
  await registry.send(
    {
      tenantId: "a",
      kind: "email",
      permission: true,
      approved: true,
      configured: true,
    },
    input,
  );
  expect(sent).toBe(1);
});
