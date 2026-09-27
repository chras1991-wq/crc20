import { Transaction } from "bitcoinjs-lib";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let rawTx: unknown;
  try {
    ({ rawTx } = (await request.json()) as { rawTx?: unknown });
  } catch {
    return NextResponse.json({ error: "请求必须是 JSON" }, { status: 400 });
  }

  if (typeof rawTx !== "string" || !/^[0-9a-fA-F]+$/.test(rawTx) || rawTx.length % 2 !== 0) {
    return NextResponse.json({ error: "交易十六进制格式无效" }, { status: 400 });
  }
  if (rawTx.length > 800_000) {
    return NextResponse.json({ error: "交易数据过大" }, { status: 413 });
  }

  let expectedTxid: string;
  try {
    expectedTxid = Transaction.fromHex(rawTx).getId();
  } catch {
    return NextResponse.json({ error: "无法解析 Bitcoin 交易" }, { status: 400 });
  }

  try {
    const response = await fetch("https://mempool.space/api/tx", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: rawTx,
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        { error: result.slice(0, 300) || "上游节点拒绝交易" },
        { status: response.status >= 400 && response.status < 500 ? 400 : 502 },
      );
    }
    const txid = result.trim();
    if (txid !== expectedTxid) {
      return NextResponse.json({ error: "广播节点返回的交易 ID 不一致" }, { status: 502 });
    }
    return NextResponse.json({ txid });
  } catch {
    return NextResponse.json({ error: "无法连接 Bitcoin 广播节点" }, { status: 502 });
  }
}
