# QingLong IDC — 青龙云业务一体化平台

> 基于 **Next.js 15 + Go** 构建的 IDC 服务器销售与运营管理系统，全链路 AI 辅助开发，功能持续迭代中。
>
> ⚠️ **免责声明**：本项目为开源参考实现，大量功能仍在完善阶段。请勿直接用于生产环境，线上出现的任何问题由使用者自行承担。

---

**服务器销售 · 客户自助 · 代理分销 · 工单 / 知识库 / AI 客服** 四位一体。  
前台极简，聚焦商品展示与下单；后台全面，覆盖所有运营业务。用户、代理、管理员三端完全分离。

---

***我们立意开篇，引星河筑梦。***

---

## 一、功能总览

### 用户前台（`/`）

| 模块 | 能力 |
|------|------|
| 商城 | 首页、服务器分类浏览、商品详情、购物车 |
| 账户 | 注册 / 登录 / 找回密码、邀请注册、短信 / 邮件验证 |
| 工作台 `/dashboard` | 订单、钱包、发票、优惠券、积分、收藏、浏览历史、通知 |
| 会员中心 `/membership` | 等级权益、续费、升级 |
| 结账 `/checkout` | 余额支付、充值、优惠券抵扣、订单生成 |
| 工单 | 创建、附件上传、评分、AI 初筛与自动分类 |
| 通知 | 站内公告、Web Push、WebSocket 实时推送 |
| 知识库 | 文档 `/docs`、API 文档 `/api-docs` |
| 代理 `/agent` | 推广链接、佣金明细、提现申请 |
| 服务器 | 开通、续费、到期提醒 |

### 管理后台（`/admin`）

| 模块 | 能力 |
|------|------|
| 数据总览 | 仪表盘、财务看板、利润趋势、Top 用户排行 |
| 用户管理 | 账号列表、等级调整、余额操作、批量推送通知 |
| 商品管理 | 商品、CPU 配置、机型、供应商、价目表 |
| 订单管理 | 订单列表、退款处理、收款对账 |
| 服务器实例 | 状态监控、批量分配、续费管理 |
| 内容运营 | 公告、优惠券、邮件模板、短信模板 |
| 工单 & SLA | 工单处理、SLA 配置与违规扫描、工单评分 |
| 代理管理 | 佣金配置、代理等级、提现审核 |
| 风控与安全 | WAF 规则 / 封禁 / 日志、登录历史、异常告警 |
| 数据 & 审计 | 积分、NPS、API Token 用量、操作日志、事件流 |
| 运维工具 | 数据导出（用户 / 订单 / 服务器 / 流水）、数据库备份 |

### AI & 通知

- 对接 **OpenAI 兼容接口**，工单自动分类与初次回复
- AI 用量配额管控 + 输入清洗（防 prompt 注入、过滤敏感词）
- 多通道通知：SMTP 邮件、阿里云短信、站内信、Web Push、WebSocket

### 安全与审计

- 密码 **bcrypt**、**JWT HS256**（密钥强制 ≥ 32 字节）
- CSRF 双 Cookie、CORS 白名单、Admin IP 白名单
- 内部接口 `X-Internal-Key` 前置校验（仅允许 BFF 发起）
- WAF：速率限制、请求体大小限制、规则匹配、自动封禁
- 登录限流、登录历史记录、异常登录侦测
- 完整审计日志（用户操作 / 定时任务 / 事件流）

---

## 二、技术栈

| 层级 | 技术选型 |
|------|---------|
| 前端 | Next.js 15 (App Router)、React 18、TypeScript、Tailwind CSS、Framer Motion |
| BFF | Next.js API Routes — `/api/[...proxy]` 注入 `X-Internal-Key` 后转发至 Go |
| 后端 | Go 1.21+、Gin、GORM |
| 数据库 | PostgreSQL 14+ |
| 实时通信 | WebSocket (gorilla/websocket) + Web Push (VAPID) |
| 三方集成 | OpenAI 兼容接口、SMTP、阿里云短信 |

---

## 三、目录结构

