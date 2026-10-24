import { test, expect } from "@playwright/test";
test("operations: inbox draft, command search, calendar and workflow builder", async ({
  page,
}, info) => {
  const api = page.request;
  const registration = await api.post("/api/auth/register", {
    data: {
      name: "Operations tester",
      email: `ops-${info.project.name}-${Date.now()}@example.test`,
      password: "OperationsBrowser123!",
    },
  });
  expect(registration.status()).toBe(201);
  const tenant = await (
    await api.post("/api/tenants", {
      data: { name: "Operations test workspace" },
    })
  ).json();
  const channel = await (
    await api.post(`/api/t/${tenant.id}/channels`, {
      data: { name: "Customer care", kind: "email" },
    })
  ).json();
  const customer = await (
    await api.post(`/api/t/${tenant.id}/accounts`, {
      data: { name: "سپهر تجارت", email: "sepehr@example.test" },
    })
  ).json();
  const conversation = await (
    await api.post(`/api/t/${tenant.id}/conversations`, {
      data: {
        name: "بررسی تمدید قرارداد",
        channel_id: channel.id,
        account_id: customer.id,
      },
    })
  ).json();
  await api.post(`/api/t/${tenant.id}/messages`, {
    data: {
      conversation_id: conversation.id,
      body: "مشتری درخواست بررسی شرایط تمدید قرارداد را دارد.",
      direction: "internal",
    },
  });
  await page.goto("/");
  async function navigate(key: string, label: string) {
    if (info.project.name === "mobile")
      await page.getByLabel("Mobile navigation").selectOption(key);
    else await page.getByRole("button", { name: label, exact: true }).click();
  }
  await navigate("inbox", "صندوق ورودی");
  await page.getByRole("button", { name: /بررسی تمدید قرارداد/ }).click();
  await expect(
    page
      .locator(".thread-messages")
      .getByText("مشتری درخواست بررسی شرایط تمدید قرارداد را دارد.", {
        exact: true,
      }),
  ).toBeVisible();
  await page.getByLabel("Message body").fill("پیش‌نویس پیگیری فردا");
  await page.getByLabel("Message type").selectOption("draft");
  await page
    .locator(".composer")
    .getByRole("button", { name: "ذخیره", exact: true })
    .click();
  await expect(
    page.locator(".message-bubble").getByText("پیش‌نویس پیگیری فردا"),
  ).toBeVisible();
  expect(
    (
      await api.post(
        `/api/t/${tenant.id}/conversations/${conversation.id}/send`,
      )
    ).status(),
  ).toBe(409);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/${info.project.name}-inbox.png`,
    fullPage: info.project.name !== "mobile",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.locator(".command-launch").click();
  await page.getByLabel("Global search").fill("سپهر");
  await expect(
    page.locator(".command-results").getByText("سپهر تجارت"),
  ).toBeVisible();
  await page.getByRole("dialog").getByLabel("Close", { exact: true }).click();
  await navigate("workflows", "جریان‌های کاری");
  await page.getByRole("button", { name: "ایجاد جدید", exact: true }).click();
  await page.getByLabel("عنوان", { exact: true }).fill("پیگیری تمدید");
  await page
    .getByLabel("محرک", { exact: true })
    .selectOption("conversation.created");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "ذخیره", exact: true })
    .click();
  await expect(
    page.locator(".workflow-card").getByText("پیگیری تمدید", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/${info.project.name}-workflows.png`,
    fullPage: info.project.name !== "mobile",
  });
  await navigate("calendar", "تقویم");
  await page.getByRole("button", { name: "ایجاد جدید", exact: true }).click();
  await page.getByLabel("عنوان", { exact: true }).fill("پیگیری قرارداد");
  await page.getByLabel("موعد", { exact: true }).fill("2026-11-15T10:30");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "ذخیره", exact: true })
    .click();
  await expect(
    page.locator(".agenda-list").getByText("پیگیری قرارداد", { exact: true }),
  ).toBeVisible();
  await navigate("customer360", "پرونده مشتری");
  await page
    .locator(".customer-selector")
    .getByRole("button", { name: "سپهر تجارت" })
    .click();
  await expect(
    page
      .locator(".customer-sections")
      .getByText("بررسی تمدید قرارداد", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/${info.project.name}-customer360.png`,
    fullPage: info.project.name !== "mobile",
  });
  await page.getByLabel("Change language").click();
  await expect(page.locator(".page-heading h1")).toHaveText("Customer 360");
  expect(await page.locator("html").getAttribute("dir")).toBe("ltr");
});
