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
import { useMemo, useState } from "react";

type WalletId = "unisat" | "okx" | "xverse" | "leather" | "magiceden" | "phantom";
type BitcoinProvider = {
  requestAccounts?: () => Promise<string[]>;
  getAccounts?: () => Promise<string[]>;
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

function inputAmount(psbt: Psbt, index: number): bigint | null {
  const input = psbt.data.inputs[index];
  if (input.witnessUtxo) return input.witnessUtxo.value;
  if (input.nonWitnessUtxo) {
    const previous = Transaction.fromBuffer(input.nonWitnessUtxo);
    return previous.outs[psbt.txInputs[index].index]?.value ?? null;
  }
  return null;
}

function parsePsbt(raw: string): ParsedPsbt {
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
  warnings.push("未连接 CRC-20 协议索引器，无法验证代币数量或归属");
  return { psbt, inputs, outputs, inputTotal, outputTotal, fee, feePercent, warnings };
}

export default function TradePage() {
  const [walletOpen, setWalletOpen] = useState(false);
  const [account, setAccount] = useState("");
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
      let accounts: string[] = [];
      if (provider.requestAccounts) accounts = await provider.requestAccounts();
      else if (provider.getAccounts) accounts = await provider.getAccounts();
      else if (provider.request) {
        const response = await provider.request("getAccounts");
        if (Array.isArray(response)) {
          accounts = response
            .map((item) => (typeof item === "string" ? item : (item as { address?: string }).address))
            .filter((item): item is string => Boolean(item));
        }
      }
      if (!accounts[0]) throw new Error("钱包未返回 Bitcoin 主网地址");
      setAccount(accounts[0]);
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
            <a className="active" href="#psbt">PSBT 交易台</a>
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
            <h1>真实 PSBT<br /><em>审核与签名</em></h1>
            <p>不生成假订单，不模拟余额。只有通过结构校验的真实 PSBT 才能进入钱包签名。</p>
          </div>
          <div className="truth-card">
            <ShieldAlert size={23} />
            <strong>CRC-20 验证状态</strong>
            <span>协议索引器未连接</span>
            <p>当前可以真实解析、签名和广播 Bitcoin PSBT，但不能证明其中的 CRC-20 资产有效。</p>
          </div>
        </div>
      </section>

      <section className="real-workbench" id="psbt">
        <div className="section-heading">
          <div><span className="section-index">01 / IMPORT</span><h2>导入卖家 PSBT</h2></div>
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
