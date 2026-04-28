# TermRepoService API 文档

本文档只记录当前后端已经实现、能够真实调用并产生业务效果的接口。默认服务地址为：

```txt
http://localhost:3000
```

管理站与插件接口统一使用 `/api/v1` 前缀；兼容健康检查 `GET /health` 除外。

## 通用约定

### 响应结构

除 `GET /health` 外，接口统一返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

业务错误也尽量返回相同结构：

```json
{
  "code": 40001,
  "message": "valid email is required",
  "data": null
}
```

注意：当前 `ApiError` 默认 HTTP 状态码为 `200`，但鉴权守卫抛出的未授权错误 HTTP 状态码为 `401`。

### 鉴权方式

管理站接口使用登录后返回的 JWT：

```http
Authorization: Bearer <accessToken>
```

插件接口使用个人访问 Token：

```http
Authorization: Bearer mat_xxx
```

同步接口同时支持管理站 JWT 和插件 Token。

### 常用变量示例

下面的 curl 示例默认使用这些变量：

```bash
BASE_URL="http://localhost:3000"
JWT="登录接口返回的 accessToken"
REFRESH_TOKEN="登录接口返回的 refreshToken"
PLUGIN_TOKEN="/api/v1/token/current 返回的 mat_... token"
```

## 错误码总表

| code | message | 当前来源 | 含义 |
| --- | --- | --- | --- |
| `0` | `ok` | 全部标准接口 | 请求成功 |
| `40001` | `valid email is required` | 注册 | 邮箱格式不合法 |
| `40002` | `password must be at least 8 characters` | 注册 | 密码长度不足 8 位 |
| `40003` | `username is required` | 注册 | 用户名为空 |
| `40020` | `application reason is required` | 内测申请 | 申请理由为空 |
| `40030` | `originalText is required` | AI 分析 | 缺少待分析术语 |
| `40040` | `snapshot.terms must be an array` | 快照导入 | 快照格式不合法 |
| `40100` | `missing authorization token` | 鉴权、同步 | 缺少 `Authorization` |
| `40101` | `invalid authorization token` | 管理站鉴权 | JWT 无效或已过期 |
| `40102` | `invalid email or password` | 登录 | 邮箱或密码错误 |
| `40103` | `invalid refresh token` | 刷新登录 | refresh token 无效、过期或已撤销 |
| `40110` | `invalid access token` | 插件 Token 鉴权 | 插件 Token 无效、过期或已撤销 |
| `40310` | `access token scope denied` | 插件 Token 鉴权 | Token 缺少所需 scope |
| `40330` | `AI is disabled for this user` | AI 分析 | 当前用户关闭了 AI 能力 |
| `40400` | `user not found` | 用户相关接口 | 用户不存在 |
| `40900` | `email already registered` | 注册 | 邮箱已注册 |
| `42930` | `AI quota exceeded` | AI 分析 | AI 额度已用完 |
| `50000` | `internal server error` | 全局异常过滤器 | 未捕获服务端错误 |

## 健康检查

### GET `/health`

用途：兼容后端基础健康检查，会真实检测数据库连通性。

鉴权：不需要。

请求示例：

```bash
curl -X GET "$BASE_URL/health"
```

成功响应示例：

```json
{
  "status": "ok",
  "database": "up",
  "timestamp": "2026-04-27T10:00:00.000Z"
}
```

数据库不可用时响应示例：

```json
{
  "status": "degraded",
  "database": "down",
  "timestamp": "2026-04-27T10:00:00.000Z"
}
```

相关错误码：无标准 `code` 字段。

### GET `/api/v1/health`

用途：管理站使用的标准健康检查，不访问数据库。

鉴权：不需要。

请求示例：

```bash
curl -X GET "$BASE_URL/api/v1/health"
```

成功响应示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "status": "up",
    "time": "2026-04-27T10:00:00.000Z"
  }
}
```

相关错误码：`50000`。

## 账号认证

### POST `/api/v1/auth/register`

用途：注册轻量账号，并自动初始化插件访问 Token。

鉴权：不需要。

请求示例：

```bash
curl -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@termrepo.dev",
    "password": "demo1234",
    "username": "demo"
  }'
```

请求体：

```json
{
  "email": "demo@termrepo.dev",
  "password": "demo1234",
  "username": "demo"
}
```

成功响应示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "accessToken": "jwt...",
    "refreshToken": "trr_...",
    "user": {
      "id": "uuid",
      "email": "demo@termrepo.dev",
      "username": "demo",
      "createdAt": "2026-04-27T10:00:00.000Z"
    }
  }
}
```

真实效果：创建 `users` 记录、写入密码哈希、创建 `refresh_sessions`，并确保存在一条可用 `access_tokens`。