```
yuanma/
├── houduan/                      # Go 后端
│   ├── cmd/
│   │   ├── server/               # 启动入口、.env 加载
│   │   └── import_region_json/   # 行政区 JSON 导入工具
│   ├── config/                   # 配置加载与校验
│   ├── internal/
│   │   ├── database/             # GORM 初始化 + 自动迁移
│   │   ├── model/                # 数据表模型
│   │   ├── handler/              # 前台 HTTP 处理
│   │   │   └── admin/            # 管理后台 HTTP 处理
│   │   ├── middleware/           # auth / cors / csrf / waf / internal_key 等
│   │   ├── router/               # 路由注册
│   │   └── service/              # 业务层（定时任务、定价、AI、通知、JWT、邮件、短信、Realtime Hub）
│   ├── go.mod / go.sum
│   └── .env.example              # 环境变量示例
│
├── index/                        # Next.js 前端
│   ├── src/
│   │   ├── app/
│   │   │   ├── (前台页面)        # 首页、商城、登录、工作台、代理、文档……
│   │   │   ├── admin/            # 管理后台页面
│   │   │   └── api/[...proxy]/   # BFF 代理层
│   │   ├── components/           # 全局组件（Header、购物车、通知、实时 Provider 等）
│   │   └── lib/                  # 客户端 SDK、工具函数
│   ├── public/sw.js              # Web Push Service Worker
│   ├── scripts/                  # 启停辅助脚本
│   └── next.config.js
│
└── sql/
    ├── schema.sql                # 全量数据库 Schema
    └── backfill_core_scoring_policy.sql
```

---

## 四、环境变量

### 后端 `houduan/.env`

```dotenv
PORT=8080
APP_ENV=production
DATABASE_URL=postgres://USER:PASS@HOST:5432/DBNAME?sslmode=disable

# 安全（必填，生产环境不得使用默认值）
JWT_SECRET=<随机字符串，≥32 字节>
INTERNAL_API_KEY=<随机字符串，≥32 字节，须与前端一致>

# 网络
TRUSTED_PROXIES=127.0.0.1,::1
CORS_ALLOWED_ORIGINS=https://your-domain.com
COOKIE_SECURE=true

# WAF
WAF_ENABLED=true
WAF_RATE_LIMIT_PER_SEC=60
WAF_MAX_BODY_BYTES=26214400

# 可选：邮件
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# 可选：短信（阿里云）
ALIYUN_SMS_KEY=
ALIYUN_SMS_SECRET=
ALIYUN_SMS_SIGN=

# 可选：AI
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=

# 可选：Web Push
VAPID_PUBLIC=
VAPID_PRIVATE=
VAPID_SUBJECT=
```

### 前端 `index/.env.local`

```dotenv
GO_BACKEND_URL=http://127.0.0.1:8080
API_INTERNAL_KEY=<与后端 INTERNAL_API_KEY 完全一致>
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

> **重要**：`INTERNAL_API_KEY` 与 `JWT_SECRET` 均不得少于 32 字节，不得使用示例默认值，否则后端启动时会直接 fatal 退出。

---

## 五、本地启动

```bash
# 1. 初始化数据库
createdb serverai
psql -d serverai -f sql/schema.sql    # 也可首次启动时由 GORM 自动迁移

# 2. 启动后端
cd houduan
cp .env.example .env.local            # 按需填写配置项
go run ./cmd/server                   # 监听 :8080

