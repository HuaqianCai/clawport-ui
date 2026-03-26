# OpenClaw Gateway RPC 接口文档

基于 WebSocket 的 RPC 调用，所有请求通过 `ws://localhost:18789/ws` 发送。

## 请求格式

```json
{
  "type": "req",
  "id": "unique-request-id",
  "method": "method.name",
  "params": { ... }
}
```

## 响应格式

成功：
```json
{
  "type": "res",
  "id": "unique-request-id",
  "ok": true,
  "payload": { ... }
}
```

错误：
```json
{
  "type": "err",
  "id": "unique-request-id",
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description"
  }
}
```

---

## 接口总表

> 来源：`OpenClawProtocol/GatewayModels.swift`

### 连接与认证

| 方法 | 说明 |
|------|------|
| `connect` | 建立 WebSocket 连接，完成认证 |
| `send` | 发送消息（用于频道） |
| `poll` | 轮询消息 |

### Agent 管理

| 方法 | 说明 |
|------|------|
| `agents.list` | 列出所有已注册的 Agent |
| `agents.create` | 创建新 Agent |
| `agents.update` | 更新 Agent 配置 |
| `agents.delete` | 删除 Agent |
| `agents.files.list` | 列出 Agent 的文件（如 SOUL.md） |
| `agents.files.get` | 获取 Agent 文件内容 |
| `agents.files.set` | 写入 Agent 文件 |
| `agent.identity.get` | 获取 Agent 身份信息（name, avatar） |
| `agent.wait` | 等待 Agent 运行完成（按 runId） |
| `wake` | 唤醒 Agent |

### Session 会话

| 方法 | 说明 |
|------|------|
| `sessions.list` | 列出所有会话 |
| `sessions.preview` | 预览会话消息 |
| `sessions.resolve` | 解析会话 key |
| `sessions.create` | 创建新会话 |
| `sessions.patch` | 修改会话配置 |
| `sessions.delete` | 删除会话 |
| `sessions.reset` | 重置会话 |
| `sessions.compact` | 压缩会话历史 |
| `sessions.usage` | 获取 token 使用量 |
| `sessions.abort` | 中止会话运行 |
| `sessions.send` | 在会话中发送消息 |
| `sessions.subscribe` | 订阅所有 session 事件 |
| `sessions.messages.subscribe` | 订阅特定会话消息流 |
| `sessions.messages.unsubscribe` | 取消订阅 |

### Chat 聊天

| 方法 | 说明 |
|------|------|
| `chat.send` | 发送聊天消息（支持多模态、流式响应） |
| `chat.history` | 获取聊天历史 |
| `chat.abort` | 中止聊天运行 |
| `chat.inject` | 注入消息到聊天 |

### Cron 定时任务

| 方法 | 说明 |
|------|------|
| `cron.list` | 列出所有定时任务 |
| `cron.status` | 获取定时任务状态 |
| `cron.add` | 添加定时任务 |
| `cron.runs` | 获取定时任务执行记录 |

### Node 远程节点

| 方法 | 说明 |
|------|------|
| `node.list` | 列出已连接的节点 |
| `node.pair.request` | 请求配对新节点 |
| `node.pair.list` | 列出配对请求 |
| `node.pair.approve` | 批准配对 |
| `node.pair.reject` | 拒绝配对 |
| `node.pair.verify` | 验证配对 |
| `node.rename` | 重命名节点 |
| `node.pendingAck` | 确认待处理 |
| `node.describe` | 描述节点 |
| `node.invoke` | 在节点上调用命令 |
| `node.invokeResult` | 获取调用结果 |
| `node.event` | 节点事件 |
| `node.pendingDrain` | 排空待处理 |
| `node.pendingEnqueue` | 入队待处理 |

### Device 设备配对

