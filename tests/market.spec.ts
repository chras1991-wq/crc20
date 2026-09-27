import { expect, test } from "@playwright/test";
import { Psbt, networks } from "bitcoinjs-lib";

function validPsbt() {
  const psbt = new Psbt({ network: networks.bitcoin });
  psbt.addInput({
    hash: "11".repeat(32),
    index: 0,
    witnessUtxo: {
      script: Uint8Array.from([0x00, 0x14, ...new Array(20).fill(0x22)]),
      value: 100_000n,
    },
  });
  psbt.addOutput({
    script: Uint8Array.from([0x00, 0x14, ...new Array(20).fill(0x33)]),
    value: 98_000n,
  });
  return psbt.toBase64();
}

test("rejects malformed PSBT and reviews a structurally valid PSBT", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /真实 PSBT/ })).toBeVisible();
  await expect(page.getByText("协议索引器未连接")).toBeVisible();

  const field = page.getByPlaceholder(/粘贴以 cHNidP/);
  await field.fill("cHNidP8BAA==");
  await page.getByRole("button", { name: "解析并检查" }).click();
  await expect(page.getByText("PSBT 格式无效或数据已损坏")).toBeVisible();

  await field.fill(validPsbt());
  await page.getByRole("button", { name: "解析并检查" }).click();
  await expect(page.getByRole("heading", { name: "逐项核对交易" })).toBeVisible();
  await expect(page.getByText("2,000 sats")).toBeVisible();
  await expect(page.getByText("未连接 CRC-20 协议索引器")).toBeVisible();
  await expect(page.getByRole("button", { name: "连接真实钱包后签名" })).toBeDisabled();
});

test("offers real wallet connections without a demo wallet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "连接真实钱包" }).click();
  await expect(page.getByRole("heading", { name: "连接 Bitcoin 主网钱包" })).toBeVisible();
  await expect(page.getByText("本站不会提供“演示钱包”")).toBeVisible();
  await expect(page.getByText("进入交互演示")).toHaveCount(0);
});
