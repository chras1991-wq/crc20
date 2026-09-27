"use client";

import {
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  ExternalLink,
  FileSignature,
  Info,
  Leaf,
  LockKeyhole,
  Menu,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";
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

const wallets: { id: WalletId; name: string; mark: string; color: string; url: string }[] = [
  { id: "unisat", name: "UniSat", mark: "U", color: "#121212", url: "https://unisat.io/download" },
  { id: "okx", name: "OKX Wallet", mark: "OKX", color: "#050505", url: "https://www.okx.com/web3" },
  { id: "xverse", name: "Xverse", mark: "X", color: "#7459f7", url: "https://www.xverse.app" },
  { id: "leather", name: "Leather", mark: "L", color: "#f47832", url: "https://leather.io" },
  { id: "magiceden", name: "Magic Eden", mark: "M", color: "#e63a96", url: "https://wallet.magiceden.io" },
  { id: "phantom", name: "Phantom", mark: "P", color: "#9a8cff", url: "https://phantom.com" },
];

const asks = [
  { price: 21, amount: "1,000", total: "0.00021000", seller: "bc1p…d8k2", change: "+2.4%" },
  { price: 22, amount: "4,500", total: "0.00099000", seller: "bc1p…73vx", change: "+4.1%" },
  { price: 24, amount: "10,000", total: "0.00240000", seller: "bc1q…0m44", change: "+8.8%" },
  { price: 26, amount: "25,000", total: "0.00650000", seller: "bc1p…aa19", change: "+12.0%" },
];

const bidRows = [
  { price: "19", amount: "2,400", total: "0.00045600" },
  { price: "18", amount: "8,000", total: "0.00144000" },
  { price: "17", amount: "12,500", total: "0.00212500" },
];

const demoPsbt =
  "cHNidP8BAHECAAAAAfM4S7G8R2Yx7qd6lAEtW2vD8gSdqQfvN9uGmGd3AQAAAAD/////AlDDAAAAAAAAFgAUq7s4fAq3L7ax7D3u8G6TKsAMh5vQPwIAAAAAACJRIOZ0YWYtY3JjMjAtbGVhZi1vZmZlci0wMDQAAAEBH0BCDwAAAAAAFgAUY3JjMjBsZWFmbWFya2V0c2VsbGVyAAAA";

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

function shortAddress(address: string) {
  return address.length > 14 ? `${address.slice(0, 7)}…${address.slice(-5)}` : address;
}

export default function Home() {
  const [walletOpen, setWalletOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [account, setAccount] = useState("");
  const [walletName, setWalletName] = useState("");
  const [selectedAsk, setSelectedAsk] = useState<(typeof asks)[number] | null>(null);
  const [tradeStep, setTradeStep] = useState<"review" | "locked" | "signed">("review");
  const [toast, setToast] = useState("");
  const [message, setMessage] = useState("I confirm order #LEAF-004 on leaf market.");
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);

  const bestAsk = asks[0];
  const depth = useMemo(
    () => [...asks.map((a) => Number(a.amount.replace(",", ""))), ...bidRows.map((b) => Number(b.amount.replace(",", "")))],
    [],
  );
  const maxDepth = Math.max(...depth);

  function notify(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function connectWallet(wallet: (typeof wallets)[number]) {
    const provider = providerFor(wallet.id);
    if (!provider) {
      window.open(wallet.url, "_blank", "noopener,noreferrer");
      notify(`未检测到 ${wallet.name}，已打开安装页面`);
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
      if (!accounts[0]) throw new Error("钱包未返回 Bitcoin 地址");
      setAccount(accounts[0]);
      setWalletName(wallet.name);
      setWalletOpen(false);
      notify(`${wallet.name} 已连接`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "钱包连接已取消");
    } finally {
      setBusy(false);
    }
  }

  function connectDemo() {
    setAccount("bc1p3leaf7demo2market5xk90v8s9yq34c6n2j");
    setWalletName("演示钱包");
    setWalletOpen(false);
    notify("演示钱包已连接");
  }

  function startOrder(ask: (typeof asks)[number]) {
    if (!account) {
      setWalletOpen(true);
      notify("请先连接钱包");
      return;
    }
    setSelectedAsk(ask);
    setTradeStep("review");
    setSignature("");
  }

  async function signPsbt() {
    if (!selectedAsk) return;
    const wallet = wallets.find((item) => item.name === walletName);
    const provider = wallet ? providerFor(wallet.id) : undefined;
    setBusy(true);
    try {
      if (provider?.signPsbt) {
        await provider.signPsbt(demoPsbt, { autoFinalized: false });
      } else if (provider?.signPSBT) {
        await provider.signPSBT(demoPsbt);
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
      setTradeStep("signed");
      notify("签名完成，交易已提交");
    } catch {
      notify("签名已取消，订单仍处于锁定状态");
    } finally {
      setBusy(false);
    }
  }

  async function signCustomMessage() {
    if (!message.trim()) {
      notify("请输入待签名内容");
      return;
    }
    const wallet = wallets.find((item) => item.name === walletName);
    const provider = wallet ? providerFor(wallet.id) : undefined;
    setBusy(true);
    try {
      const result = provider?.signMessage
        ? await provider.signMessage(message, "bip322-simple")
        : `demo_${btoa(unescape(encodeURIComponent(message))).slice(0, 28)}`;
      setSignature(result);
      notify("消息签名已生成");
    } catch {
      notify("消息签名已取消");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    notify("已复制");
  }

  return (
    <main>
      <header className="nav-shell">
        <nav className="nav">
          <a className="brand" href="#" aria-label="leaf market home">
            <span className="brand-mark"><Leaf size={17} strokeWidth={2.4} /></span>
            <span>leaf</span>
          </a>
          <div className={`nav-links ${mobileOpen ? "is-open" : ""}`}>
            <a className="active" href="#market">市场</a>
            <a href="#orders">我的订单</a>
            <a href="#sign">签名工具</a>
            <a href="https://crc.garden" target="_blank" rel="noreferrer">
              CRC-20 <ArrowUpRight size={13} />
            </a>
          </div>
          <div className="nav-actions">
            <button className="network-pill"><span /> Bitcoin 主网 <ChevronDown size={13} /></button>
            <button className="wallet-button" onClick={() => setWalletOpen(true)}>
              <WalletCards size={16} />
              {account ? shortAddress(account) : "连接钱包"}
            </button>
            <button className="menu-button" onClick={() => setMobileOpen((value) => !value)} aria-label="打开菜单">
              <Menu size={20} />
            </button>
          </div>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-grid" />
        <div className="hero-content">
          <div>
            <div className="eyebrow"><Sparkles size={13} /> Bitcoin 原生交易市场</div>
            <h1>快捷交易<br /><em>CRC-20</em> 资产</h1>
            <p>非托管 · PSBT 原子结算 · 你的密钥始终留在钱包中</p>
          </div>
          <div className="hero-stats">
            <div><span>24h 成交额</span><strong>0.8421 BTC</strong><small className="up">↗ 18.6%</small></div>
            <div><span>活跃订单</span><strong>128</strong><small>12 个市场</small></div>
            <div><span>协议费率</span><strong>0.5%</strong><small>链上结算</small></div>
          </div>
        </div>
      </section>

      <section className="ticker-strip" aria-label="market ticker">
        <div><span>LEAF / BTC</span><strong>21 sats</strong><em>+2.4%</em></div>
        <div><span>24H HIGH</span><strong>26 sats</strong></div>
        <div><span>24H LOW</span><strong>17 sats</strong></div>
        <div><span>FLOOR</span><strong>0.00021 BTC</strong></div>
        <div><span>HOLDERS</span><strong>3,841</strong></div>
      </section>

      <section className="market-section" id="market">
        <div className="section-heading">
          <div>
            <span className="section-index">01 / MARKET</span>
            <h2>LEAF 交易市场</h2>
          </div>
          <div className="token-badge">
            <span className="token-symbol"><Leaf size={19} /></span>
            <div><strong>LEAF</strong><small>CRC-20 · Bitcoin</small></div>
            <ChevronDown size={17} />
          </div>
        </div>

        <div className="market-grid">
          <div className="orderbook panel">
            <div className="panel-head">
              <div><strong>订单簿</strong><span className="live-dot">实时</span></div>
              <div className="view-toggles"><button className="selected">全部</button><button>卖单</button><button>买单</button></div>
            </div>
            <div className="table-head">
              <span>价格 (sats)</span><span>数量 (LEAF)</span><span>总额 (BTC)</span><span>卖家</span><span />
            </div>
            <div className="book-label ask-label"><ArrowDown size={12} /> 卖单</div>
            {asks.map((ask) => (
              <div className="book-row ask-row" key={ask.price}>
                <div className="depth-bar red" style={{ width: `${(Number(ask.amount.replace(",", "")) / maxDepth) * 48}%` }} />
                <span className="price ask-price">{ask.price}</span>
                <span>{ask.amount}</span>
                <span>{ask.total}</span>
                <span className="seller">{ask.seller}</span>
                <button onClick={() => startOrder(ask)}>购买</button>
              </div>
            ))}
            <div className="spread-row">
              <div><span className="pulse" /><strong>{bestAsk.price} sats</strong><small>≈ $0.0142 / LEAF</small></div>
              <span>价差 9.5%</span>
            </div>
            <div className="book-label bid-label"><ArrowUpRight size={12} /> 买单</div>
            {bidRows.map((bid) => (
              <div className="book-row bid-row" key={bid.price}>
                <div className="depth-bar green" style={{ width: `${(Number(bid.amount.replace(",", "")) / maxDepth) * 48}%` }} />
                <span className="price bid-price">{bid.price}</span>
                <span>{bid.amount}</span>
                <span>{bid.total}</span>
                <span className="seller">bc1p…{bid.price}f0</span>
                <button className="outline">出售</button>
              </div>
            ))}
          </div>

          <aside className="quick-trade panel">
            <div className="panel-head"><strong>快捷购买</strong><span className="safe"><ShieldCheck size={14} /> PSBT 安全交易</span></div>
            <div className="form-block">
              <label>支付</label>
              <div className="input-shell">
                <input value="0.00100000" readOnly aria-label="支付金额" />
                <span>BTC</span>
              </div>
              <div className="balance"><span>≈ $67.42</span><span>余额 0 BTC</span></div>
            </div>
            <div className="swap-line"><span><ArrowDown size={15} /></span></div>
            <div className="form-block">
              <label>获得</label>
              <div className="input-shell output">
                <input value="47,619" readOnly aria-label="获得数量" />
                <span><Leaf size={14} /> LEAF</span>
              </div>
              <div className="balance"><span>最佳价格 21 sats</span><span>滑点 &lt; 0.5%</span></div>
            </div>
            <div className="quote-box">
              <div><span>订单价格</span><strong>21 sats / LEAF</strong></div>
              <div><span>网络费（预估）</span><strong>1,240 sats</strong></div>
              <div><span>协议费</span><strong>500 sats</strong></div>
              <div className="quote-total"><span>预计支付</span><strong>0.00101740 BTC</strong></div>
            </div>
            <button className="primary wide" onClick={() => account ? startOrder(bestAsk) : setWalletOpen(true)}>
              {account ? "审核并锁定订单" : "连接钱包开始交易"} <ArrowUpRight size={17} />
            </button>
            <p className="microcopy"><LockKeyhole size={12} /> 资金由 Bitcoin 脚本锁定，平台无法托管</p>
          </aside>
        </div>
      </section>

      <section className="flow-section" id="orders">
        <div className="section-heading light">
          <div><span className="section-index">02 / HOW IT WORKS</span><h2>三步完成原子交易</h2></div>
          <p>从锁单到链上确认，每一步都可验证。</p>
        </div>
        <div className="steps">
          <article><span>01</span><LockKeyhole /><h3>下单锁单</h3><p>选择卖单并确认报价，订单在限定时间内为你锁定。</p></article>
          <article><span>02</span><FileSignature /><h3>审核 PSBT</h3><p>清晰核对每个输入、输出、矿工费与最终到账地址。</p></article>
          <article><span>03</span><ShieldCheck /><h3>钱包签名</h3><p>在你的钱包内确认签名，交易广播并等待链上确认。</p></article>
        </div>
      </section>

      <section className="sign-section" id="sign">
        <div className="sign-copy">
          <span className="section-index">03 / MESSAGE SIGNER</span>
          <h2>自定义消息签名</h2>
          <p>使用钱包证明地址所有权。消息签名与交易签名完全分离，不会移动任何资产。</p>
          <ul>
            <li><Check size={14} /> 签名前完整展示原文</li>
            <li><Check size={14} /> 优先使用 BIP-322 标准</li>
            <li><Check size={14} /> 不上传私钥或助记词</li>
          </ul>
        </div>
        <div className="sign-card">
          <div className="field-label"><label htmlFor="message">待签名内容</label><span>{message.length} / 280</span></div>
          <textarea id="message" maxLength={280} value={message} onChange={(event) => setMessage(event.target.value)} />
          <div className="warning"><Info size={15} /><span>只签署你理解的内容。任何网站都不应要求你签署空白或隐藏消息。</span></div>
          {signature && (
            <div className="signature-result">
              <span>签名结果</span>
              <code>{signature}</code>
              <button onClick={() => copy(signature)} aria-label="复制签名"><Copy size={15} /></button>
            </div>
          )}
          <button className="primary wide" onClick={() => account ? signCustomMessage() : setWalletOpen(true)} disabled={busy}>
            <FileSignature size={17} /> {account ? "签署这段消息" : "连接钱包后签名"}
          </button>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#"><span className="brand-mark"><Leaf size={17} /></span><span>leaf</span></a>
        <p>CRC-20 assets, settled on Bitcoin.</p>
        <div><a href="https://crc.garden" target="_blank" rel="noreferrer">协议</a><a href="#">文档</a><a href="#">风险说明</a></div>
        <span>© 2026 leaf market</span>
      </footer>

      {walletOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setWalletOpen(false)}>
          <div className="modal wallet-modal">
            <button className="modal-close" onClick={() => setWalletOpen(false)}><X size={19} /></button>
            <span className="modal-icon"><WalletCards /></span>
            <h2>连接 Bitcoin 钱包</h2>
            <p>选择你常用的钱包。连接不会授权任何交易。</p>
            <div className="wallet-list">
              {wallets.map((wallet) => (
                <button onClick={() => connectWallet(wallet)} key={wallet.id} disabled={busy}>
                  <span className="wallet-mark" style={{ background: wallet.color }}>{wallet.mark}</span>
                  <strong>{wallet.name}</strong>
                  <span className={`detected ${providerFor(wallet.id) ? "yes" : ""}`}>
                    {providerFor(wallet.id) ? "已检测" : "安装"} <ArrowUpRight size={13} />
                  </span>
                </button>
              ))}
            </div>
            <button className="demo-link" onClick={connectDemo}>没有钱包？进入交互演示</button>
            <small>连接即表示你同意风险说明。本应用永远不会索取助记词。</small>
          </div>
        </div>
      )}

      {selectedAsk && (
        <div className="modal-backdrop">
          <div className="modal trade-modal">
            <button className="modal-close" onClick={() => setSelectedAsk(null)}><X size={19} /></button>
            <div className="trade-title">
              <span className={`modal-icon ${tradeStep === "signed" ? "success" : ""}`}>
                {tradeStep === "review" ? <LockKeyhole /> : tradeStep === "locked" ? <FileSignature /> : <Check />}
              </span>
              <div>
                <span className="step-count">{tradeStep === "review" ? "步骤 1 / 2" : tradeStep === "locked" ? "步骤 2 / 2" : "交易已提交"}</span>
                <h2>{tradeStep === "review" ? "确认并锁定订单" : tradeStep === "locked" ? "审核卖单 PSBT" : "签名成功"}</h2>
              </div>
            </div>
            {tradeStep === "review" && (
              <>
                <div className="order-summary">
                  <div><span>买入</span><strong>{selectedAsk.amount} LEAF</strong></div>
                  <div><span>单价</span><strong>{selectedAsk.price} sats</strong></div>
                  <div><span>支付</span><strong>{selectedAsk.total} BTC</strong></div>
                  <div><span>卖家</span><strong>{selectedAsk.seller}</strong></div>
                </div>
                <div className="lock-note"><LockKeyhole size={17} /><span>锁单有效期为 10 分钟。锁定订单不会立即签名或移动资产。</span></div>
                <button className="primary wide" onClick={() => setTradeStep("locked")}>锁定订单并查看 PSBT <ArrowUpRight size={17} /></button>
              </>
            )}
            {tradeStep === "locked" && (
              <>
                <div className="timer"><span className="pulse" />订单已锁定 <strong>09:42</strong></div>
                <div className="psbt-review">
                  <div className="psbt-head"><span>SELLER PSBT</span><button onClick={() => copy(demoPsbt)}><Copy size={13} /> 复制</button></div>
                  <code>{demoPsbt}</code>
                </div>
                <div className="tx-details">
                  <div><span>你的支出</span><strong>{selectedAsk.total} BTC</strong></div>
                  <div><span>你的到账</span><strong>{selectedAsk.amount} LEAF</strong></div>
                  <div><span>矿工费（预估）</span><strong>1,240 sats</strong></div>
                  <div><span>到账地址</span><strong>{shortAddress(account)}</strong></div>
                </div>
                <label className="confirm-check"><input type="checkbox" defaultChecked /><span>我已核对金额、资产和到账地址</span></label>
                <button className="primary wide" onClick={signPsbt} disabled={busy}>
                  <FileSignature size={17} /> {busy ? "等待钱包确认…" : "在钱包中签名确认"}
                </button>
              </>
            )}
            {tradeStep === "signed" && (
              <div className="success-state">
                <p>交易已提交到 Bitcoin 网络。获得第一个区块确认后订单将自动完成。</p>
                <div><span>交易 ID</span><code>4d81c9…7ef2</code><ExternalLink size={14} /></div>
                <button className="primary wide" onClick={() => setSelectedAsk(null)}>完成</button>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <div className="toast"><Check size={15} />{toast}</div>}
      <button className="help-button" aria-label="帮助"><CircleHelp size={19} /></button>
    </main>
  );
}
