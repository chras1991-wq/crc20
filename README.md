# leaf market

面向 CRC-20 资产的非托管 Bitcoin PSBT 审核和签名工具。

## 本地运行

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 当前实现

- UniSat、OKX、Xverse、Leather、Magic Eden、Phantom 浏览器钱包检测
- 真实卖家 PSBT 的结构、输入、输出和手续费校验
- 钱包 PSBT 签名和已完成交易的 Bitcoin 主网广播
- 由真实钱包执行的 BIP-322 消息签名
- 解析失败、缺少 UTXO 金额或异常高费率时禁止签名

当前工具能真实处理 Bitcoin PSBT，但不能验证 CRC-20 资产的有效性。完整交易市场仍需
接入权威 CRC-20 索引器和持久化订单/锁单服务。没有协议证明时，界面会明确显示资产
未验证，不会使用演示数据冒充验证结果。

## 部署

推荐将仓库导入 Vercel 并使用 Git 集成自动部署。不要把 Vercel Token、私钥或助记词
写入仓库或环境变量。