# 3. 启动前端
cd ../index
pnpm install
pnpm dev                              # 监听 :3000
```

| 端点 | 地址 |
|------|------|
| 用户前台 | http://localhost:3000 |
| 管理后台 | http://localhost:3000/admin |

---

## 六、生产部署

1. **数据库**：新建专用数据库及账户，赋予 `SELECT / INSERT / UPDATE / DELETE / CREATE` 权限。

2. **后端编译**：
   ```bash
   GOOS=linux GOARCH=amd64 go build -o server ./cmd/server
   ```
   上传二进制，写入环境变量到 `/etc/serverai/backend.env`，用 **systemd** 守护进程管理。

3. **前端构建**：
   ```bash
   pnpm build && pnpm start    # 或使用 PM2 守护
   ```
   Nginx 反向代理到 Next.js，**不要直接暴露 Go 端口**，必须经 BFF 层。

4. **HTTPS**：使用 Nginx / Caddy 终止 TLS，并设置 `COOKIE_SECURE=true`。

5. **创建管理员账号**：
   - **方式 A**：首次启动，`users` 表为空时，第一个注册账号自动提升为 admin。
   - **方式 B**：手动执行 SQL：
     ```sql
     UPDATE users SET role = 'ADMIN' WHERE email = 'you@example.com';
     ```

6. **初始化配置**：登录管理后台 → 依次完善「设置」「定价」「邮件模板」「短信模板」「WAF 规则」「区域」「CPU 配置」等。

7. **备份策略**：管理后台手动创建首份全库备份，并配合系统级 `pg_dump` 定时执行。

---

## 七、关键架构约束

| 约束 | 说明 |
|------|------|
| **BFF 强制** | Go 后端不对外暴露，所有 `/api/*` 必须经 Next.js BFF 层转发，BFF 注入 `X-Internal-Key`，缺失则 403 |
| **WebSocket Origin** | `/ws` 路径的 Origin 必须在 `CORS_ALLOWED_ORIGINS` 白名单内，否则 403 |
| **金额精度** | 所有余额 / 订单 / 佣金写入必须经过 `service.RoundMoney(...)` 保留两位小数，防止浮点漂移 |
| **密钥轮换** | 轮换 `INTERNAL_API_KEY` 时须同步更新前后端配置并重启两侧服务 |

---

## 八、常用运维命令

```bash
# 查看后端日志
tail -f /var/log/serverai/backend.log

# 重启服务（systemd）
systemctl restart serverai-backend
systemctl restart serverai-frontend

# 数据库备份
pg_dump -d serverai -Fc -f backup-$(date +%Y%m%d).dump

# 健康检查
curl -I https://your-domain.com/api/health

# ⚠️ 危险：清空所有业务数据（不可恢复）
psql -d serverai -c "TRUNCATE users, orders, servers RESTART IDENTITY CASCADE;"
```

---

## 九、管理后台页面介绍

为便于上手与交接，下面给出管理后台核心页面的用途说明（对应 `index/src/app/admin` 下页面）。

### 1. 数据总览与运营监控

| 页面 | 路由 | 介绍 |
|------|------|------|
| 仪表盘 | `/admin` | 后台首页，展示用户、订单、服务器、工单等核心 KPI 与待处理事项。 |
| 实时监控 | `/admin/realtime` | 监控在线状态与实时事件，适合值班时快速观察全局状态。 |
| 数据分析 | `/admin/analytics` | 用户增长、收入趋势、地区分布、渠道贡献等统计看板。 |
| AI 周报 | `/admin/reports` | AI 汇总周报信息，帮助复盘运营变化。 |
| NPS 满意度 | `/admin/nps` | 客户满意度评分与分布统计。 |

### 2. 用户、商品、服务器

| 页面 | 路由 | 介绍 |
|------|------|------|
| 用户管理 | `/admin/users` | 用户列表、角色等级、基础信息管理。 |
| 用户详情 | `/admin/users/[id]` | 用户资料、订单、服务、工单等明细查看与编辑。 |
| 登录日志 | `/admin/login-history` | 登录行为审计与风险排查。 |
| 积分管理 | `/admin/points` | 用户积分策略、流水与调整。 |
| 商品管理 | `/admin/products` | 商品列表、状态、价格与上下架。 |
| AI 商品助手 | `/admin/products/ai` | 辅助生成或优化商品文案、结构信息。 |
| 商品分析 | `/admin/products/analytics` | 商品维度的数据表现分析。 |
| 商品设置 | `/admin/products/settings` | 商品相关系统级配置。 |
| CPU 型号 | `/admin/cpus` | CPU 参数维护，用于商品规格展示与筛选。 |
| 地区管理 | `/admin/regions` | 可售地区与地域信息维护。 |
| 供应商管理 | `/admin/suppliers` | 供应商信息、合作参数与状态管理。 |
| 定价策略 | `/admin/pricing` | 统一维护定价规则与利润模型。 |
| 实例管理 | `/admin/servers` | 服务器实例列表、状态与分配管理。 |
| 到期日历 | `/admin/servers/calendar` | 按日历展示实例到期分布，便于续费/提醒。 |
| 续费管理 | `/admin/servers/renewal` | 续费相关的集中处理入口。 |

### 3. 订单、财务、客服

| 页面 | 路由 | 介绍 |
|------|------|------|
| 订单管理 | `/admin/orders` | 订单查询、状态流转、异常订单处理。 |
| 用户评价 | `/admin/reviews` | 订单/服务评价查看与统计。 |
| 财务概览 | `/admin/finance` | 收入、毛利、订单与用户消费概览。 |
| 交易流水 | `/admin/finance/transactions` | 交易明细筛选与对账。 |
| 充值与调账 | `/admin/finance/balance` | 对用户余额执行充值、扣减等操作。 |
| 财务趋势 | `/admin/finance/trends` | 收入、订单、活跃用户趋势分析。 |
| 消费排行 | `/admin/finance/top-users` | 用户消费排行，用于运营与风控参考。 |
| 工单管理 | `/admin/tickets` | 工单列表、状态处理、分派与跟进。 |
| 工单详情 | `/admin/tickets/[id]` | 单条工单会话与处理记录。 |
| AI 工单助手 | `/admin/tickets/ai` | 工单分类、摘要、建议回复等 AI 辅助能力。 |
| 工单评分 | `/admin/ticket-ratings` | 工单处理质量评分统计。 |
| SLA 配置 | `/admin/sla` | 定义 SLA 指标、阈值与补偿规则。 |
| SLA 监控 | `/admin/sla/violations` | SLA 违规记录追踪与分析。 |

### 4. 代理、内容、系统运维

| 页面 | 路由 | 介绍 |
|------|------|------|
| 代理商管理 | `/admin/agent-commission` | 代理体系、佣金规则与业绩管理。 |
| 提现审批 | `/admin/agent-commission/withdrawals` | 代理提现申请审核流程。 |
| 公告管理 | `/admin/announcements` | 公告创建、定时发布、优先级管理。 |
| 通知广播 | `/admin/notifications` | 站内信/邮件/短信多渠道广播。 |
| 帮助分类 | `/admin/article-categories` | 文档分类目录管理。 |
| 帮助文章 | `/admin/articles` | 帮助文档内容编辑与发布。 |
| 优惠券管理 | `/admin/coupons` | 优惠券活动创建、发放、状态管理。 |
| 邮件模板 | `/admin/email-templates` | 邮件模板维护与测试。 |
| 系统设置 | `/admin/settings` | 站点信息、AI 配置、基础策略设置。 |
| 操作日志 | `/admin/logs` | 管理操作审计日志。 |
| 定时任务日志 | `/admin/cron-logs` | 定时任务执行状态追踪。 |
| 异常检测 | `/admin/anomalies` | 识别可疑行为与异常业务波动。 |
| API 用量 | `/admin/api-usage` | API 调用量与配额消耗统计。 |
| 数据库备份 | `/admin/backups` | 手动备份、下载与备份记录查看。 |
| 批量操作 | `/admin/bulk` | 面向服务器/用户的批量运维动作。 |
| 数据导出 | `/admin/export` | 用户、订单、财务等数据导出。 |

> 说明：部分页面需要有对应业务数据后才会展示完整图表或列表，空库时显示为“暂无数据”属于正常行为。

### 5. 功能 页面预览（部分）

以下截图已放入 `docs/ui-previews/`，用于给用户直观看到后台界面。

#### 预览图

![仪表盘](docs/ui-previews/01-dashboard.png)
![数据分析](docs/ui-previews/02-analytics.png)
![用户管理弹窗](docs/ui-previews/03-user-profile-modal.png)
![到期日历](docs/ui-previews/04-server-calendar.png)
![用户评价](docs/ui-previews/05-user-reviews.png)
![财务概览](docs/ui-previews/06-finance-overview.png)
![交易流水](docs/ui-previews/07-finance-transactions.png)
![充值与调账](docs/ui-previews/08-balance-adjust.png)
![财务趋势](docs/ui-previews/09-finance-trends.png)

---

## 十、关于本项目

本项目围绕 IDC 业务、财务管理、代理分销等方向构建，代码与思路均开放参考，适合交流学习与二次开发。

我们希望它是一个真正能被参考、能持续演进的系统，而不是停留在设想里的东西。  
欢迎对 IDC、云业务、财务管理感兴趣的朋友一起交流。

- **QQ 交流群**：770906516  
- **官网**：青龙云 [www.qinglongyun.com](http://www.qinglongyun.com)


