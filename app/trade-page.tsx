"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Copy,
  FileCheck2,
  FileSignature,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  Radio,
  ShieldAlert,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import { address, networks, Psbt, Transaction } from "bitcoinjs-lib";
import { useEffect, useMemo, useState } from "react";

type WalletId = "unisat" | "okx" | "xverse" | "leather" | "magiceden" | "phantom";
type BitcoinProvider = {
  requestAccounts?: () => Promise<unknown[]>;
  getAccounts?: () => Promise<unknown[]>;
  getPublicKey?: () => Promise<string>;
  signPsbt?: (psbt: string, options?: Record<string, unknown>) => Promise<string>;
  signPSBT?: (psbt: string) => Promise<string>;
  signMessage?: (message: string, type?: string) => Promise<string>;
  request?: (method: string, params?: unknown) => Promise<unknown>;
};

declare global {
  interface Window {
    unisat?: BitcoinProvider;
    okxwallet?: { bitcoin?: BitcoinProvider };
    BitcoinProvider?: BitcoinProvider;
    LeatherProvider?: BitcoinProvider;
    magicEden?: { bitcoin?: BitcoinProvider };
    phantom?: { bitcoin?: BitcoinProvider };
  }
}

const walletOptions: { id: WalletId; name: string; mark: string; color: string; url: string }[] = [
  { id: "unisat", name: "UniSat", mark: "U", color: "#111", url: "https://unisat.io/download" },
  { id: "okx", name: "OKX Wallet", mark: "OKX", color: "#111", url: "https://www.okx.com/web3" },
  { id: "xverse", name: "Xverse", mark: "X", color: "#7459f7", url: "https://www.xverse.app" },
  { id: "leather", name: "Leather", mark: "L", color: "#f47832", url: "https://leather.io" },
  { id: "magiceden", name: "Magic Eden", mark: "M", color: "#e63a96", url: "https://wallet.magiceden.io" },
  { id: "phantom", name: "Phantom", mark: "P", color: "#9a8cff", url: "https://phantom.com" },
];

type ParsedOutput = { index: number; amount: bigint; address: string; script: string };
type ParsedInput = { index: number; txid: string; vout: number; amount: bigint | null };
type ParsedPsbt = {
  psbt: Psbt;
  inputs: ParsedInput[];
  outputs: ParsedOutput[];
  inputTotal: bigint;
  outputTotal: bigint;
  fee: bigint;
  feePercent: number;
  warnings: string[];
};

type CrcListing = {
  amount: string;
  amount_atoms: string;
  created_at: string;
  expires_at: string;
  listing_id: string;
  platform_fee_sats: string;
  price_sats: string;
  seller_address: string;
  settlement_transaction_id: string;
  status: string;
  ticker: string;
};

type CrcStats = {
  buyer_count: number;
  floor_change_24h_percent: string;
  floor_price_usd_per_token: string;
  market_cap_usd: string;
  total_trades: number;
  total_volume_usd: string;
  volume_7d_usd: string;
};

type CrcConfig = {
  enabled: boolean;
  fast_fee_rate_sat_per_vbyte: string;
  minimum_purchase_fee_rate_sat_per_vbyte: string;
  platform_fee_sats: string;
  unavailable_reason: string | null;
};

type PreparedCrcOrder = {
  authorization: { expires_at: string; token: string };
  buyer_input_count: number;
  buyer_input_start: number;
  order_id: string;
  psbt_base64: string;
  transaction_id: string;
};

function providerFor(id: WalletId): BitcoinProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return {
    unisat: window.unisat,
    okx: window.okxwallet?.bitcoin,
    xverse: window.BitcoinProvider,
    leather: window.LeatherProvider,
    magiceden: window.magicEden?.bitcoin,
    phantom: window.phantom?.bitcoin,
  }[id];
}

function short(value: string, front = 8, back = 6) {
  return value.length > front + back + 1 ? `${value.slice(0, front)}…${value.slice(-back)}` : value;
}

function sats(value: bigint) {
  return `${new Intl.NumberFormat("en-US").format(value)} sats`;
}

function toHex(value: Uint8Array) {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function psbtResultToBase64(value: string) {
  const normalized = value.trim();
  if (normalized.startsWith("cHNidP")) return normalized;
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("钱包返回的 PSBT 编码无法识别");
  }
  const bytes = normalized.match(/.{2}/g)?.map((byte) => String.fromCharCode(Number.parseInt(byte, 16))) ?? [];
  return window.btoa(bytes.join(""));
}

