import { it, expect } from "vitest";
import { ToolRegistry } from "../packages/ai/src/index";
it("requires tenant identity and permission; sensitive tools fail closed even with approval ID", async () => {
  const registry = new ToolRegistry();
  registry.register({
    name: "delete",
    permission: "crm.write",
    sensitive: true,
    execute: async () => {
      throw new Error("must never execute");
    },
  });
  await expect(
    registry.execute(
      "delete",
      { tenantId: "", userId: "u", permissions: ["crm.write"] },
      {},
    ),
  ).rejects.toThrow("access denied");
  await expect(
    registry.execute(
      "delete",
      { tenantId: "t", userId: "u", permissions: [], approvalId: "fake" },
      {},
    ),
  ).rejects.toThrow("access denied");
  await expect(
    registry.execute(
      "delete",
      {
        tenantId: "t",
        userId: "u",
        permissions: ["crm.write"],
        approvalId: "fake",
      },
      {},
    ),
  ).rejects.toThrow("disabled");
});

import { summarizeConversation } from "../packages/ai/src/summary";
it("keeps unconfigured summaries local and validates server adapter output", async () => {
  let calls = 0;
  const transport = (async () => {
    calls++;
    return new Response(
      JSON.stringify({
        summary: "Conversation summary",
        suggestions: ["Review renewal"],
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  const local = await summarizeConversation(
    ["Customer renewal"],
    {},
    transport,
  );
  expect(local.mode).toBe("extractive");
  expect(calls).toBe(0);
  const model = await summarizeConversation(
    ["Customer renewal"],
    { url: "https://summary.example.test", token: "test-only", enabled: true },
    transport,
  );
  expect(model.mode).toBe("model");
  expect(model.suggestions).toHaveLength(1);
  expect(calls).toBe(1);
  await expect(
    summarizeConversation(
      ["Data"],
      {
        url: "https://summary.example.test",
        token: "test-only",
        enabled: true,
      },
      (async () =>
        new Response('{"execute":"send message"}', {
          status: 200,
        })) as typeof fetch,
    ),
  ).rejects.toThrow();
});