| 方法 | 说明 |
|------|------|
| `device.pair.list` | 列出已配对设备 |
| `device.pair.approve` | 批准设备配对 |
| `device.pair.reject` | 拒绝设备配对 |
| `device.pair.remove` | 移除设备 |
| `device.token.rotate` | 轮换设备 token |
| `device.token.revoke` | 撤销设备 token |

### Config 配置

| 方法 | 说明 |
|------|------|
| `config.get` | 获取完整配置 |
| `config.set` | 设置配置 |
| `config.apply` | 应用配置更改 |
| `config.patch` | 部分更新配置 |
| `config.schema` | 获取配置 schema |
| `config.schema.lookup` | 查询 schema 字段 |

### Models 模型

| 方法 | 说明 |
|------|------|
| `models.list` | 列出可用模型 |

### Tools & Skills

| 方法 | 说明 |
|------|------|
| `tools.catalog` | 获取工具目录 |
| `skills.status` | 获取技能状态 |
| `skills.bins` | 获取技能二进制 |

### Channels 频道

| 方法 | 说明 |
|------|------|
| `channels.status` | 获取频道状态 |
| `channels.logout` | 频道登出 |

### Talk 语音

| 方法 | 说明 |
|------|------|
| `talk.mode` | 设置语音模式 |
| `talk.config` | 获取语音配置 |
| `talk.speak` | 语音合成 |

### Wizard 向导

| 方法 | 说明 |
|------|------|
| `wizard.start` | 启动向导 |
| `wizard.next` | 向导下一步 |
| `wizard.cancel` | 取消向导 |
| `wizard.status` | 获取向导状态 |

### ExecApprovals 执行审批

| 方法 | 说明 |
|------|------|
| `execApprovals.get` | 获取审批配置 |
| `execApprovals.set` | 设置审批配置 |
| `execApprovals.nodeGet` | 获取节点审批配置 |
| `execApprovals.nodeSet` | 设置节点审批配置 |
| `execApproval.request` | 请求审批 |
| `execApproval.resolve` | 解决审批 |

### Secrets 密钥

| 方法 | 说明 |
|------|------|
| `secrets.reload` | 重新加载密钥 |
| `secrets.resolve` | 解析密钥 |

### Logs 日志

| 方法 | 说明 |
|------|------|
| `logs.tail` | 订阅实时日志流 |

### WebLogin 网页登录

| 方法 | 说明 |
|------|------|
| `webLogin.start` | 开始网页登录 |
| `webLogin.wait` | 等待网页登录完成 |

### 其他

| 方法 | 说明 |
|------|------|
| `push.test` | 测试推送 |
| `update.run` | 运行更新 |
| `health` | 检查网关健康状态 |
| `status` | 获取网关运行状态 |

---

## 详细接口说明

### `agents.list`

列出所有已注册的 Agent。

**参数：** `{}`

**返回：**
```json
{
  "defaultId": "main",
  "mainKey": "main",
  "scope": "per-sender",
  "agents": [
    { "id": "main" },
    { "id": "dslabworker", "name": "dslabworker" },
    { "id": "imggen", "name": "imggen" }
  ]
}
```

---

### `agent.identity.get`

获取指定 Agent 的身份信息。

**参数：**
```json
{
  "sessionKey": "agent:<agentId>:<context>"
}
```

**返回：**
```json
{
  "agentId": "dslabworker",
  "name": "Assistant",
  "avatar": "A"
}
```

---

### `cron.list`

列出所有定时任务。

**参数：** `{}`

**返回：**
```json
{
  "jobs": [
    {
      "id": "job-id",
      "name": "job-name",
      "schedule": "0 9 * * *",
      "enabled": true,
      "timezone": "Asia/Shanghai",
      "state": {
        "status": "ok",
        "lastRunAtMs": 1234567890000,
        "nextRunAtMs": 1234567890000,
        "lastError": null
      }
    }
  ],
  "total": 1,
  "offset": 0,
  "limit": 50,
  "hasMore": false
}
```

---

### `sessions.list`