相关错误码：`40001`、`40002`、`40003`、`40900`、`50000`。

### POST `/api/v1/auth/login`

用途：使用邮箱和密码登录管理站。

鉴权：不需要。

请求示例：

```bash
curl -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@termrepo.dev",
    "password": "demo1234"
  }'
```

请求体：

```json
{
  "email": "demo@termrepo.dev",
  "password": "demo1234"
}
```

成功响应示例：同 `/api/v1/auth/register`。

真实效果：校验密码；登录成功后创建新的 refresh session，并确保用户拥有插件访问 Token。

相关错误码：`40102`、`50000`。

### POST `/api/v1/auth/refresh`

用途：使用 refresh token 换取新的管理站 JWT。

鉴权：不需要。

请求示例：

```bash
curl -X POST "$BASE_URL/api/v1/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

请求体：

```json
{
  "refreshToken": "trr_..."
}
```

成功响应示例：同 `/api/v1/auth/register`。

真实效果：校验 `refresh_sessions.token_hash`、过期时间和撤销状态；成功后返回新的 JWT。

相关错误码：`40103`、`50000`。

### GET `/api/v1/auth/me`

用途：获取当前登录用户信息、功能开关和 Token 状态。

鉴权：管理站 JWT。

请求示例：

```bash
curl -X GET "$BASE_URL/api/v1/auth/me" \
  -H "Authorization: Bearer $JWT"
```

成功响应示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "uuid",
    "email": "demo@termrepo.dev",
    "username": "demo",
    "betaStatus": "none",
    "aiEnabled": true,
    "syncEnabled": false,
    "tokenValid": true,
    "createdAt": "2026-04-27T10:00:00.000Z"
  }
}
```

真实效果：读取当前用户和最新未撤销访问 Token。

相关错误码：`40100`、`40101`、`40400`、`50000`。

### POST `/api/v1/auth/logout`

用途：撤销指定 refresh token。

鉴权：当前实现不强制鉴权。

请求示例：

```bash
curl -X POST "$BASE_URL/api/v1/auth/logout" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

请求体：

```json
{
  "refreshToken": "trr_..."
}
```

成功响应示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": null
}
```

真实效果：如果传入 refresh token，则将匹配的 `refresh_sessions.revoked_at` 更新为当前时间。

相关错误码：`50000`。

## 内测申请

### GET `/api/v1/beta/status`

用途：查询当前用户的内测申请状态。

鉴权：管理站 JWT。

请求示例：

```bash
curl -X GET "$BASE_URL/api/v1/beta/status" \
  -H "Authorization: Bearer $JWT"
```

成功响应示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "status": "pending",
    "appliedAt": "2026-04-27T10:00:00.000Z",
    "scope": ["ai", "sync"]
  }
}
```

`approvedAt` 和 `note` 仅在后端存在对应值时返回。

真实效果：读取用户 `betaStatus` 和最近一条 `beta_applications`。

相关错误码：`40100`、`40101`、`40400`、`50000`。

### POST `/api/v1/beta/apply`

用途：提交内测申请。

鉴权：管理站 JWT。

请求示例：

```bash
curl -X POST "$BASE_URL/api/v1/beta/apply" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "希望参与插件 AI 备注能力测试",
    "scope": ["ai", "sync"]
  }'
```

请求体：

```json
{
  "reason": "希望参与插件 AI 备注能力测试",
  "scope": ["ai", "sync"]
}
```

成功响应示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "status": "pending",
    "appliedAt": "2026-04-27T10:00:00.000Z"
  }
}
```

真实效果：创建 `beta_applications`，并将 `users.beta_status` 更新为 `pending`。

相关错误码：`40020`、`40100`、`40101`、`50000`。

## 访问 Token

### GET `/api/v1/token/current`

用途：获取当前用户可用于插件调用的访问 Token。

鉴权：管理站 JWT。

请求示例：

```bash
curl -X GET "$BASE_URL/api/v1/token/current" \
  -H "Authorization: Bearer $JWT"
```

成功响应示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "token": "mat_...",
    "endpoint": "http://localhost:3000/api/v1",
    "version": "v1",
    "valid": true,
    "issuedAt": "2026-04-27T10:00:00.000Z",
    "expiresAt": "2027-04-27T10:00:00.000Z",
    "scopes": ["ai:analyze", "sync:snapshot"],
    "scopeDescriptions": {
      "ai:analyze": "AI term analysis and note suggestions",
      "sync:snapshot": "Cloud snapshot import and export"
    }
  }
}
```

真实效果：读取当前未撤销 Token；如果不存在则创建一个新的 `mat_...` Token。

相关错误码：`40100`、`40101`、`50000`。

### POST `/api/v1/token/regenerate`

用途：废弃旧插件 Token，并生成新插件 Token。

鉴权：管理站 JWT。

请求示例：

```bash
curl -X POST "$BASE_URL/api/v1/token/regenerate" \
  -H "Authorization: Bearer $JWT"
