# KYC Document Matrix — 给 KYC 团队审核用

> 这个页面是给 KYC / Compliance 同事看的政策清单。自动规则配置在
> `config/kyb-document-matrix.json`，确定性审核逻辑在 `src/lib/kyb/review.ts`。
> LLM 只辅助提取、分类和草稿，不做最终 KYC / Compliance 决策。

## 1. 标准 KYC 基础规则

| 项目 | 当前规则 | Agent 动作 |
|---|---|---|
| KYC 有效期 | 机构通过 KYC 后有效期为 6 个月 | 作为复核规则记录 |
| 文件格式 | 所有提交文件必须为 PDF | 非 PDF 文件触发 revision / review issue |
| 签署规范 | 需要签字的文件必须有签署人姓名、职务/头衔、日期 | Board Resolution、NDA、授权书等触发人工复核 |
| 受限国家 | 注册国需对照受限制国家清单 | 命中 prohibited 或 manual review |
| 新业务国家 | 过往未开展业务的国家需触发业务确认流程 | 先进入人工复核 |

## 2. 核心文件审核要素

| 文件 | 是否必需 | 关键审核点 |
|---|---|---|
| Certificate of Incorporation | 必需 | 需体现注册日期、公司编号、名称变更信息 |
| Certificate of Incumbency | 必需 | 出具日期必须在近 6 个月内 |
| Business Registration Certificate | 如适用 / HK 必需 | 香港公司必须提供 |
| Articles of Association | 必需 | 如无章程，需提供 Operating Agreement |
| Source of Wealth / Source of Funds | 必需 | 需包含财富累积时间点、形式、合作机构、数量/金额、预期年/月交易量，且交易量需用 USD |
| Board Resolution | 必需 | 即使一人董事也必须提交；需列明授权人士和业务范围 |
| NDA | 必需 | 必须由授权代表签署，并核验我方签约主体 |
| Passport | Associated Individual 必需 | 必须提供护照并完成 Au10tix 线上身份认证 |
| Proof of Current Residential Address | Associated Individual 必需 | 最近 3 个月内出具 |

## 3. 香港公司特定规则

| 条件 | 文件 / 规则 | Agent 动作 |
|---|---|---|
| 香港注册公司 | 公司注册证明书 + 商业登记证 | 加入 checklist |
| 成立不满 1 年 | NNC1 | checklist 使用 NNC1 / NAR1 槽位，人工判断适用文件 |
| 成立满 1 年 | NAR1 | checklist 使用 NNC1 / NAR1 槽位，人工判断适用文件 |
| 香港业务确认 | Non-US Person & Non-solicitation in HK Confirmation | 加入 checklist |

## 4. COI / Incumbency 效期规则

| 文件 | 规则 |
|---|---|
| COI | 除香港、新加坡外，出具日期必须在近 6 个月内 |
| Certificate of Incumbency | 出具日期必须在近 6 个月内 |
| US Good Standing / State Status Evidence | 建议按 6 个月有效期复核 |

## 5. 美国机构州别规则

| State | 必需文件 |
|---|---|
| Delaware | Formation / Incorporation, Good Standing, Operating Agreement / Bylaws, EIN Confirmation Letter |
| Wyoming | Articles, Good Standing, Operating Agreement, EIN, Certificate of Incumbency, County Clerk Search Evidence |
| Nevada | Articles, Certificate of Existence, Nevada State Business License, Operating Agreement |
| California | Articles, Statement of Information (Form SI-550), EIN |
| Texas | Certificate of Formation, Certificate of Fact - Status, Operating Agreement, EIN |
| New York | LLC 需 Publication Proof |
| Washington D.C. | Basic Business License |

## 6. 风险触发文件

| 触发条件 | 文件 / 动作 |
|---|---|
| 申请机构被另一家公司持有 | Ownership Structure Chart 强制要求 |
| 股权无法穿透至 UBO | 要求声明：No other shareholders are UBOs of XXX with total >= 25% beneficial ownership |
| 金融机构或管理用户资产 | AML Questionnaire 强制要求 |
| Crypto-related business | Source of Crypto Assets / Supporting Evidence + AML Questionnaire |
| Mining business | Mining Proof，例如 Antpool Observer Link 或等价证明 |
| Source of Funds 为 financing | Financing Agreement, Investor / Lender Information, Proof of Fund Transfer |

## 7. Worldcheck DD 规则

| 场景 | Agent 动作 |
|---|---|
| 最新 Match 可内部 Resolve | 拦截预警，不向客户发送邮件 |
| 机构未完成 KYC 或处于定期审查 | 并入日常提交通知中索要资料 |
| 机构已关户或关联人士已辞任 | 拦截，无需对客发送 |
| 从未提交 NCRS & PEP 表格 | 要求客户提交 NCRS & PEP Form |
| 已提交 NCRS & PEP，但有本次新闻预警 | 要求客户针对新闻说明 |
| 客户回复归档后 | 更新系统状态，并回复合规组原始邮件说明 case 状态 |

## 8. NDA 规则

| 项目 | 规则 |
|---|---|
| 格式 | NDA 必须为 PDF |
| 空白内容 | 不得保留未填写括号，需清除底色 |
| 我方签约主体 | AA: Antalpha Digital Pte. Ltd.; NS: Northstar Digital (HK) Limited; AI: URSALPHA DIGITAL LLC |
| 标准有效期 | 2 年 |
| 使用我方模板但对方改条款 | 必须要求业务提供法务确认邮件 |
| 使用他方模板 | 必须要求业务提供法务 + 业务双重确认邮件 |
| 我方发起签署 | 需收集他方签署人姓名、职称、邮箱、抄送邮箱 |

## 9. 邮件生成 SOP

| 项目 | 规则 |
|---|---|
| SLA | KYC 邮件优先级最高，4 小时内输出处理结果 |
| 输出内容 | KYC 表格、缺漏文件清单、缴交说明、邮件正文、授权书模板 |
| 文风 | 客观陈述，简单直述句 |
| 疑问句比例 | 不超过 10% |
| 日期格式 | 英文对外文件使用 05 May 2023 或严格 MM/DD/YYYY |

## 10. 官方查验映射

| 类型 | 查验网站 / 目标 |
|---|---|
| 香港地址证明 | 香港中电、香港水务署 |
| 机构状态 | 台湾商工登记、香港注册处 ICRIS、加拿大 Federal Corporations、阿布扎比 TAMM / ADGM、瑞士 Zefix |

## 11. 当前实现状态

| 模块 | 状态 |
|---|---|
| Checklist 生成 | 已加入 HK NNC1/NAR1、US state routing、AML asset-manager trigger |
| Deterministic Review | 已加入 PDF、6 个月效期、USD 交易量、Board Resolution、NDA 复核 issue |
| Email Intake LLM | 已加入新文件类型关键词和 checklist-id 约束 |
| Worldcheck | 规则已记录，仍需筛查事件数据结构后才能自动闭环 |