列出所有会话。

**参数：**
```json
{
  "limit": 120,
  "activeMinutes": 60,
  "includeGlobal": true,
  "includeUnknown": false,
  "includeDerivedTitles": false,
  "includeLastMessage": false,
  "label": "optional-label",
  "spawnedBy": "parent-agent-id",
  "agentId": "filter-by-agent",
  "search": "search-term"
}
```

**返回：**
```json
{
  "ts": 1774268194350,
  "path": "(multiple)",
  "count": 18,
  "defaults": {
    "modelProvider": "labgateway",
    "model": "bailian-Kimi-k2.5",
    "contextTokens": 200000
  },
  "sessions": [
    {
      "key": "agent:dslabworker:main",
      "kind": "direct",
      "chatType": "direct",
      "origin": {
        "provider": "webchat",
        "surface": "webchat",
        "chatType": "direct"
      },
      "updatedAt": 1774267249723,
      "sessionId": "uuid",
      "systemSent": true,
      "model": "bailian-Kimi-k2.5",
      "contextTokens": 200000
    }
  ]
}
```

**返回示例中的 session 字段说明：**
| 字段 | 说明 |
|------|------|
| `key` | 会话唯一标识，格式 `agent:<agentId>:<context>` |
| `kind` | 会话类型：`direct`（直接对话）、`subagent`（子代理） |
| `chatType` | 聊天类型 |
| `status` | 会话状态：`idle`（空闲）、`running`（运行中）、`waiting`（等待输入） |
| `origin` | 会话来源信息 |
| `updatedAt` | 最后更新时间戳（毫秒） |
| `sessionId` | 会话 UUID |
| `model` | 使用的模型 |
| `contextTokens` | 上下文 token 数 |

---

### `sessions.subscribe`

订阅所有 session 事件。**应在连接建立后立即调用一次**。

**参数：** `{}`

**返回：**
```json
{
  "subscribed": true
}
```

**订阅后收到的 `session.*` 事件类型：**

| 事件类型 | 说明 |
|---------|------|
| `session.tool` | 工具调用事件（start/update/result） |
| `session.message` | 消息更新事件 |
| `session.lifecycle` | session 生命周期事件 |

### `session.tool` 事件

当 agent 调用工具时触发，包含完整的工具调用过程：

```json
{
  "type": "event",
  "event": "session.tool",
  "payload": {
    "runId": "1dc9cca7-4e51-4af6-84c7-2a146de06c03",
    "stream": "tool",
    "data": {
      "phase": "start",
      "name": "exec",
      "toolCallId": "functions.exec:9",
      "args": {
        "command": "ls -la /path/to/dir",
        "workdir": "/path/to/workdir"
      }
    },
    "sessionKey": "agent:worker:main",
    "seq": 2,
    "ts": 1774518735299
  }
}
```

**data.phase 取值：**

| phase | 说明 | 包含字段 |
|-------|------|---------|
| `start` | 工具调用开始 | `name`, `toolCallId`, `args` |
| `update` | 工具调用进行中 | `name`, `toolCallId` |
| `result` | 工具调用完成 | `name`, `toolCallId`, `meta`, `isError` |

**phase: start 示例：**
```json
{
  "phase": "start",
  "name": "exec",
  "toolCallId": "functions.exec:9",
  "args": {
    "command": "ls -la /path/",
    "workdir": "/path/to/workdir"
  }
}
```

**phase: update 示例：**
```json
{
  "phase": "update",
  "name": "exec",
  "toolCallId": "functions.exec:9"
}
```

**phase: result 示例：**
```json
{
  "phase": "result",
  "name": "exec",
  "toolCallId": "functions.exec:9",
  "meta": "list files in /path/ (in /workdir), `ls -la /path/`",
  "isError": false
}
```