async function crcApi<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/api/crc/marketplace/${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const result = (await response.json()) as { data?: T; error?: { message?: string } | string };
  if (!response.ok || result.data === undefined) {
    const message = typeof result.error === "string" ? result.error : result.error?.message;
    throw new Error(message || "CRC marketplace request failed");
  }
  return result.data;
}

function inputAmount(psbt: Psbt, index: number): bigint | null {
  const input = psbt.data.inputs[index];
  if (input.witnessUtxo) return input.witnessUtxo.value;
  if (input.nonWitnessUtxo) {
    const previous = Transaction.fromBuffer(input.nonWitnessUtxo);
    return previous.outs[psbt.txInputs[index].index]?.value ?? null;
  }
  return null;
}

function parsePsbt(raw: string, crcVerified = false): ParsedPsbt {
  const normalized = raw.trim().replace(/\s+/g, "");
  if (!normalized) throw new Error("请粘贴卖家提供的 PSBT");
  if (normalized.length > 500_000) throw new Error("PSBT 超过 500KB，已拒绝解析");

  let psbt: Psbt;
  try {
    psbt = Psbt.fromBase64(normalized, { network: networks.bitcoin });
  } catch {
    throw new Error("PSBT 格式无效或数据已损坏");
  }
  if (!psbt.txInputs.length || !psbt.txOutputs.length) throw new Error("PSBT 必须包含输入和输出");

  const inputs = psbt.txInputs.map((input, index) => ({
    index,
    txid: toHex(input.hash.slice().reverse()),
    vout: input.index,
    amount: inputAmount(psbt, index),
  }));
  const outputs = psbt.txOutputs.map((output, index) => {
    let destination: string;
    try {
      destination = address.fromOutputScript(output.script, networks.bitcoin);
    } catch {
      destination = `非标准脚本 ${short(toHex(output.script), 16, 10)}`;
    }
    return {
      index,
      amount: output.value,
      address: destination,
      script: toHex(output.script),
    };
  });

  const unknownInputs = inputs.filter((input) => input.amount === null);
  if (unknownInputs.length) throw new Error(`有 ${unknownInputs.length} 个输入缺少 UTXO 金额，无法安全计算手续费`);
  const zero = BigInt(0);
  const inputTotal = inputs.reduce((sum, input) => sum + (input.amount ?? zero), zero);
  const outputTotal = outputs.reduce((sum, output) => sum + output.amount, zero);
  const fee = inputTotal - outputTotal;
  if (fee < zero) throw new Error("输出金额高于输入金额，PSBT 无效");

  const feePercent = inputTotal === zero ? 0 : Number((fee * BigInt(10_000)) / inputTotal) / 100;
  const warnings: string[] = [];
  if (feePercent > 5) warnings.push(`矿工费占输入金额 ${feePercent.toFixed(2)}%，异常偏高`);
  if (outputs.some((output) => output.address.startsWith("非标准脚本"))) {
    warnings.push("包含无法识别的输出脚本，请确认其协议含义");
  }
  if (!crcVerified) warnings.push("此 PSBT 并非来自 CRC 市场接口，CRC-20 资产归属未验证");
  return { psbt, inputs, outputs, inputTotal, outputTotal, fee, feePercent, warnings };
}

