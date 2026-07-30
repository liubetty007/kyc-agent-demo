# AA KYC Rules — 15 Jul 2026

> 本页是 KYC / Compliance 的网页审核副本，规则版本为 `AA-KYC-2026-07-15`。
> 系统显示 `Required`、`Conditional Required` 和 `Supporting Documents`。辅助材料不计入 missing。
> LLM 只辅助文件提取、分类、案件问答和草稿，不作最终 KYC / Compliance 决策。

## 1. 文件分组规则

| 类型 | 定义 | Missing 计算 |
|---|---|---|
| Required | 每个适用案件都必须提供 | 未被 KYC Accept 即计入 missing |
| Conditional Required | 仅当页面显示的触发条件成立时必须提供 | 条件成立并进入清单后，未被 KYC Accept 即计入 missing |
| Supporting Documents | 帮助解释业务、资金来源或交易背景的辅助材料 | 不计入 missing |

## 2. Required

| 文件 / 信息 | 规则 |
|---|---|
| Certificate of Incorporation | 所有公司必须提供；香港 COI 无日期限制 |
| Memorandum & Articles of Association | 所有公司必须提供适用的组织章程文件 |
| Ownership Structure Chart | 原则上必须穿透至自然人 UBO；上市、持牌机构及其合资格多数持股子公司可按批准的豁免规则处理 |
| Source of Funds Declaration / Confirmation | Low / Medium risk 可使用 onboarding form 内声明或书面确认，不默认要求证明文件 |
| Institution Onboarding Form | New customer 必须提供 |
| Counterparty Due Diligence Form | New counterparty 必须提供，取代 Institution Onboarding Form |
| Authorization Letter | 必须提供；授权代表及联系邮箱须与 KYC form 一致 |
| Mutual NDA | 必须提供，并按签署、日期、主体及模板规则核验 |
| Certified Passport / Accepted National ID | 每名 Director、Authorized Representative、UBO 必须提供 |
| Proof of Current Residential Address | 每名适用人士必须提供；默认最近 3 个月内 |

## 3. Conditional Required — 注册地与实体类型

| 条件 | 文件 / 规则 |
|---|---|
| 香港公司 | 有效 Business Registration Certificate；成立不足 1 年提供 NNC1，满 1 年提供最新 NAR1 |
| 香港董事变更 | ND2A |
| 香港股东变更或 NNC1/NAR1 未反映当前股东 | Register of Members；资料超过 6 个月时，仅在规则允许下接受当前信息邮件确认 |
| 新加坡公司 | 最新 ACRA BizFile |
| 香港、新加坡以外公司 | Certificate of Incumbency，出具日期不超过 6 个月 |
| LLC | Operating Agreement |
| Corporation | Bylaws |
| Limited Partnership | Limited Partnership Agreement；如结构适用，再提供 Investment Manager / Advisor Agreement、Administrator Agreement |
| Trust | Trust Deed，需识别 settlor、trustee、beneficiary/class、protector/executor 及 ultimate controllers |
| SPC / Fund | Fund Incumbency、Fund Management Agreement、Investment Manager / Advisor Agreement、Administrator Agreement |
| 公司曾更名 | Certificate of Change of Name |
| 美国注册或运营 | 先取得 Legal / Compliance exception approval；批准后再按州别要求文件 |

## 4. Conditional Required — 身份、风险与资金来源

| 条件 | 文件 / 规则 |
|---|---|
| Passport / ID 不是 Certified True Copy | 完成 AU10TIX；完成结果有效 6 个月 |
| 护照 | 剩余有效期至少 3 个月 |
| 地址证明因 onboarding 延误过期 | 默认 3 个月；仅有记录的延误可放宽至 6 个月 |
| High risk / EDD | SOF / SOW 证明、UBO / Senior Management 背景；运营实体另需 Financial Statements / Operating Evidence |
| Crypto 资金来源 | Source of Crypto Assets / Supporting Evidence |
| Mining proceeds | Mining Proof，例如 Antpool / mining-pool observer evidence |
| Financing / third-party funding | Financing Agreement、Investor / Lender Information、Proof of Fund Transfer 作为 Supporting Documents；需要进一步解释时再索取 |
| Entity shareholder | 穿透至自然人 UBO；无法完全穿透时提供适用的 no-other-UBO declaration |
| 授权范围或签署权证据不足 | Board Resolution |

## 5. Financial Institution / Client Asset Manager

| 文件 | 规则 |
|---|---|
| Financial Licence / Registry Screenshot | 持牌金融机构或受监管资产管理人必须提供 |
| Letter of Undertaking | 适用 FI / client-asset-manager 案件必须提供，不可被其他 AML 文件替代 |
| AML framework evidence | `Wolfsberg Questionnaire`、`AA AML Questionnaire`、`acceptable AML Policy` 三者提供其一 |

## 6. 香港时效细则

| 文件 | 规则 |
|---|---|
| COI | 无日期限制 |
| Business Registration Certificate | 必须仍在有效期 |
| NNC1 | 公司成立不足 1 年 |
| NAR1 | 公司成立满 1 年，使用最新申报；关注法定 42 日申报期 |
| ND2A | NNC1 / NAR1 后有董事变更 |
| Register of Members | NNC1 / NAR1 后有股东变更 |

## 7. UBO、CTC 与认证人

| 项目 | 规则 |
|---|---|
| UBO threshold | 自然人直接或间接持股 / 控制 `>= 25%` |
| UBO 豁免 | 上市或持牌实体及其合资格多数持股子公司，须有支持豁免的状态及持股关系证据 |
| Certified True Copy | 由规则认可的专业人士 / 机构认证；需可识别认证人姓名、身份、日期及签署 |
| AU10TIX | 只在 Passport / ID 未提供 CTC 时触发 |

## 8. 定期复核与事件触发

| 风险等级 | Regular Review 周期 |
|---|---|
| High | 每 1 年 |
| Medium | 每 2 年 |
| Low | 每 3 年 |

以下事件可提前触发复核：股东、董事、UBO、业务、注册地、牌照、资金来源、负面新闻或其他重大风险变化。

## 9. NDA 与签署

| 项目 | 规则 |
|---|---|
| 签署信息 | 需要签字的文件必须有签署人姓名、职务 / 头衔、真实日期 |
| 格式 | NDA 使用 PDF，不得保留未填写括号或底色 |
| 标准有效期 | 2 年 |
| 我方模板被修改 | 需要 Legal confirmation email |
| 使用对方模板 | 需要 Legal + Business confirmation email |
| 我方签约主体 | Antalpha Digital Pte. Ltd.; Northstar Digital (HK) Limited; URSALPHA DIGITAL LLC |

## 10. 系统实现说明

| 模块 | 当前行为 |
|---|---|
| Case fields | 开户前只输入客户关系、实体类型及公司基本信息；Risk Rating 由 Compliance review 结果产生 |
| Checklist | 根据案件字段与规则实时生成；旧案件已接收及已 Accept 文件不会被删除 |
| Document panel | 显示 Required / Conditional Required 及每项触发条件 |
| Compliance snapshot | 只统计 Required 与已适用的 Conditional Required；Supporting Documents 不计入 missing |
| AI 问答与邮件 | 使用同一套实时规则清单回答案件进度、识别文件与生成缺件内容 |