**payload 字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `runId` | string | 本次运行的唯一标识 |
| `stream` | string | 固定为 `"tool"` |
| `sessionKey` | string | 会话标识 |
| `seq` | number | 事件序号 |
| `ts` | number | 时间戳（毫秒） |
| `data.phase` | string | 阶段：start/update/result |
| `data.name` | string | 工具名称 |
| `data.toolCallId` | string | 工具调用 ID |
| `data.args` | object | 工具参数（仅 start） |
| `data.meta` | string | 工具描述（仅 result） |
| `data.isError` | boolean | 是否出错（仅 result） |

---

### `sessions.messages.subscribe`

订阅会话消息流，用于接收该会话的所有消息更新。**重要**：页面刷新后重新订阅正在运行的会话。

**参数：**
```json
{
  "key": "agent:main:context"
}
```

**返回：**
```json
{
  "ok": true
}
```

**订阅后收到的事件类型：**

订阅成功后，客户端会收到以下类型的事件：

1. **`session.message`** - 消息更新事件：
```json
{
  "type": "event",
  "event": "session.message",
  "payload": {
    "sessionKey": "agent:main:context",
    "message": {
      "role": "assistant",
      "content": [{ "type": "text", "text": "收到！一切正常。" }],
      "timestamp": 1774446046000,
      "provenance": {
        "kind": "agent",
        "sourceSessionKey": "agent:main:context",
        "sourceChannel": null,
        "sourceTool": null
      }
    },
    "messageId": "abc123",
    "messageSeq": 1,
    "session": {
      "key": "agent:main:context",
      "status": "running",
      "startedAt": 1774446046000,
      "model": "claude-sonnet-4-6",
      "childSessions": ["agent:worker:subagent:xxx"]
    }
  }
}
```

2. **`session.tool`** - 工具调用事件：
```json
{
  "type": "event",
  "event": "session.tool",
  "payload": {
    "sessionKey": "agent:main:context",
    "toolName": "read_file",
    "phase": "start" | "end",
    "input": { "path": "/some/file.txt" },
    "output": "file content..."
  }
}
```

3. **`sessions.changed`** - 会话状态变化事件：
```json
{
  "type": "event",
  "event": "sessions.changed",
  "payload": {
    "sessionKey": "agent:main:context",
    "change": "start" | "end" | "error",
    "session": {
      "key": "agent:main:context",
      "status": "idle",
      "endedAt": 1774446050000
    }
  }
}
```

**message 字段说明：**
| 字段 | 说明 |
|------|------|
| `role` | 消息角色：`user`、`assistant`、`tool` |
| `content` | 消息内容，可以是字符串或内容块数组 |
| `timestamp` | 消息时间戳（毫秒） |
| `provenance` | 消息来源信息（可选） |
| `provenance.sourceTool` | 来源工具，如 `subagent_announce` 表示子代理任务完成 |

**取消订阅：** 调用 `sessions.messages.unsubscribe`

---

### `sessions.messages.unsubscribe`

取消会话消息订阅。

**参数：**
```json
{
  "key": "agent:main:context"
}
```

**返回：**
```json
{
  "ok": true
}
```

---

### `chat.send`

发送聊天消息（支持多模态）。**流式响应**：调用后通过事件推送返回多个消息，直到收到 `state: "final"` 为止。

**参数：**
```json
{
  "sessionKey": "agent:main:context",
  "idempotencyKey": "unique-key",
  "message": "Hello",
  "attachments": [
    { "mimeType": "image/jpeg", "content": "base64-data" }
  ],
  "deliver": false,
  "timeoutMs": 60000
}
```

**参数说明：**
| 参数 | 说明 |
|------|------|
| `timeoutMs` | 设置后为同步模式，等待完成并返回最终结果；不设置则为异步模式 |

**初始返回：**
```json
{
  "runId": "test-xxx",
  "status": "started"
}
```

**后续事件流：**

1. **agent lifecycle 事件**：
```json
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "test-xxx",
    "stream": "lifecycle",
    "data": { "phase": "start", "startedAt": 1774268194616 },
    "sessionKey": "agent:dslabworker:main"
  }
}
```

