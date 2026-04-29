# TermRepoService

TermRepoService 是 `TermRepo` 系列中的后端服务项目，定位不是接管现有插件，而是作为“增强层”为插件和未来多端能力提供支持。

当前项目服务于以下方向：

- AI 术语分析与默认备注建议
- 轻量 token 校验与额度控制
- 后续云同步与多端共享能力预留

项目始终遵循 `TermRepo` 的核心边界：

- 本地优先
- 轻接入
- 非重登录 SaaS
- 后端是增强项，不是插件的运行前提

## 1. 项目现状

当前仓库已经完成的是一个可运行的后端基础骨架：

- 使用 `NestJS + Prisma + PostgreSQL`
- 已接入环境变量配置
- 已接入 Prisma 连接与生命周期管理
- 已创建首个数据库迁移
- 已实现健康检查接口 `GET /health`
- 已定义一期核心数据表中的一部分模型

当前尚未完成但已明确规划的能力包括：

- `POST /access/activate`
- `POST /access/validate`
- `POST /ai/analyze-term`
- 词条与拆词片段的云端读写
- 云同步能力

换句话说，`TermRepoService` 目前处于“一期骨架已搭好，增强能力待继续落地”的阶段。

## 2. 项目定位

`TermRepo` 当前已经有一个本地优先的 VS Code 插件，负责：

- 收藏开发中的术语、标识符与组合词
- 拆分 `camelCase` / `snake_case`
- 本地搜索、编辑、导入导出与复用

因此后端不负责替代本地能力，而是负责承接未来在线增强能力，例如：

- 在收藏术语时，基于上下文生成默认备注建议
- 为赞助制内测或轻量云服务提供 token 校验
- 为后续网页端、移动端和多设备同步提供统一服务层

## 3. 技术栈

- `TypeScript`
- `NestJS`
- `PostgreSQL`
- `Prisma`

选择原因与项目文档保持一致：

- 前后端统一语言，降低协作成本
- NestJS 适合逐步演进为规范化、模块化服务
- PostgreSQL 适合承载带关系和约束的业务数据
- Prisma 适合管理模型、迁移和 TypeScript 类型

## 4. 当前模块结构

```txt
TermRepoService/
├─ prisma/
│  ├─ migrations/
│  └─ schema.prisma
├─ src/
│  ├─ health/
│  │  ├─ health.controller.ts
│  │  └─ health.module.ts
│  ├─ prisma/
│  │  ├─ prisma.module.ts
│  │  └─ prisma.service.ts
│  ├─ app.module.ts
│  └─ main.ts
├─ test/
├─ .env.example
└─ package.json
```

当前模块职责如下：

- `src/main.ts`
  - 启动 Nest 应用，默认监听 `3000`
- `src/app.module.ts`
  - 注册全局配置、Prisma 模块和健康检查模块
- `src/prisma/`
  - 封装 PrismaClient，并在 Nest 生命周期中自动连接/断开数据库
- `src/health/`
  - 提供服务健康检查与数据库连通性探测
- `prisma/schema.prisma`
  - 定义当前 Prisma 数据模型

## 5. 数据模型

当前 Prisma 模型已包含以下 3 个核心实体：

### `users`

用于表示系统用户。

当前字段包括：

- `id`
- `email`
- `nickname`
- `role`
- `created_at`
- `updated_at`

### `access_tokens`

用于表示访问令牌、AI 权限范围与基础额度信息。

当前字段包括：

- `id`
- `token`
- `user_id`
- `scope`
- `ai_quota`
- `ai_used`
- `expires_at`
- `created_at`

### `ai_requests`

用于记录 AI 术语分析请求，便于后续做额度控制、调试与日志追踪。

当前字段包括：

- `id`
- `user_id`
- `word`
- `input`
- `output`
- `status`
- `created_at`

## 6. 已实现接口

### `GET /health`

用于检查：

- 服务是否在线
- 数据库是否可连接

当前返回结构示例：

```json
{
  "status": "ok",
  "database": "up",
  "timestamp": "2026-04-27T10:00:00.000Z"
}
```

当数据库不可用时，接口会返回：

- `status: "degraded"`
- `database: "down"`

示例请求：

```bash
curl http://localhost:3000/health
```

## 7. 规划中的一期接口

以下接口已经在项目文档中明确，但当前代码尚未实现：

### `POST /access/activate`

可能用于：

- 激活内测 token
- 建立 token 与用户的绑定关系

### `POST /access/validate`

可能用于：

- 校验 token 是否有效
- 判断用户是否具备 AI 或同步资格
- 返回额度与权限范围

### `POST /ai/analyze-term`

计划用于：

- 在收藏术语时生成整体备注建议
- 生成拆词片段备注建议

文档中建议的输入可能包括：

