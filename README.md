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
- 直接读取 crc.garden 的 LEAF 索引、实时卖单、市场统计与费率配置
- 通过 crc.garden 完成锁单、买方 PSBT 准备、签名合并和主网广播
- 真实卖家 PSBT 的结构、输入、输出和手续费校验
- 钱包 PSBT 签名和已完成交易的 Bitcoin 主网广播
- 由真实钱包执行的 BIP-322 消息签名
- 解析失败、缺少 UTXO 金额或异常高费率时禁止签名

实时市场使用 crc.garden 的生产接口作为 CRC-20 索引与订单来源。手动导入的外部 PSBT
不具备该来源保证，界面会将其单独标记为未验证。

## 部署

推荐将仓库导入 Vercel 并使用 Git 集成自动部署。不要把 Vercel Token、私钥或助记词
写入仓库或环境变量。