2. **assistant 文本流事件**（增量）：
```json
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "test-xxx",
    "stream": "assistant",
    "data": { "text": "收到！一切正常。", "delta": "正常。" },
    "sessionKey": "agent:dslabworker:main"
  }
}
```

3. **chat delta 事件**：
```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "runId": "test-xxx",
    "sessionKey": "agent:dslabworker:main",
    "state": "delta",
    "message": {
      "role": "assistant",
      "content": [{ "type": "text", "text": "收到！一切正常。" }],
      "timestamp": 1774268239211
    }
  }
}
```

4. **chat final 事件**（结束标志）：
```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "runId": "test-xxx",
    "sessionKey": "agent:dslabworker:main",
    "state": "final",
    "message": {
      "role": "assistant",
      "content": [{ "type": "text", "text": "收到！一切正常。" }],
      "timestamp": 1774268239224
    }
  }
}
```

5. **agent tool 事件**（工具调用开始）：
```json
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "test-xxx",
    "stream": "tool",
    "ts": 1774268200000,
    "sessionKey": "agent:dslabworker:main",
    "data": {
      "phase": "start",
      "toolName": "read_file",
      "toolInput": { "path": "/some/file.txt" }
    }
  }
}
```

6. **agent tool 事件**（工具调用结束）：
```json
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "test-xxx",
    "stream": "tool",
    "ts": 1774268201000,
    "sessionKey": "agent:dslabworker:main",
    "data": {
      "phase": "end",
      "toolName": "read_file",
      "toolResult": "file content..."
    }
  }
}
```

7. **agent lifecycle end 事件**：
```json
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "test-xxx",
    "stream": "lifecycle",
    "ts": 1774268240000,
    "sessionKey": "agent:dslabworker:main",
    "data": {
      "phase": "end",
      "endedAt": 1774268240000,
      "stopReason": "end_turn"
    }
  }
}
```

8. **chat aborted 事件**（用户中止）：
```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "runId": "test-xxx",
    "sessionKey": "agent:dslabworker:main",
    "state": "aborted",
    "message": {
      "role": "assistant",
      "content": [{ "type": "text", "text": "已收到的部分内容..." }],
      "timestamp": 1774268250000
    }
  }
}
```

9. **chat error 事件**（运行错误）：
```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "runId": "test-xxx",
    "sessionKey": "agent:dslabworker:main",
    "state": "error",
    "errorMessage": "API rate limit exceeded",
    "message": {
      "role": "assistant",
      "content": [{ "type": "text", "text": "已收到的部分内容..." }],
      "timestamp": 1774268260000
    }
  }
}
```

10. **agent error 事件**（原始错误）：
```json
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "test-xxx",
    "stream": "error",
    "ts": 1774268260000,
    "sessionKey": "agent:dslabworker:main",
    "data": {
      "reason": "API rate limit exceeded",
      "code": "RATE_LIMIT",
      "retryable": true
    }
  }
}
```

**注意**：客户端应持续监听事件，直到收到 `event: "chat"` 且 `payload.state === "final"` 才算完成。

**完整事件流程示例**（正常对话）：

```
1. chat.send 请求 → 返回 { runId, status: "started" }

2. agent 事件 stream:lifecycle phase:start     ← Agent 开始运行
3. agent 事件 stream:assistant delta:"你"      ← 开始输出文本
4. chat 事件 state:delta                       ← 同步的 chat 事件
5. agent 事件 stream:assistant delta:"好"      ← 继续输出
6. chat 事件 state:delta
7. agent 事件 stream:tool phase:start          ← 调用工具（可选）
8. agent 事件 stream:tool phase:end            ← 工具返回
9. agent 事件 stream:assistant delta:"！"      ← 继续输出
10. chat 事件 state:delta
11. agent 事件 stream:lifecycle phase:end      ← Agent 运行结束
12. chat 事件 state:final                      ← 最终消息，流程结束
```

