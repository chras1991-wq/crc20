import { expect, test } from "@playwright/test";
import { Psbt, networks } from "bitcoinjs-lib";

function validPsbt() {
  const psbt = new Psbt({ network: networks.bitcoin });
  psbt.addInput({
    hash: "11".repeat(32),
    index: 0,
    witnessUtxo: {
      script: Uint8Array.from([0x00, 0x14, ...new Array(20).fill(0x22)]),
      value: BigInt(100_000),
    },
  });
  psbt.addOutput({
    script: Uint8Array.from([0x00, 0x14, ...new Array(20).fill(0x33)]),
    value: BigInt(98_000),
  });
  return psbt.toBase64();
}

test("rejects malformed PSBT and reviews a structurally valid PSBT", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /CRC 实时市场/ })).toBeVisible();
  await expect(page.getByText("crc.garden 索引器")).toBeVisible();

  const field = page.getByPlaceholder(/粘贴以 cHNidP/);
  await field.fill("cHNidP8BAA==");
  await page.getByRole("button", { name: "解析并检查" }).click();
  await expect(page.getByText("PSBT 格式无效或数据已损坏")).toBeVisible();

  await field.fill(validPsbt());
  await page.getByRole("button", { name: "解析并检查" }).click();
  await expect(page.getByRole("heading", { name: "逐项核对交易" })).toBeVisible();
  await expect(page.getByText("2,000 sats")).toBeVisible();
  await expect(page.getByText("此 PSBT 并非来自 CRC 市场接口")).toBeVisible();
  await expect(page.getByRole("button", { name: "连接真实钱包后签名" })).toBeVisible();
});

test("loads indexed LEAF listings from the crc.garden API", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "LEAF 实时卖单" })).toBeVisible();
  await expect(page.getByText("CRC 索引器已连接")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/个有效卖单/)).toBeVisible();
  await expect(page.getByRole("button", { name: "购买" }).first()).toBeVisible();
});

test("offers real wallet connections without a demo wallet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "连接真实钱包" }).click();
  await expect(page.getByRole("heading", { name: "连接 Bitcoin 主网钱包" })).toBeVisible();
  await expect(page.getByText("本站不会提供“演示钱包”")).toBeVisible();
  await expect(page.getByText("进入交互演示")).toHaveCount(0);
});
