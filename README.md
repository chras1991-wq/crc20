# leaf market

面向 CRC-20 资产的非托管 Bitcoin PSBT 交易界面。

## 本地运行

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 当前实现

- 响应式市场、订单簿和快捷交易界面
- UniSat、OKX、Xverse、Leather、Magic Eden、Phantom 浏览器钱包检测
- 锁单、卖家 PSBT 审核和钱包签名交互
- BIP-322 优先的自定义消息签名工具
- 无钱包时可使用完整交互演示

当前仓库提供可部署的前端原型。生产环境的真实成交还需要接入 CRC-20
索引器、订单/锁单服务、PSBT 构造与验证服务，以及 Bitcoin 广播节点。服务端必须
独立验证 PSBT 的每个输入和输出，不应信任浏览器提交的金额或地址。

## 部署

推荐将仓库导入 Vercel 并使用 Git 集成自动部署。不要把 Vercel Token、私钥或助记词
写入仓库或环境变量。