**关键点：**
- `agent` 和 `chat` 事件可能同时发送，内容重复
- 某些 agent 只发送 `chat` 事件，不发送 `agent` 事件
- 客户端应同时监听两种事件，优先使用 `chat` 事件（更简洁）
- `tool` 事件是可选的，取决于 agent 是否使用工具

---

## 事件类型详解

Gateway 在 `chat.send` 后会发送多种事件类型，客户端需要根据场景订阅处理。

### 事件类型总览

| 事件类型 | 说明 | 订阅方式 |
|---------|------|---------|
| `agent` | 原始 agent 运行事件（lifecycle/assistant/tool） | 自动广播 |
| `chat` | 简化的聊天事件（delta/final） | 自动广播 |
| `session.tool` | 工具调用事件（start/update/result） | `sessions.subscribe` |
| `session.message` | 消息追加到 session transcript 时触发 | `sessions.subscribe` 或 `sessions.messages.subscribe` |
| `sessions.changed` | session 状态变化（message/end） | `sessions.subscribe` |

### `sessions.changed` 事件

当 session 状态变化时触发，**推荐用于更新 UI 中的 session 运行状态**：

```json
{
  "type": "event",
  "event": "sessions.changed",
  "payload": {
    "sessionKey": "agent:worker:main",
    "phase": "message",
    "ts": 1774518735295,
    "messageId": "a004d196",
    "messageSeq": 28,
    "session": {
      "key": "agent:worker:main",
      "status": "running",
      "startedAt": 1774518727870,
      "model": "claude-sonnet-4-6",
      "contextTokens": 200000
    }
  }
}
```

**payload.phase 取值：**

| phase | 说明 | 额外字段 |
|-------|------|---------|
| `start` | 运行开始 | `runId` |
| `message` | 消息追加到 transcript | `messageId`, `messageSeq` |
| `end` | 运行结束 | `runId` |

**session.status 取值：**

| status | 说明 |
|--------|------|
| `running` | 正在运行 |
| `done` | 运行完成 |
| `error` | 运行出错 |

**phase: message 示例：**
```json
{
  "sessionKey": "agent:worker:main",
  "phase": "message",
  "ts": 1774518735295,
  "messageId": "a004d196",
  "messageSeq": 28,
  "session": {
    "key": "agent:worker:main",
    "status": "running",
    "startedAt": 1774518727870,
    "model": "claude-sonnet-4-6"
  }
}
```

**phase: end 示例：**
```json
{
  "sessionKey": "agent:worker:main",
  "phase": "end",
  "runId": "1dc9cca7-4e51-4af6-84c7-2a146de06c03",
  "ts": 1774518739777,
  "session": {
    "key": "agent:worker:main",
    "status": "done",
    "startedAt": 1774518727870,
    "endedAt": 1774518739777,
    "runtimeMs": 11907,
    "model": "claude-sonnet-4-6"
  }
}
```

**使用场景：**
- 更新 session 列表中的运行状态指示器
- 显示运行时长
- 检测 session 从 `running` 变为 `done`

### `agent` 事件

原始的 agent 运行事件，包含完整的运行细节：

```json
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "run-xxx",
    "seq": 1,
    "stream": "lifecycle" | "assistant" | "tool" | "error",
    "ts": 1774446046000,
    "sessionKey": "agent:main:context",
    "data": { ... }
  }
}
```

**stream 类型：**
- `lifecycle`: `{ phase: "start" | "end" | "error", startedAt?, endedAt?, stopReason? }`
- `assistant`: `{ text?: string, delta?: string }` - delta 是增量文本
- `tool`: `{ phase: "start" | "end", toolName, toolInput?, toolResult? }`
- `error`: `{ reason, ... }`

**注意**：`agent` 事件可能不会发送，取决于 `isControlUiVisible` 设置和 agent 配置。

