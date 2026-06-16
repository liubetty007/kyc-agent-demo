# KYC Document Matrix — 给 KYC 团队审核用

> 这个文件是给非技术同事看的“政策清单”。如果需要改 Demo 里的自动规则，技术配置在 `config/kyb-document-matrix.json`。建议先让 KYC/Compliance 同事在本文件里确认规则，再同步到 JSON。

## 1. 已确认基础规则

| 项目 | 当前规则 | 是否确认 |
|---|---|---|
| UBO 门槛 | 自然人直接或间接持股 **>= 25%** | ✅ 已确认 |
| 地址证明有效期 | Proof of Current Residential Address 必须是最近 **3 个月内** | ✅ 已确认 |
| 高风险国家列表 | 后续由 Compliance 维护；Agent 不自行判断 | ✅ 已确认 |
| Crypto 钱包地址 | 不默认强制；看客户可提供什么资料 | ✅ 已确认 |
| Mining proof | 挖矿业务必须提供，例如 Antpool Observer Link 或等价证明 | ✅ 已确认 |
| Financing evidence | 资金来源为融资时必须提供融资证明 | ✅ 已确认 |

---

## 2. 注册地规则

| 注册地 | 当前处理方式 | Agent 动作 |
|---|---|---|
| 香港 | 可接受 | 标准 KYC + 要求 HK Confirmation |
| 新加坡 | 可接受 | 标准 KYC |
| BVI | 可接受，但有 offshore risk | 标记 offshore risk |
| Cayman | 可接受，但有 offshore risk | 标记 offshore risk |
| 美国 | 需具体到州 | 要求补充州信息 + Legal Review |
| 欧洲国家 | 需法务评估 | Legal Review Required |
| 其他 offshore | 需关注 | 标记 offshore risk，后续可触发 EDD |
| 其他国家 | 需法务评估 | Legal Review Required |
| 中国大陆 | 不接受 | Prohibited |
| 高风险国家 | 后续提供列表 | 命中后按 Compliance 规则处理 |

---

## 3. 所有公司都需要的 Constitutional Documents

| 文件 | 当前是否必需 | 备注 |
|---|---|---|
| Certificate of Incorporation | 必需 | 公司注册证书 |
| Business Registration Certificate | 必需 / 如适用 | 香港/新加坡等通常需要 |
| Articles of Association | 必需 | 公司章程 |
| Register of Directors | 必需 | 董事名册 |
| Register of Shareholders | 必需 | 股东名册 |
| Ownership Structure Chart | 必需 | 需要穿透到 UBO |
| Business Description | 必需 | 业务说明 |
| Source of Funds | 必需 | 资金来源说明 |
| Non-US Person & Non-solicitation in HK Confirmation | HK 公司必需 | 仅香港注册公司 |
| AML Questionnaire | 如适用 | Crypto / 高风险 / 金融类客户建议必需 |

---

## 4. Internal Forms

| 文件 | 当前是否必需 | 备注 |
|---|---|---|
| Institution Onboarding Form | 必需 | 内部开户表 |
| Authorization Letter | 必需 | 授权书 |
| Mutual NDA | 必需 | NDA |
| Board Resolution | 必需 | 董事会决议 |
| Declaration of Source of Fund/Wealth | 必需 | 资金/财富来源声明 |

---

## 5. Associated Individual 文件

适用对象：

- Director
- Authorized Representative / AR
- UBO，即直接或间接持股 >= 25% 的自然人

| 文件 | Director | AR | UBO | 备注 |
|---|---:|---:|---:|---|
| Online Identity Verification | 必需 | 必需 | 必需 | 在线身份验证 |
| Passport / ID | 必需 | 必需 | 必需 | 证件需有效 |
| Proof of Current Residential Address | 必需 | 必需 | 必需 | 最近 3 个月内 |

---

## 6. Crypto 相关客户额外资料

| 条件 | 文件/信息 | 当前是否必需 | 备注 |
|---|---|---|---|
| Crypto-related business | Source of Crypto Assets / Supporting Evidence | 必需 | 必须解释资产来源 |
| Crypto-related business | AML Questionnaire | 建议必需 / 如适用 | Demo 当前设为必需 |
| Crypto-related business | Wallet Address List | 非强制 | 如客户可提供，或需要链上筛查时再要求 |

可接受替代证明包括：

- Exchange statement
- Custodian statement
- Transaction history
- Audited financial statement
- Bank statement
- Financing agreement
- Mining pool evidence
- Wallet address，若客户可以提供

---

## 7. Mining 客户额外资料

| 文件/信息 | 当前是否必需 | 示例/备注 |
|---|---|---|
| Mining Proof | 必需 | Antpool Observer Link 或等价矿池观察者链接 |
| Mining Revenue Evidence | 建议 | 矿池收益记录 |
| Wallet Receiving Mining Proceeds | 非强制 | 如客户可提供 |

---

## 8. Financing 来源客户额外资料

如果 Source of Funds 是 financing / fundraising / investor contribution / shareholder loan 等，要求：

| 文件/信息 | 当前是否必需 | 备注 |
|---|---|---|
| Financing Agreement | 必需 | 融资/借款/投资协议 |
| Investor / Lender Information | 必需 | 出资方/贷款方信息 |
| Proof of Fund Transfer | 必需 | 资金划转证明 |
| Bank Statement / Wallet Transaction Evidence | 支持文件 | 可用于证明资金路径 |
| Board Approval / Use of Proceeds | 视情况 | 后续可扩展 |

---

## 9. KYC/Compliance 需要补充确认的问题

请 KYC/Compliance 同事检查以下内容：

1. Business Registration Certificate 是否所有公司都必须，还是仅适用司法辖区必须？
2. AML Questionnaire 是否应对所有 Crypto 客户强制？
3. 是否需要加入 Certificate of Incumbency / Good Standing？如果需要，有效期是否 6 个月？
4. 是否需要区分 Director、AR、UBO 的地址证明要求？当前三类都要求。
5. 是否需要把 `>=25%` UBO 门槛降到 10% 用于高风险客户？当前 Demo 只用 25%。
6. 高风险国家列表由谁维护？后续需要提供名单。
7. 哪些国家/地区属于 prohibited，哪些只是 legal review？
8. Mining proof 除 Antpool 外是否接受 Foundry、ViaBTC、F2Pool、Binance Pool 等？
9. Crypto 客户如果不提供 wallet address，哪些替代资料足够？
10. 是否需要加入 EDD Trigger Matrix，例如 PEP、adverse media、复杂股权结构、交易规模阈值？

---

## 10. 非技术同事怎么反馈

最简单方式：直接在这个文档里用评论或文字补充：

```text
新增条件：如果客户是 XXX，需要提供 YYY。
修改条件：AML Questionnaire 对所有 Crypto 客户必须提供。
删除条件：Mutual NDA 不应该是开户必需文件。
待确认：BVI 是否需要 Certificate of Incumbency？
```

技术同事或 Claude 再把确认后的内容同步到 `config/kyb-document-matrix.json`。
