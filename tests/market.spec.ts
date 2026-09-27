import { expect, test } from "@playwright/test";

test("completes the demo PSBT and message signing flows", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /快捷交易/ })).toBeVisible();

  await page.getByRole("button", { name: "连接钱包" }).first().click();
  await expect(page.getByRole("heading", { name: "连接 Bitcoin 钱包" })).toBeVisible();
  await page.getByRole("button", { name: "没有钱包？进入交互演示" }).click();
  await expect(page.getByText("bc1p3le…c6n2j").first()).toBeVisible();

  await page.getByRole("button", { name: "审核并锁定订单" }).click();
  await expect(page.getByRole("heading", { name: "确认并锁定订单" })).toBeVisible();
  await page.getByRole("button", { name: /锁定订单并查看 PSBT/ }).click();
  await expect(page.getByRole("heading", { name: "审核卖单 PSBT" })).toBeVisible();
  await expect(page.getByText("SELLER PSBT")).toBeVisible();
  await page.getByRole("button", { name: /在钱包中签名确认/ }).click();
  await expect(page.getByRole("heading", { name: "签名成功" })).toBeVisible();
  await page.getByRole("button", { name: "完成" }).click();

  await page.locator("#message").fill("Verify leaf order LEAF-004");
  await page.getByRole("button", { name: "签署这段消息" }).click();
  await expect(page.getByText("签名结果")).toBeVisible();
});

test("keeps the market usable on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /快捷交易/ })).toBeVisible();
  await page.getByRole("button", { name: "打开菜单" }).click();
  await expect(page.getByRole("link", { name: "签名工具" })).toBeVisible();
  await page.getByRole("button", { name: "连接钱包", exact: true }).click();
  await expect(page.getByRole("heading", { name: "连接 Bitcoin 钱包" })).toBeVisible();
});