### `chat` 事件

简化的聊天事件，由 `agent` 事件转换而来。**推荐 Control UI 使用此事件**：

```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "runId": "run-xxx",
    "sessionKey": "agent:main:context",
    "seq": 1,
    "state": "delta" | "final" | "aborted" | "error",
    "message": {
      "role": "assistant",
      "content": [{ "type": "text", "text": "完整文本" }],
      "timestamp": 1774446046000
    },
    "errorMessage?: string"
  }
}
```

**state 类型：**
- `delta`: 增量文本，message.content 包含当前完整文本
- `final`: 最终消息，运行完成
- `aborted`: 用户中止
- `error`: 运行错误，errorMessage 字段包含错误信息

### `session.message` 事件

当消息被追加到 session transcript 时触发。**用于重新订阅正在运行的 session**：

```json
{
  "type": "event",
  "event": "session.message",
  "payload": {
    "sessionKey": "agent:main:context",
    "message": {
      "role": "assistant",
      "content": [{ "type": "text", "text": "..." }],
      "timestamp": 1774446046000
    },
    "messageId": "abc123",
    "messageSeq": 1,
    "session": {
      "key": "agent:main:context",
      "status": "running",
      "startedAt": 1774446046000,
      "model": "claude-sonnet-4-6",
      "childSessions": ["agent:worker:subagent:xxx"],
      ...
    }
  }
}
```

**触发机制**：
1. Agent 运行时将消息追加到 session transcript 文件
2. Gateway 通过 `emitSessionTranscriptUpdate()` 监听 transcript 变化
3. 向所有订阅了该 session 的连接广播 `session.message` 事件

**与 agent/chat 事件的区别**：

| 事件类型 | 触发源 | 内容格式 | 包含 session 快照 |
|---------|--------|---------|------------------|
| `agent` | `emitAgentEvent()` | stream 格式 (lifecycle/assistant/tool) | 否 |
| `chat` | 从 agent 事件转换 | state 格式 (delta/final) | 否 |
| `session.message` | transcript 更新 | 完整消息 + session 快照 | **是** |

**使用场景**：
- 页面刷新后，调用 `sessions.messages.subscribe` 重新订阅
- 获取完整的 session 状态快照（status、model、childSessions 等）
- 继续接收流式内容更新

### 事件发送条件

Gateway 根据以下条件决定发送哪些事件：

1. **`agent` 事件**：当 `isControlUiVisible === true` 且有 `sessionKey` 时发送
2. **`chat` 事件**：当 `isControlUiVisible === true` 且有 `sessionKey` 时，从 `agent.assistant` 和 `agent.lifecycle` 事件转换
3. **`session.message` 事件**：当消息追加到 transcript 时，仅发送给订阅了该 session 的连接

**重要**：某些 agent 配置可能只发送 `chat` 事件而不发送 `agent` 事件，客户端应同时监听两种事件以确保兼容性。

### 客户端实现建议

```typescript
// 0. 连接建立后，订阅所有 session 事件（全局调用一次）
await sessionsSubscribe()

// 1. 订阅 agent 事件（处理流式内容）
subscribeAgentStream(sessionKey, (event) => {
  if (event.stream === 'assistant') {
    // 处理 assistant 内容
  } else if (event.stream === 'lifecycle') {
    // 处理生命周期
  }
})

// 2. 订阅 chat 事件（备选方案，某些 agent 只发 chat 事件）
subscribeChatEvents(sessionKey, (event) => {
  if (event.state === 'delta') {
    // 更新流式内容
  } else if (event.state === 'final') {
    // 完成
  }
})

// 3. 页面刷新后重新订阅特定 session（可选，如果 sessions.subscribe 已调用则不需要）
await sessionsMessagesSubscribe(sessionKey)
```

---

### `chat.history`

获取聊天历史。

