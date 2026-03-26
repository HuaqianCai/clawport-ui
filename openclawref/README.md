# OpenClaw Source Reference

This directory contains source code copied from the OpenClaw repository for reference.

## Directory Structure

```
openclawref/
├── gateway/           # Gateway server-side code
│   ├── control-ui.ts           # Main Control UI request handler
│   ├── control-ui-routing.ts   # Request routing classification
│   ├── control-ui-contract.ts  # TypeScript types for Control UI
│   ├── control-ui-shared.ts    # Shared utilities (avatar, basePath)
│   ├── control-ui-http-utils.ts # HTTP helpers
│   ├── control-ui-csp.ts       # Content Security Policy
│   └── server-http.ts          # HTTP server setup
│
├── ui-views/          # Frontend view components
│   ├── chat.ts                  # Chat view (route: /chat)
│   └── sessions.ts              # Sessions view
│
├── ui-controllers/    # Frontend controllers
│   ├── chat.ts                  # Chat controller logic
│   ├── navigation.ts            # Route definitions (TAB_PATHS)
│   ├── app-chat.ts              # Chat application state
│   └── app-gateway.ts           # WebSocket gateway client
│
├── ui-chat/           # Chat UI helpers
│   ├── message-normalizer.ts    # Message formatting
│   ├── slash-commands.ts        # Slash command handling
│   ├── tool-cards.ts            # Tool result rendering
│   └── grouped-render.ts        # Message grouping
│
└── shared/            # Shared protocol definitions
    └── GatewayModels.swift      # RPC interface types (auto-generated)
```

---

## chat.send 接口详解

### 调用方式

**源码：** `ui-controllers/chat.ts` → `sendChatMessage()`

```typescript
await state.client.request("chat.send", {
  sessionKey: state.sessionKey,
  message: msg,
  deliver: false,
  idempotencyKey: runId,
  attachments: apiAttachments,
});
```

**参数说明：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `sessionKey` | string | 会话标识，格式 `agent:<agentId>:<context>` |
| `message` | string | 用户消息文本 |
| `deliver` | boolean | 是否投递到频道（一般设为 `false`） |
| `idempotencyKey` | string | 幂等键，用于去重（使用 UUID） |
| `attachments` | array | 附件列表（图片等） |

**返回值：**

```json
{
  "runId": "uuid-run-id",
  "status": "started"
}
```

### 发送前的状态更新

在调用 `chat.send` 之前，UI 会先更新本地状态：

```typescript
// 1. 构建用户消息内容
const contentBlocks = [
  { type: "text", text: msg },
  // 如果有图片附件
  { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "..." } }
];

// 2. 立即添加用户消息到聊天记录
state.chatMessages = [
  ...state.chatMessages,
  { role: "user", content: contentBlocks, timestamp: Date.now() }
];

// 3. 设置发送状态
state.chatSending = true;
state.chatRunId = runId;          // 用于追踪当前运行
state.chatStream = "";            // 初始化流式内容缓冲区
state.chatStreamStartedAt = now;  // 记录开始时间
```

---

## 事件解析

`chat.send` 调用后，Gateway 会通过 WebSocket 推送多种事件。UI 监听 `chat` 事件并处理。

### 事件监听入口

**源码：** `ui-controllers/app-gateway.ts` → `handleGatewayEventUnsafe()`

```typescript
if (evt.event === "chat") {
  handleChatGatewayEvent(host, evt.payload as ChatEventPayload | undefined);
  return;
}
```

### ChatEventPayload 类型定义

**源码：** `ui-controllers/chat.ts`

```typescript
export type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};
```

### 事件处理逻辑

**源码：** `ui-controllers/chat.ts` → `handleChatEvent()`

#### 1. sessionKey 过滤

```typescript
if (payload.sessionKey !== state.sessionKey) {
  return null;  // 忽略其他会话的事件
}
```

#### 2. runId 过滤（子代理场景）

```typescript
// 如果事件来自不同的 runId（如子代理 announce），只处理 final 事件
if (payload.runId && state.chatRunId && payload.runId !== state.chatRunId) {
  if (payload.state === "final") {
    // 将子代理消息添加到聊天记录
    state.chatMessages = [...state.chatMessages, finalMessage];
  }
  return null;
}
```