```

成功响应示例：同 `/api/v1/token/current`。

真实效果：将当前用户所有未撤销 Token 标记为 revoked，再创建新的 Token。

相关错误码：`40100`、`40101`、`50000`。

### POST `/api/v1/token/validate`

用途：校验插件访问 Token 是否有效。

鉴权：不需要。

请求示例：

```bash
curl -X POST "$BASE_URL/api/v1/token/validate" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$PLUGIN_TOKEN\"}"
```

请求体：

```json
{
  "token": "mat_..."
}
```

成功响应示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "valid": true,
    "expiresAt": null
  }
}
```

真实效果：查询 `access_tokens`，判断是否存在、是否撤销、是否过期。

相关错误码：`50000`。

## AI 能力

### GET `/api/v1/ai/status`

用途：查询当前用户 AI 开关、模型名和额度使用情况。

鉴权：管理站 JWT。

请求示例：

```bash
curl -X GET "$BASE_URL/api/v1/ai/status" \
  -H "Authorization: Bearer $JWT"
```

成功响应示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "enabled": true,
    "model": "termrepo-local-suggester",
    "quota": {
      "weekly": { "limit": 25, "used": 1 },
      "monthly": { "limit": 100, "used": 4 }
    },
    "resetAt": {
      "weekly": "2026-05-04T10:00:00.000Z",
      "monthly": "2026-05-01T00:00:00.000Z"
    }
  }
}
```

真实效果：读取用户 AI 开关和访问 Token 的 `aiQuota/aiUsed`。

相关错误码：`40100`、`40101`、`40400`、`50000`。

### POST `/api/v1/ai/toggle`

用途：开启或关闭当前用户 AI 能力。

鉴权：管理站 JWT。

请求示例：

```bash
curl -X POST "$BASE_URL/api/v1/ai/toggle" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

请求体：

```json
{
  "enabled": true
}
```

成功响应示例：同 `/api/v1/ai/status`。

真实效果：更新 `users.ai_enabled`。

相关错误码：`40100`、`40101`、`40400`、`50000`。

### GET `/api/v1/ai/usage?range=7d`

用途：查询 AI 调用历史摘要和最近记录。

鉴权：管理站 JWT。

Query 参数：

| 参数 | 可选值 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `range` | `24h`、`7d`、`30d` | `7d` | 查询时间范围 |

请求示例：

```bash
curl -X GET "$BASE_URL/api/v1/ai/usage?range=7d" \
  -H "Authorization: Bearer $JWT"
```

成功响应示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "summary": {
      "totalCalls": 1,
      "successRate": 1,
      "avgLatencyMs": 12
    },
    "items": [
      {
        "id": "uuid",
        "calledAt": "2026-04-27T10:00:00.000Z",
        "kind": "annotate",
        "input": "userIdToken",
        "outputPreview": "userIdToken 是一个代码术语或标识符...",
        "latencyMs": 12,
        "success": true
      }
    ]
  }
}
```

真实效果：查询 `ai_requests` 并计算调用次数、成功率和平均耗时。

相关错误码：`40100`、`40101`、`50000`。

### POST `/api/v1/ai/analyze-term`

用途：插件核心接口，根据术语、拆词片段和上下文生成备注建议。

鉴权：插件 Token，要求 scope 包含 `ai:analyze`。

当前实现：本地确定性建议器，不调用外部大模型。

请求示例：

```bash
curl -X POST "$BASE_URL/api/v1/ai/analyze-term" \
  -H "Authorization: Bearer $PLUGIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "originalText": "userIdToken",
    "parts": ["user", "Id", "Token"],
    "filePath": "src/auth/session.ts",
    "context": "const userIdToken = createSessionToken(user.id)"
  }'
```

请求体：

```json
{
  "originalText": "userIdToken",
  "parts": ["user", "Id", "Token"],
  "filePath": "src/auth/session.ts",
  "context": "const userIdToken = createSessionToken(user.id)"
}
```

成功响应示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "overallNote": "userIdToken 是一个代码术语或标识符，可作为团队词库条目记录其业务含义、使用场景和命名约定，建议结合调用上下文确认最终含义。",
    "parts": [
      {
        "text": "user",
        "note": "user 片段建议记录其在当前标识符中的语义角色。",
        "tags": ["identifier"],
        "type": "identifier-part"
      },
      {
        "text": "Token",
        "note": "Token 片段建议记录其在当前标识符中的语义角色。",
        "tags": ["identifier", "auth"],
        "type": "PascalPart"
      }
    ],
    "tags": ["identifier", "identity", "auth", "termrepo"]
  }
}
```