function CrcMarketplace({
  account,
  publicKey,
  walletId,
  openWallet,
  notify,
}: {
  account: string;
  publicKey: string;
  walletId: WalletId | null;
  openWallet: () => void;
  notify: (message: string) => void;
}) {
  const [listings, setListings] = useState<CrcListing[]>([]);
  const [stats, setStats] = useState<CrcStats | null>(null);
  const [config, setConfig] = useState<CrcConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CrcListing | null>(null);
  const [prepared, setPrepared] = useState<PreparedCrcOrder | null>(null);
  const [review, setReview] = useState<ParsedPsbt | null>(null);
  const [orderStatus, setOrderStatus] = useState("");
  const [orderError, setOrderError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [liveListings, liveStats, liveConfig] = await Promise.all([
        crcApi<{ items: CrcListing[] }>("listings?ticker=LEAF"),
        crcApi<CrcStats>("stats?ticker=LEAF"),
        crcApi<CrcConfig>("config"),
      ]);
      setListings(liveListings.items.filter((item) => item.status === "ACTIVE"));
      setStats(liveStats);
      setConfig(liveConfig);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "CRC 市场连接失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  function beginOrder(listing: CrcListing) {
    if (!account || !walletId) {
      openWallet();
      return;
    }
    if (!publicKey) {
      notify("当前钱包未返回支付公钥，请解锁钱包并重新连接");
      return;
    }
    setSelected(listing);
    setPrepared(null);
    setReview(null);
    setOrderStatus("");
    setOrderError("");
  }

  async function prepareOrder() {
    if (!selected || !account || !publicKey) return;
    setBusy(true);
    setOrderError("");
    setOrderStatus("CRC 索引器正在锁定卖单并构造 PSBT…");
    try {
      const feeRate = Math.max(
        Number(config?.fast_fee_rate_sat_per_vbyte ?? 7),
        Number(config?.minimum_purchase_fee_rate_sat_per_vbyte ?? 7),
      );
      const order = await crcApi<PreparedCrcOrder>("orders/prepare", {
        address: account,
        public_key: publicKey,
        listing_id: selected.listing_id,
        fee_rate_sat_per_vbyte: String(feeRate),
      });
      const parsedOrder = parsePsbt(order.psbt_base64, true);
      setPrepared(order);
      setReview(parsedOrder);
      setOrderStatus("卖单已由 CRC 市场锁定，请核对真实 PSBT");
    } catch (cause) {
      setOrderStatus("");
      setOrderError(cause instanceof Error ? cause.message : "订单准备失败");
    } finally {
      setBusy(false);
    }
  }

  async function signAndBroadcast() {
    if (!prepared || !walletId || !account) return;
    const provider = providerFor(walletId);
    if (!provider) return;
    setBusy(true);
    setOrderError("");
    try {
      setOrderStatus("等待钱包签署买方输入…");
      const indexes = Array.from(
        { length: prepared.buyer_input_count },
        (_, index) => prepared.buyer_input_start + index,
      );
      let walletResult: string;
      if (provider.signPsbt) {
        walletResult = await provider.signPsbt(prepared.psbt_base64, {
          autoFinalized: false,
          toSignInputs: indexes.map((index) => ({ index, address: account })),
        });
      } else if (provider.signPSBT) {
        walletResult = await provider.signPSBT(prepared.psbt_base64);
      } else {
        throw new Error("该钱包没有兼容的 PSBT 签名接口");
      }
      const signed = psbtResultToBase64(walletResult);
      Psbt.fromBase64(signed, { network: networks.bitcoin });

      setOrderStatus("CRC 市场正在合并卖家与买家签名…");
      const finalized = await crcApi<Record<string, unknown>>("orders/finalize", {
        order_id: prepared.order_id,
        token: prepared.authorization.token,
        signed_psbt_base64: signed,
      });
      if (typeof finalized.finalized_psbt_base64 !== "string") {
        setOrderStatus(`订单状态：${String(finalized.status ?? "FINALIZING")}`);
        return;
      }

      setOrderStatus("正在通过 CRC 节点广播主网交易…");
      const broadcast = await crcApi<{ transaction_id: string; status: string }>("orders/broadcast", {
        order_id: prepared.order_id,
        token: prepared.authorization.token,
        finalized_psbt_base64: finalized.finalized_psbt_base64,
      });
      setOrderStatus(`已广播：${broadcast.transaction_id}`);
      notify("CRC-20 购买交易已广播");
      await refresh();
    } catch (cause) {
      setOrderError(cause instanceof Error ? cause.message : "签名或广播失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="crc-market-live" id="market">
      <div className="section-heading">
        <div>
          <span className="section-index">01 / CRC.GARDEN LIVE</span>
          <h2>LEAF 实时卖单</h2>
        </div>
        <span className={`indexer-badge ${error ? "offline" : ""}`}>
          <span />{error ? "CRC API 异常" : "CRC 索引器已连接"}
        </span>
      </div>

      {stats && (
        <div className="live-stats">
          <div><span>地板价</span><strong>${stats.floor_price_usd_per_token}</strong><small>{stats.floor_change_24h_percent}% / 24h</small></div>
          <div><span>累计成交</span><strong>{stats.total_trades.toLocaleString()}</strong><small>{stats.buyer_count.toLocaleString()} 位买家</small></div>
          <div><span>累计交易额</span><strong>${Number(stats.total_volume_usd).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong><small>CRC 索引数据</small></div>
          <div><span>7 日交易额</span><strong>${Number(stats.volume_7d_usd).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong><small>LEAF / BTC</small></div>
        </div>
      )}

      <div className="panel live-orderbook">
        <div className="panel-head">
          <strong>crc.garden 在售订单</strong>
          <span>{loading ? "同步中…" : `${listings.length} 个有效卖单`}</span>
        </div>
        {error ? (
          <div className="market-empty"><AlertTriangle /><strong>CRC 市场暂不可用</strong><span>{error}</span><button onClick={refresh}>重新连接</button></div>
        ) : (
          <>
            <div className="live-table-head"><span>数量</span><span>总价</span><span>单价</span><span>卖家</span><span /></div>
            {listings.slice(0, 30).map((listing) => {
              const unitPrice = Number(listing.price_sats) / Number(listing.amount);
              return (
                <div className="live-listing" key={listing.listing_id}>
                  <span><strong>{Number(listing.amount).toLocaleString()}</strong> LEAF</span>
                  <span>{Number(listing.price_sats).toLocaleString()} sats</span>
                  <span>{unitPrice.toFixed(2)} sats</span>
                  <code>{short(listing.seller_address)}</code>
                  <button onClick={() => beginOrder(listing)}>购买</button>
                </div>
              );
            })}
          </>
        )}
      </div>

      {selected && (
        <div className="modal-backdrop">
          <div className="modal crc-order-modal">
            <button className="modal-close" onClick={() => !busy && setSelected(null)}><X size={19} /></button>
            <span className="modal-icon"><LockKeyhole /></span>
            <span className="step-count">CRC.GARDEN MARKETPLACE</span>
            <h2>{prepared ? "审核并签署真实订单" : "锁定 CRC 卖单"}</h2>
            <div className="order-summary crc-summary">
              <div><span>买入</span><strong>{Number(selected.amount).toLocaleString()} LEAF</strong></div>
              <div><span>支付</span><strong>{Number(selected.price_sats).toLocaleString()} sats</strong></div>
              <div><span>平台费</span><strong>{Number(selected.platform_fee_sats).toLocaleString()} sats</strong></div>
              <div><span>索引交易</span><strong>{short(selected.settlement_transaction_id)}</strong></div>
            </div>
            {review && (
              <>
                <div className="crc-verified"><ShieldCheck size={16} />该订单及 PSBT 由 crc.garden 索引器和撮合接口返回</div>
                <div className="tx-details">
                  <div><span>PSBT 输入</span><strong>{review.inputs.length}</strong></div>
                  <div><span>PSBT 输出</span><strong>{review.outputs.length}</strong></div>
                  <div><span>矿工费</span><strong>{sats(review.fee)}</strong></div>
                  <div><span>手续费比例</span><strong>{review.feePercent.toFixed(2)}%</strong></div>
                </div>
              </>
            )}
            {orderStatus && <div className="crc-order-status"><Radio size={14} /><span>{orderStatus}</span></div>}
            {orderError && <div className="hard-error crc-error"><X size={15} /><span>{orderError}</span></div>}
            {!prepared ? (
              <button className="primary wide real-wide" onClick={prepareOrder} disabled={busy || config?.enabled === false}>
                {busy ? <LoaderCircle className="spin" size={17} /> : <LockKeyhole size={17} />}锁单并获取真实 PSBT
              </button>
            ) : (
              <button className="primary wide real-wide" onClick={signAndBroadcast} disabled={busy || orderStatus.startsWith("已广播")}>
                {busy ? <LoaderCircle className="spin" size={17} /> : <FileSignature size={17} />}钱包签名并通过 CRC 节点广播
              </button>
            )}
            <p className="crc-source">数据与订单接口：crc.garden · Bitcoin Mainnet</p>
          </div>
        </div>
      )}
    </section>
  );
}

export default function TradePage() {
  const [walletOpen, setWalletOpen] = useState(false);
  const [account, setAccount] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [walletId, setWalletId] = useState<WalletId | null>(null);
  const [walletName, setWalletName] = useState("");
  const [rawPsbt, setRawPsbt] = useState("");
  const [parsed, setParsed] = useState<ParsedPsbt | null>(null);
  const [parseError, setParseError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [signedPsbt, setSignedPsbt] = useState("");
  const [txid, setTxid] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");

  const canSign = useMemo(
    () => Boolean(parsed && confirmed && account && !signedPsbt && parsed.feePercent <= 20),
    [parsed, confirmed, account, signedPsbt],
  );

  function notify(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function connectWallet(option: (typeof walletOptions)[number]) {
    const provider = providerFor(option.id);
    if (!provider) {
      window.open(option.url, "_blank", "noopener,noreferrer");
      notify(`未检测到 ${option.name}，已打开官方下载页`);
      return;
    }
    setBusy(true);
    try {
      let accountResults: unknown[] = [];
      if (provider.requestAccounts) accountResults = await provider.requestAccounts();
      else if (provider.getAccounts) accountResults = await provider.getAccounts();
      else if (provider.request) {
        const response = await provider.request("getAccounts");
        if (Array.isArray(response)) accountResults = response;
      }
      const accountDetails = accountResults
        .map((item) => (typeof item === "string" ? { address: item, publicKey: "" } : item as { address?: string; publicKey?: string; public_key?: string }))
        .filter((item): item is { address: string; publicKey?: string; public_key?: string } => Boolean(item.address));
      if (!accountDetails[0]) throw new Error("钱包未返回 Bitcoin 主网地址");
      let key = accountDetails[0].publicKey || accountDetails[0].public_key || "";
      if (!key && provider.getPublicKey) key = await provider.getPublicKey();
      if (!key && provider.request) {
        const response = await provider.request("getPublicKey").catch(() => null);
        if (typeof response === "string") key = response;
      }
      setAccount(accountDetails[0].address);
      setPublicKey(key);
      setWalletId(option.id);
      setWalletName(option.name);
      setWalletOpen(false);
      notify(`${option.name} 已连接`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "钱包连接已取消");
    } finally {
      setBusy(false);
    }
  }

  function inspectPsbt() {
    setParseError("");
    setParsed(null);
    setSignedPsbt("");
    setTxid("");
    setConfirmed(false);
    try {
      setParsed(parsePsbt(rawPsbt));
      notify("PSBT 基础结构校验通过");
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "PSBT 解析失败");
    }
  }

  async function signTransaction() {
    if (!parsed || !walletId || !canSign) return;
    const provider = providerFor(walletId);
    if (!provider) {
      notify("钱包连接已失效，请重新连接");
      return;
    }
    setBusy(true);
    try {
      let result: string;
      if (provider.signPsbt) result = await provider.signPsbt(rawPsbt.trim(), { autoFinalized: true });
      else if (provider.signPSBT) result = await provider.signPSBT(rawPsbt.trim());
      else throw new Error(`${walletName} 未暴露兼容的 PSBT 签名接口`);
      Psbt.fromBase64(result, { network: networks.bitcoin });
      setSignedPsbt(result);
      notify("钱包已返回签名 PSBT");
    } catch (error) {
      notify(error instanceof Error ? error.message : "签名失败或已取消");
    } finally {
      setBusy(false);
    }
  }

  async function broadcastTransaction() {
    if (!signedPsbt) return;
    setBusy(true);
    try {
      const signed = Psbt.fromBase64(signedPsbt, { network: networks.bitcoin });
      const rawTx = signed.extractTransaction().toHex();
      const response = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawTx }),
      });
      const result = (await response.json()) as { txid?: string; error?: string };
      if (!response.ok || !result.txid) throw new Error(result.error || "广播失败");
      setTxid(result.txid);
      notify("交易已广播到 Bitcoin 主网");
    } catch (error) {
      notify(error instanceof Error ? error.message : "签名尚未完成，无法提取交易");
    } finally {
      setBusy(false);
    }
  }

  async function signMessage() {
    if (!walletId || !message.trim()) return;
    const provider = providerFor(walletId);
    if (!provider?.signMessage) {
      notify(`${walletName} 未暴露消息签名接口`);
      return;
    }
    setBusy(true);
    try {
      const result = await provider.signMessage(message, "bip322-simple");
      setSignature(result);
      notify("钱包已生成真实消息签名");
    } catch {
      notify("消息签名已取消");
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    notify("已复制");
  }

  return (
    <main className="real-app">
      <header className="nav-shell">
        <nav className="nav">
          <a className="brand" href="#"><span className="brand-mark"><Leaf size={17} /></span><span>leaf</span></a>
          <div className="nav-links real-nav">
            <a className="active" href="#market">实时市场</a>
            <a href="#psbt">PSBT 工具</a>
            <a href="#signer">消息签名</a>
            <a href="https://github.com/BitcoinWorldTrustFoundation/precop" target="_blank" rel="noreferrer">
              PRECOP 规范 <ArrowUpRight size={13} />
            </a>
          </div>
          <button className="wallet-button" onClick={() => setWalletOpen(true)}>
            <WalletCards size={16} />{account ? short(account) : "连接真实钱包"}
          </button>
        </nav>
      </header>

      <section className="real-hero">
        <div className="hero-grid" />
        <div className="real-hero-inner">
          <div>
            <div className="eyebrow"><Radio size={13} /> Bitcoin Mainnet</div>
            <h1>CRC 实时市场<br /><em>审核与签名</em></h1>
            <p>直接使用 crc.garden 的索引、挂单、锁单、PSBT 合并与广播接口。</p>
          </div>
          <div className="truth-card">
            <ShieldAlert size={23} />
            <strong>CRC-20 验证状态</strong>
            <span>crc.garden 索引器</span>
            <p>LEAF 余额、有效挂单和成交数据由 crc.garden 主网接口返回，并显示其索引高度。</p>
          </div>
        </div>
      </section>

      <CrcMarketplace
        account={account}
        publicKey={publicKey}
        walletId={walletId}
        openWallet={() => setWalletOpen(true)}
        notify={notify}
      />

      <section className="real-workbench" id="psbt">
        <div className="section-heading">
          <div><span className="section-index">02 / MANUAL IMPORT</span><h2>手动导入 PSBT</h2></div>
          <span className="mainnet-status"><span /> MAINNET</span>
        </div>

        <div className="real-grid">
          <div className="panel psbt-import">
            <div className="panel-head"><strong>原始 PSBT（Base64）</strong><span>仅在浏览器内解析</span></div>
            <textarea
              value={rawPsbt}
              onChange={(event) => setRawPsbt(event.target.value)}
              placeholder="粘贴以 cHNidP 开头的真实卖家 PSBT…"
              spellCheck={false}
            />
            {parseError && <div className="hard-error"><X size={16} /><span>{parseError}</span></div>}
            <button className="primary wide real-wide" onClick={inspectPsbt}>
              <FileCheck2 size={17} />解析并检查
            </button>
          </div>

          <aside className="panel verification-panel">
            <div className="panel-head"><strong>校验原则</strong><ShieldCheck size={16} /></div>
            <ul>
              <li><Check />PSBT 二进制结构必须有效</li>
              <li><Check />每个输入必须携带可验证 UTXO</li>
              <li><Check />输入总额必须覆盖全部输出</li>
              <li><Check />异常高费率直接禁止签名</li>
              <li className="pending"><AlertTriangle />CRC-20 资产需外部索引器证明</li>
            </ul>
          </aside>
        </div>

        {parsed && (
          <div className="review-zone">
            <div className="section-heading compact">
              <div><span className="section-index">02 / REVIEW</span><h2>逐项核对交易</h2></div>
              <span className="verified-badge"><ShieldCheck size={14} />Bitcoin 结构已验证</span>
            </div>

            <div className="summary-cards">
              <div><span>输入总额</span><strong>{sats(parsed.inputTotal)}</strong></div>
              <div><span>输出总额</span><strong>{sats(parsed.outputTotal)}</strong></div>
              <div className={parsed.feePercent > 5 ? "danger" : ""}><span>矿工费</span><strong>{sats(parsed.fee)}</strong><small>{parsed.feePercent.toFixed(2)}%</small></div>
              <div><span>输入 / 输出</span><strong>{parsed.inputs.length} / {parsed.outputs.length}</strong></div>
            </div>

            <div className="io-grid">
              <div className="panel io-panel">
                <div className="panel-head"><strong>输入</strong><span>{parsed.inputs.length} 项</span></div>
                {parsed.inputs.map((input) => (
                  <div className="io-row" key={`${input.txid}:${input.vout}`}>
                    <span className="io-index">#{input.index}</span>
                    <div><code>{short(input.txid, 12, 10)}:{input.vout}</code><small>Previous output</small></div>
                    <strong>{input.amount === null ? "未知" : sats(input.amount)}</strong>
                  </div>
                ))}
              </div>
              <div className="panel io-panel">
                <div className="panel-head"><strong>输出</strong><span>{parsed.outputs.length} 项</span></div>
                {parsed.outputs.map((output) => (
                  <div className="io-row" key={`${output.index}:${output.script}`}>
                    <span className="io-index">#{output.index}</span>
                    <div><code title={output.address}>{short(output.address, 13, 9)}</code><small>{short(output.script, 18, 12)}</small></div>
                    <strong>{sats(output.amount)}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="warning-stack">
              {parsed.warnings.map((warning) => <div key={warning}><AlertTriangle size={15} /><span>{warning}</span></div>)}
            </div>

            <label className="confirm-real">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              <span>我已逐项核对全部输入、输出、手续费和到账地址，并理解 CRC-20 资产尚未得到协议索引器验证。</span>
            </label>

            {!account ? (
              <button className="primary sign-real" onClick={() => setWalletOpen(true)}><WalletCards size={18} />连接真实钱包后签名</button>
            ) : (
              <button className="primary sign-real" onClick={signTransaction} disabled={!canSign || busy}>
                {busy ? <LoaderCircle className="spin" size={18} /> : <FileSignature size={18} />}
                {signedPsbt ? "钱包已签名" : `使用 ${walletName} 签名`}
              </button>
            )}

            {signedPsbt && (
              <div className="signed-result">
                <div><ShieldCheck size={21} /><span><strong>已获得签名 PSBT</strong><small>只有交易已完成所有必要签名时才能广播</small></span></div>
                <button onClick={() => copy(signedPsbt)}><Copy size={14} />复制签名 PSBT</button>
                <button className="broadcast" onClick={broadcastTransaction} disabled={busy || Boolean(txid)}>
                  <Radio size={14} />{txid ? "广播成功" : "广播到 Bitcoin 主网"}
                </button>
                {txid && <a href={`https://mempool.space/tx/${txid}`} target="_blank" rel="noreferrer">查看交易 {short(txid)} <ArrowUpRight size={13} /></a>}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="real-signer" id="signer">
        <div className="sign-copy">
          <span className="section-index">03 / BIP-322</span>
          <h2>真实消息签名</h2>
          <p>签名由已连接钱包完成。页面不生成演示结果，也不会接触私钥或助记词。</p>
        </div>
        <div className="sign-card">
          <div className="field-label"><label htmlFor="message">完整签名原文</label><span>{message.length} / 500</span></div>
          <textarea id="message" maxLength={500} value={message} onChange={(event) => { setMessage(event.target.value); setSignature(""); }} placeholder="输入你完全理解的待签名内容…" />
          <div className="warning"><AlertTriangle size={15} /><span>消息签名可以被第三方用作授权证明。不要签署空白、模糊或由陌生人指定的内容。</span></div>
          {signature && <div className="signature-result"><span>钱包返回签名</span><code>{signature}</code><button onClick={() => copy(signature)}><Copy size={15} /></button></div>}
          <button className="primary wide real-wide" onClick={() => account ? signMessage() : setWalletOpen(true)} disabled={busy || (Boolean(account) && !message.trim())}>
            <FileSignature size={17} />{account ? "在钱包中签署原文" : "连接真实钱包"}
          </button>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#"><span className="brand-mark"><Leaf size={17} /></span><span>leaf</span></a>
        <p>Non-custodial Bitcoin PSBT workbench.</p>
        <span>不保存 PSBT · 不托管私钥 · 不伪造验证结果</span>
      </footer>

      {walletOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setWalletOpen(false)}>
          <div className="modal wallet-modal">
            <button className="modal-close" onClick={() => setWalletOpen(false)}><X size={19} /></button>
            <span className="modal-icon"><WalletCards /></span>
            <h2>连接 Bitcoin 主网钱包</h2>
            <p>只显示浏览器实际检测到的连接能力；未安装的钱包会打开官方下载页。</p>
            <div className="wallet-list">
              {walletOptions.map((option) => (
                <button onClick={() => connectWallet(option)} key={option.id} disabled={busy}>
                  <span className="wallet-mark" style={{ background: option.color }}>{option.mark}</span>
                  <strong>{option.name}</strong>
                  <span className={`detected ${providerFor(option.id) ? "yes" : ""}`}>
                    {providerFor(option.id) ? "已检测" : "安装"} <ArrowUpRight size={13} />
                  </span>
                </button>
              ))}
            </div>
            <small><LockKeyhole size={11} /> 本站不会提供“演示钱包”，也不会索取助记词。</small>
          </div>
        </div>
      )}
      {toast && <div className="toast"><Check size={15} />{toast}</div>}
    </main>
  );
}