#### 3. delta 事件处理

```typescript
if (payload.state === "delta") {
  const next = extractText(payload.message);
  if (typeof next === "string" && !isSilentReplyStream(next)) {
    const current = state.chatStream ?? "";
    // 只更新如果新内容更长（防止旧事件覆盖新内容）
    if (!current || next.length >= current.length) {
      state.chatStream = next;
    }
  }
}
```

**关键点：**
- `delta` 事件的 `message.content` 包含**完整文本**，不是增量
- UI 使用 `chatStream` 变量存储当前流式内容
- 需要检查长度以防止乱序事件覆盖

#### 4. final 事件处理

```typescript
if (payload.state === "final") {
  const finalMessage = normalizeFinalAssistantMessage(payload.message);
  if (finalMessage && !isAssistantSilentReply(finalMessage)) {
    // 添加最终消息到聊天记录
    state.chatMessages = [...state.chatMessages, finalMessage];
  } else if (state.chatStream?.trim()) {
    // 如果没有 final message，使用流式内容
    state.chatMessages = [
      ...state.chatMessages,
      { role: "assistant", content: [{ type: "text", text: state.chatStream }], timestamp: Date.now() }
    ];
  }
  // 清理流式状态
  state.chatStream = null;
  state.chatRunId = null;
  state.chatStreamStartedAt = null;
}
```

**关键点：**
- `final` 事件表示对话完成
- 消息会被添加到 `chatMessages` 数组
- 清理所有流式相关状态

#### 5. aborted 事件处理

```typescript
if (payload.state === "aborted") {
  const normalizedMessage = normalizeAbortedAssistantMessage(payload.message);
  if (normalizedMessage && !isAssistantSilentReply(normalizedMessage)) {
    state.chatMessages = [...state.chatMessages, normalizedMessage];
  } else if (state.chatStream?.trim()) {
    // 使用已流式传输的内容
    state.chatMessages = [
      ...state.chatMessages,
      { role: "assistant", content: [{ type: "text", text: state.chatStream }], timestamp: Date.now() }
    ];
  }
  // 清理状态
  state.chatStream = null;
  state.chatRunId = null;
  state.chatStreamStartedAt = null;
}
```

**关键点：**
- 用户主动中止时触发
- 保留已流式传输的内容

#### 6. error 事件处理

```typescript
if (payload.state === "error") {
  state.chatStream = null;
  state.chatRunId = null;
  state.chatStreamStartedAt = null;
  state.lastError = payload.errorMessage ?? "chat error";
}
```

---

## 状态变量

### ChatState 类型

**源码：** `ui-controllers/chat.ts`

```typescript
export type ChatState = {
  client: GatewayBrowserClient | null;  // Gateway WebSocket 客户端
  connected: boolean;                   // 连接状态
  sessionKey: string;                   // 当前会话 key

  chatLoading: boolean;                 // 正在加载历史
  chatMessages: unknown[];              // 聊天消息列表
  chatThinkingLevel: string | null;     // 思考级别
  chatSending: boolean;                 // 正在发送消息
  chatMessage: string;                  // 输入框内容
  chatAttachments: ChatAttachment[];    // 附件列表
  chatRunId: string | null;             // 当前运行的 runId
  chatStream: string | null;            // 流式内容缓冲
  chatStreamStartedAt: number | null;   // 流式开始时间
  lastError: string | null;             // 最后错误
};
```

---

## 完整事件流程

```
用户输入 → handleSendChat()
    ↓
sendChatMessage()
    ├── 添加用户消息到 chatMessages
    ├── 设置 chatSending = true
    ├── 设置 chatRunId
    ├── 设置 chatStream = ""
    └── 调用 chat.send
    ↓
Gateway 返回 { runId, status: "started" }
    ↓
Gateway 推送 chat 事件 → handleChatGatewayEvent()
    ↓
state === "delta"
    └── 更新 chatStream（流式内容）
    ↓
state === "final"
    ├── 添加 assistant 消息到 chatMessages
    ├── 清理 chatStream
    ├── 清理 chatRunId
    └── 刷新 Sessions 列表（如果需要）
```