- `word`
- `languageId`
- `fileName`
- `fileExtension`
- `surroundingCode`
- `filePath`

文档中建议的输出可能包括：

- `overallNote`
- `parts`
- `part.text`
- `part.note`
- `part.tags`
- `confidence`

## 8. 环境变量

当前项目至少需要以下环境变量：

```env
PORT=3000
DATABASE_URL="postgresql://postgres:your_password@your_server_ip:5432/termrepo?schema=public"
```

说明：

- `PORT`：服务监听端口，默认 `3000`
- `DATABASE_URL`：PostgreSQL 连接字符串

推荐做法：

1. 复制 `.env.example` 为 `.env`
2. 填写真实数据库连接
3. 确认 PostgreSQL 数据库已创建

## 9. 本地启动

### 安装依赖

```bash
npm install
```

### 生成 Prisma Client

```bash
npm run prisma:generate
```

### 执行数据库迁移

```bash
npm run prisma:migrate
```

### 启动开发服务

```bash
npm run start:dev
```

启动后默认访问：

```txt
http://localhost:3000/health
```

## 10. 常用脚本

- `npm run start:dev`
  - 开发模式启动
- `npm run build`
  - 构建生产代码
- `npm run start:prod`
  - 运行构建产物
- `npm run lint`
  - 执行 ESLint
- `npm run test`
  - 执行 Jest 测试
- `npm run test:e2e`
  - 执行端到端测试
- `npm run prisma:generate`
  - 生成 Prisma Client
- `npm run prisma:migrate`
  - 执行 Prisma 开发迁移
- `npm run prisma:studio`
  - 打开 Prisma Studio

## 11. 当前已知事项

- 当前 `e2e` 测试启动完整应用，会依赖 `DATABASE_URL` 指向的数据库可连接
- `test/app.e2e-spec.ts` 仍保留 Nest 初始化模板断言，后续应按真实接口更新为 `/health` 等当前服务行为
- 因此在补齐测试前，`npm run test:e2e` 更适合作为“测试骨架已存在”的信号，而不是稳定验收项

## 12. 后续推荐演进顺序

结合系列文档，当前更推荐按下面顺序继续推进：

1. 保持 `health` 与 Prisma 基础设施稳定
2. 新增 `access` 模块，落地 token 激活与校验
3. 新增 `ai` 模块，先打通术语分析接口
4. 补充 AI 请求记录、额度控制与审计字段
5. 再考虑 `terms` 与同步相关能力

## 13. 设计原则

在继续开发 `TermRepoService` 时，建议持续遵守以下原则：

- 插件本地功能必须独立可用
- 后端能力应按需接入，而不是强制依赖
- 先做最有价值的 AI 增强，再做更复杂的同步
- 接口与数据模型优先保持清晰和可演进
- 优先支持“官方托管 + 可自建”双路线的长期可能性

## 14. 相关文档

若需要进一步理解项目背景，建议继续阅读：

- `../TermRepo术语库系列文档/总览.md`
- `../TermRepo术语库系列文档/后端文档/后端技术选型与一期架构建议.md`
- `../TermRepo术语库系列文档/后端文档/后端一期接口规划.md`
- `../TermRepo术语库系列文档/数据库文档/数据库设计总览.md`
- `../TermRepo术语库系列文档/数据库文档/一期核心数据表设计.md`
- `../TermRepoPlugin/termrepoplugin-vscode/project-docs/后端项目上下文说明.md`

## 13. 管理站与 AI 配额配置

当前推荐的生产部署流程：

1. 创建 PostgreSQL 数据库。
2. 复制 `.env.example` 为 `.env`，填写 `DATABASE_URL`、`AUTH_JWT_SECRET`、`APP_SECRET_ENCRYPTION_KEY`、`ADMIN_EMAIL`、`ADMIN_PASSWORD`。
3. 启动后端，服务会自动确保 `ADMIN_EMAIL` 对应账号存在并拥有 `admin` 角色。
4. 部署独立管理站 `TermRepoWebSite/termrepo-admin-site`，通过 `VITE_API_BASE_URL` 指向生产后端 `/api/v1`。
5. 登录管理站，配置全局 OpenAI-compatible AI 模型 `Base URL`、`Model`、`API Key`，并测试连接。
6. 在管理站配置开放注册用户的默认 AI 月额度和云同步词条上限。
7. 部署控制站 `TermRepoWebSite/termrepo-control-site`，邀请普通用户注册使用。

说明：

- AI 模型密钥不放在前端源码中，由管理站提交到后端后加密存入数据库。
- 第一版只有一个全局 AI 模型配置，所有用户共用该模型，由账号额度限制使用量。
- 新用户注册时会获得管理站设置的默认 AI 月额度和云同步词条上限。
- 插件调用 AI 翻译时，如果模型未配置、额度不足或调用失败，会回退本地收藏流程。