**参数：**
```json
{
  "sessionKey": "agent:main:context",
  "limit": 50
}
```

**返回：**
```json
{
  "messages": [
    {
      "runId": "run-xxx",
      "sessionKey": "agent:main:context",
      "seq": 0,
      "state": "final",
      "message": {
        "role": "user",
        "content": "Hello"
      },
      "timestamp": 1774265806022
    },
    {
      "runId": "run-xxx",
      "sessionKey": "agent:main:context",
      "seq": 1,
      "state": "final",
      "message": {
        "role": "assistant",
        "content": [{ "type": "text", "text": "Hi!" }]
      },
      "timestamp": 1774265806100
    }
  ]
}
```

**消息状态判断：**
- `state: "delta"` - 正在生成中
- `state: "final"` - 已完成
- 最后一条消息的 `role: "user"` 且无 `state: "final"` 的 assistant 消息 → agent 正在处理

---

### `config.get`

获取完整的 OpenClaw 配置。

**参数：** `{}`

**返回：**
```json
{
  "workspace": "/Users/xxx/.openclaw",
  "agents": {
    "defaults": {
      "model": "claude-sonnet-4-6",
      "contextTokens": 200000
    }
  },
  "channels": {
    "feishu": {
      "accounts": {
        "imggen": {
          "appId": "cli_xxx",
          "botName": "生成插图"
        }
      }
    }
  },
  "gateway": {
    "port": 18789,
    "mode": "local",
    "auth": { "mode": "token" },
    "controlUi": {
      "allowedOrigins": ["http://localhost:3000"]
    }
  },
  "plugins": {
    "allow": ["feishu", "workflow", "diffs"],
    "installs": {}
  },
  "hash": "sha256-hash",
  "issues": [],
  "warnings": []
}
```

---

### `logs.tail`

订阅实时日志流。

**参数：**
```json
{ "follow": true }
```

**返回：** 流式事件 `type: "ev"`

---

## 认证流程

### 1. 连接 WebSocket

```javascript
const ws = new WebSocket('ws://localhost:18789/ws')
```

### 2. 等待挑战事件

网关会发送：
```json
{
  "type": "event",
  "event": "connect.challenge",
  "payload": {
    "nonce": "uuid-nonce",
    "ts": 1774265896752
  }
}
```

### 3. 签名并响应

使用 Ed25519 私钥签名以下 payload（v2 格式）：

```
v2|<deviceId>|<clientId>|<clientMode>|<role>|<scopes>|<signedAtMs>|<token>|<nonce>
```

发送：
```json
{
  "type": "req",
  "id": "conn-<timestamp>",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": {
      "id": "openclaw-control-ui",
      "version": "2026.3.13",
      "platform": "browser",
      "mode": "webchat"
    },
    "device": {
      "id": "<deviceId>",
      "publicKey": "<base64url-public-key>",
      "signature": "<base64url-signature>",
      "signedAt": <timestamp-ms>,
      "nonce": "<challenge-nonce>"
    },
    "auth": { "token": "<gateway-token>" },
    "role": "operator",
    "scopes": ["operator.admin", "operator.read", "operator.write"]
  }
}
```

### 4. 接收确认

```json
{
  "type": "res",
  "id": "conn-<timestamp>",
  "ok": true,
  "payload": {
    "type": "hello-ok",
    "protocol": 3,
    "server": { "version": "2026.3.13", "connId": "uuid" }
  }
}
```

---

## 角色与权限

| 角色 | 权限 |
|------|------|
| `operator` | `operator.admin`, `operator.read`, `operator.write` |
| `admin` | 完全管理权限 |

---

## 错误码

| 错误码 | 描述 |
|--------|------|
| `NOT_LINKED` | 未链接 |
| `NOT_PAIRED` | 未配对 |
| `AGENT_TIMEOUT` | Agent 超时 |
| `INVALID_REQUEST` | 请求无效 |
| `UNAVAILABLE` | 服务不可用 |