---

## 消息标准化

**源码：** `ui-chat/message-normalizer.ts` → `normalizeMessage()`

消息从 Gateway 返回后，需要标准化为统一格式：

```typescript
export function normalizeMessage(message: unknown): NormalizedMessage {
  const m = message as Record<string, unknown>;
  let role = typeof m.role === "string" ? m.role : "unknown";

  // 检测工具结果消息
  const hasToolId = typeof m.toolCallId === "string" || typeof m.tool_call_id === "string";
  const hasToolContent = Array.isArray(contentItems) && contentItems.some(item => {
    const t = (item.type || "").toLowerCase();
    return t === "toolresult" || t === "tool_result";
  });

  if (hasToolId || hasToolContent || hasToolName) {
    role = "toolResult";
  }

  // 提取内容
  let content: MessageContentItem[] = [];
  if (typeof m.content === "string") {
    content = [{ type: "text", text: m.content }];
  } else if (Array.isArray(m.content)) {
    content = m.content.map(item => ({
      type: item.type || "text",
      text: item.text,
      name: item.name,
      args: item.args || item.arguments,
    }));
  } else if (typeof m.text === "string") {
    content = [{ type: "text", text: m.text }];
  }

  return { role, content, timestamp, id, senderLabel };
}
```

### 角色类型

| role | 说明 |
|------|------|
| `user` | 用户消息 |
| `assistant` | 助手/代理消息 |
| `toolResult` | 工具调用结果 |
| `system` | 系统消息（如斜杠命令结果） |

---

## Gateway 数据模型

以下数据结构来自 `docs/GatewayModels.swift`（从源码编译生成）。

### ChatSendParams

```swift
public struct ChatSendParams: Codable, Sendable {
    public let sessionkey: String        // sessionKey
    public let message: String
    public let thinking: String?
    public let deliver: Bool?
    public let attachments: [AnyCodable]?
    public let timeoutms: Int?           // timeoutMs
    public let systeminputprovenance: [String: AnyCodable]?  // systemInputProvenance
    public let systemprovenancereceipt: String?              // systemProvenanceReceipt
    public let idempotencykey: String    // idempotencyKey
}
```

### ChatEvent

```swift
public struct ChatEvent: Codable, Sendable {
    public let runid: String           // runId
    public let sessionkey: String      // sessionKey
    public let seq: Int
    public let state: AnyCodable       // "delta" | "final" | "aborted" | "error"
    public let message: AnyCodable?
    public let errormessage: String?   // errorMessage
    public let usage: AnyCodable?
    public let stopreason: String?     // stopReason
}
```

### AgentEvent

```swift
public struct AgentEvent: Codable, Sendable {
    public let runid: String     // runId
    public let seq: Int
    public let stream: String    // "lifecycle" | "assistant" | "tool" | "error"
    public let ts: Int
    public let data: [String: AnyCodable]
}
```

### ChatHistoryParams

```swift
public struct ChatHistoryParams: Codable, Sendable {
    public let sessionkey: String  // sessionKey
    public let limit: Int?
}
```

### ChatAbortParams

```swift
public struct ChatAbortParams: Codable, Sendable {
    public let sessionkey: String  // sessionKey
    public let runid: String?      // runId (可选)
}
```

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `ui-controllers/chat.ts` | 核心聊天逻辑：sendChatMessage, handleChatEvent, loadChatHistory |
| `ui-controllers/app-chat.ts` | 应用层聊天逻辑：handleSendChat, handleAbortChat, slash 命令 |
| `ui-controllers/app-gateway.ts` | Gateway 事件分发：handleGatewayEventUnsafe |
| `ui-chat/message-normalizer.ts` | 消息标准化：normalizeMessage |
| `docs/GatewayModels.swift` | Gateway 数据模型定义（从源码编译） |

---

## Source

These files are copied from `/Users/huaqiancai/GitRepo/openclaw/` for reference purposes.