真实效果：写入 `ai_requests`，并递增当前插件 Token 的 `aiUsed`。

相关错误码：`40030`、`40100`、`40110`、`40310`、`40330`、`42930`、`50000`。

## 云同步：快照模式

### GET `/api/v1/sync/status`

用途：查询同步开关、云端词条数、最近同步时间和快照版本。

鉴权：管理站 JWT 或插件 Token。插件 Token 需包含 `sync:snapshot`。

管理站请求示例：

```bash
curl -X GET "$BASE_URL/api/v1/sync/status" \
  -H "Authorization: Bearer $JWT"
```

插件请求示例：

```bash
curl -X GET "$BASE_URL/api/v1/sync/status" \
  -H "Authorization: Bearer $PLUGIN_TOKEN"
```

成功响应示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "enabled": true,
    "termCount": 12,
    "lastSyncAt": "2026-04-27T10:00:00.000Z",
    "lastSyncStatus": "success",
    "pendingConflicts": 0,
    "snapshotVersion": 3
  }
}
```

真实效果：读取 `users.sync_enabled` 和 `cloud_snapshots`。

相关错误码：`40100`、`40101`、`40110`、`40310`、`40400`、`50000`。

### POST `/api/v1/sync/toggle`

用途：开启或关闭云同步。

鉴权：管理站 JWT 或插件 Token。插件 Token 需包含 `sync:snapshot`。

请求示例：

```bash
curl -X POST "$BASE_URL/api/v1/sync/toggle" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

请求体：

```json
{
  "enabled": true
}
```

成功响应示例：同 `/api/v1/sync/status`。

真实效果：更新 `users.sync_enabled`。

相关错误码：`40100`、`40101`、`40110`、`40310`、`40400`、`50000`。

### GET `/api/v1/sync/snapshot/export`

用途：导出云端词库快照。

鉴权：管理站 JWT 或插件 Token。插件 Token 需包含 `sync:snapshot`。

请求示例：

```bash
curl -X GET "$BASE_URL/api/v1/sync/snapshot/export" \
  -H "Authorization: Bearer $PLUGIN_TOKEN"
```

成功响应示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "version": 1,
    "exportedAt": "2026-04-27T10:00:00.000Z",
    "terms": []
  }
}
```

真实效果：读取 `cloud_snapshots.snapshot`；如果没有云端快照，则返回空快照。

相关错误码：`40100`、`40101`、`40110`、`40310`、`50000`。

### POST `/api/v1/sync/snapshot/import`

用途：导入插件本地词库快照。

鉴权：管理站 JWT 或插件 Token。插件 Token 需包含 `sync:snapshot`。

导入模式：

| mode | 行为 |
| --- | --- |
| `overwrite` | 覆盖云端快照 |
| `merge` | 按 `id`、`originalText` 去重合并 |

请求示例：

```bash
curl -X POST "$BASE_URL/api/v1/sync/snapshot/import" \
  -H "Authorization: Bearer $PLUGIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "merge",
    "snapshot": {
      "version": 1,
      "exportedAt": "2026-04-27T10:00:00.000Z",
      "terms": [
        {
          "id": "term_001",
          "originalText": "userIdToken",
          "overallNote": "用户 ID Token",
          "parts": [],
          "tags": ["auth"],
          "createdAt": 1760000000000,
          "updatedAt": 1760000000000,
          "mastery": 0,
          "reviewCount": 0
        }
      ]
    }
  }'
```

请求体：

```json
{
  "mode": "merge",
  "snapshot": {
    "version": 1,
    "exportedAt": "2026-04-27T10:00:00.000Z",
    "terms": [
      {
        "id": "term_001",
        "originalText": "userIdToken",
        "overallNote": "用户 ID Token",
        "parts": [],
        "tags": ["auth"],
        "createdAt": 1760000000000,
        "updatedAt": 1760000000000,
        "mastery": 0,
        "reviewCount": 0
      }
    ]
  }
}
```

成功响应示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "imported": 1,
    "skipped": 0,
    "snapshotVersion": 2
  }
}
```

真实效果：写入或更新 `cloud_snapshots`，递增版本号，并将 `users.sync_enabled` 设为 `true`。

相关错误码：`40040`、`40100`、`40101`、`40110`、`40310`、`50000`。

## 当前未实现的接口

以下能力在前端 mock 或规划中出现过，但当前后端尚未实现真实接口：

- 工单系统：`/api/v1/tickets/*`
- 设备列表：`/api/v1/sync/devices`
- 冲突列表与冲突解决：`/api/v1/sync/conflicts/*`
- 外部大模型调用：当前 `/api/v1/ai/analyze-term` 是本地确定性建议器。

