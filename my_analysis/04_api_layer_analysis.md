# 04 API 层和服务通信分析

## API 层架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Code                              │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  services/api/claude.ts                                      │
│  - 构建 API 请求                                              │
│  - 处理流式响应                                                │
│  - 管理多提供商支持                                            │
└─────────────────────────┬───────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  Anthropic    │ │ AWS Bedrock   │ │   GCP Vertex  │
│  Direct       │ │               │ │               │
└───────────────┘ └───────────────┘ └───────────────┘
        │
        ▼
┌───────────────┐
│ Azure Foundry │
└───────────────┘
```

## services/api/claude.ts 详细分析

### 多提供商支持架构

```typescript
// 第 30-50 行: 提供商检测
import { getAPIProvider, isFirstPartyAnthropicBaseUrl } from 'src/utils/model/providers.js';

// 提供商类型
export type APIProvider = 'anthropic' | 'bedrock' | 'vertex' | 'azure';

// 提供商选择逻辑
function selectProvider(config: APIConfig): APIProvider {
    if (config.baseURL?.includes('bedrock')) return 'bedrock';
    if (config.baseURL?.includes('vertex')) return 'vertex';
    if (config.baseURL?.includes('azure')) return 'azure';
    return 'anthropic';
}
```

### Anthropic Direct (原生)

```typescript
// 第 100-200 行: Anthropic API 调用
import Anthropic from '@anthropic-ai/sdk';

// 创建客户端
const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
});

// 流式调用
const stream = await client.messages.stream({
    model: params.model,
    max_tokens: params.maxTokens,
    system: params.system,
    messages: params.messages as MessageParam[],
    tools: params.tools,
});

// 处理流事件
for await (const event of stream) {
    yield processStreamEvent(event);
}
```

### AWS Bedrock 支持

```typescript
// 第 200-300 行: Bedrock 配置
import { BedrockRuntimeClient } from '@anthropic-ai/bedrock-sdk';

// Bedrock 特定参数
const bedrockParams = {
    model: transformModelForBedrock(params.model),
    body: {
        anthropic_version: 'bedrock-2023-05-31',
        messages: params.messages,
        max_tokens: params.maxTokens,
        system: params.system,
    },
    region: config.region,
};

// 使用 Bedrock SDK
const client = new BedrockRuntimeClient({ region: config.region });
const response = await client.invokeModelWithResponseStream(bedrockParams);
```

### Google Vertex 支持

```typescript
// 第 300-400 行: Vertex 配置
import { VertexAI } from '@anthropic-ai/vertex-sdk';

// Vertex 认证
const vertexAI = new VertexAI({
    project: config.projectId,
    location: config.location,
});

// 调用
const generativeModel = vertexAI.getGenerativeModel({
    model: transformModelForVertex(params.model),
});

const result = await generativeModel.generateContentStream({
    contents: transformMessagesForVertex(params.messages),
    systemInstruction: params.system,
    generationConfig: {
        maxOutputTokens: params.maxTokens,
    },
});
```

### Azure Foundry 支持

```typescript
// 第 400-500 行: Azure 配置
import AzureOpenAI from '@anthropic-ai/foundry-sdk';

// Azure 端点
const client = new AzureOpenAI({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    apiVersion: config.apiVersion,
});

// 调用
const response = await client.chat.completions.create({
    model: params.model,
    messages: transformMessagesForAzure(params.messages),
    max_tokens: params.maxTokens,
    stream: true,
});
```

## API 请求构建

### 系统提示词构建

```typescript
// 第 500-600 行
function buildSystemPrompt(
    basePrompt: SystemPrompt[],
    additionalContext: ContextResult
): string {
    const parts: string[] = [];

    // 1. 基础系统提示词
    for (const prompt of basePrompt) {
        parts.push(renderSystemPrompt(prompt));
    }

    // 2. 用户上下文 (git status, cwd, 等)
    if (additionalContext.userContext) {
        parts.push(appendUserContext(additionalContext.userContext));
    }

    // 3. 系统上下文 (日期, 版本, 等)
    if (additionalContext.systemContext) {
        parts.push(appendSystemContext(additionalContext.systemContext));
    }

    return parts.join('\n\n');
}
```

### 消息规范化

```typescript
// 第 600-700 行
function normalizeMessagesForAPI(messages: Message[]): MessageParam[] {
    return messages.map(msg => {
        switch (msg.type) {
            case 'user':
                return {
                    role: 'user',
                    content: transformContent(msg.content),
                };
            case 'assistant':
                return {
                    role: 'assistant',
                    content: transformContent(msg.content),
                };
            case 'system':
                return {
                    role: 'system',
                    content: transformContent(msg.content),
                };
            default:
                return msg;
        }
    });
}
```

## 流式响应处理

### 事件类型

```typescript
// 第 700-800 行
export type StreamEvent =
    | { type: 'content_block_start'; index: number; content_block: ContentBlock }
    | { type: 'content_block_delta'; index: number; delta: ContentBlockDelta }
    | { type: 'message_delta'; delta: MessageDelta; usage: Usage }
    | { type: 'message_stop'; }
    | { type: 'error'; error: APIError };
```

### 事件处理

```typescript
// 第 800-900 行
function* processStreamEvent(event: BetaRawMessageStreamEvent): Generator<StreamEvent> {
    switch (event.type) {
        case 'content_block_start':
            yield {
                type: 'content_block_start',
                index: event.index,
                content_block: event.content_block,
            };
            break;

        case 'content_block_delta':
            // 处理增量内容
            if (isTextDelta(event.delta)) {
                yield {
                    type: 'content_block_delta',
                    index: event.index,
                    delta: { type: 'text_delta', text: event.delta.text },
                };
            } else if (isRedactedDelta(event.delta)) {
                // Thinking 块处理
                yield processThinkingDelta(event.delta);
            }
            break;

        case 'message_delta':
            yield {
                type: 'message_delta',
                delta: event.delta,
                usage: event.usage,
            };
            break;

        case 'message_stop':
            yield { type: 'message_stop' };
            break;
    }
}
```

## Beta Headers 配置

```typescript
// 第 100-150 行: Beta 功能开关
const BETA_HEADERS = {
    // 提示词缓存
    [PROMPT_CACHING_SCOPE_BETA_HEADER]: getPromptCache1hEligible(),

    // 上下文管理
    [CONTEXT_MANAGEMENT_BETA_HEADER]: getAPIContextManagement(),

    // 快速模式
    [FAST_MODE_BETA_HEADER]: getFastModeHeaderLatched(),

    // 思考模式
    [REDACT_THINKING_BETA_HEADER]: getThinkingClearLatched(),

    // 努力程度
    [EFFORT_BETA_HEADER]: resolveAppliedEffort(),

    // 1M 上下文
    [CONTEXT_1M_BETA_HEADER]: 'enabled',

    // 任务预算
    [TASK_BUDGETS_BETA_HEADER]: 'enabled',
};
```

## Token 计算

```typescript
// 第 900-1000 行
export function countTokensForMessages(
    messages: Message[],
    tools?: Tool[]
): number {
    // 使用 SDK 的 token 计算
    const count = client.countTokens({
        messages: normalizeMessagesForAPI(messages),
        tools: tools?.map(toolToAPISchema),
    });
    return count;
}
```

## 错误处理

```typescript
// 第 1000-1100 行
export function categorizeRetryableAPIError(error: APIError): {
    canRetry: boolean;
    shouldCompactor: boolean;
    tier: 'immediate' | 'delayed' | 'fatal';
} {
    if (error instanceof APIConnectionTimeoutError) {
        return { canRetry: true, shouldCompactor: false, tier: 'immediate' };
    }

    if (error instanceof APIUserAbortError) {
        return { canRetry: false, shouldCompactor: false, tier: 'fatal' };
    }

    if (isRateLimitError(error)) {
        return { canRetry: true, shouldCompactor: true, tier: 'delayed' };
    }

    if (isPromptTooLongMessage(error)) {
        return { canRetry: false, shouldCompactor: true, tier: 'fatal' };
    }

    return { canRetry: false, shouldCompactor: false, tier: 'fatal' };
}
```

## 关键文件

| 文件 | 行数 | 核心职责 |
|------|------|----------|
| [services/api/claude.ts](file:///d:/mySource/cusor-proj/claude-code/src/services/api/claude.ts) | 800+ | API 客户端核心 |
| [utils/model/providers.ts](file:///d:/mySource/cusor-proj/claude-code/src/utils/model/providers.ts) | - | 提供商选择 |
| [utils/betas.ts](file:///d:/mySource/cusor-proj/claude-code/src/utils/betas.ts) | - | Beta 功能配置 |
| [services/api/errors.ts](file:///d:/mySource/cusor-proj/claude-code/src/services/api/errors.ts) | - | 错误处理 |
| [utils/model/model.ts](file:///d:/mySource/cusor-proj/claude-code/src/utils/model/model.ts) | - | 模型配置 |

## 认证机制

### API Key 认证

```typescript
// utils/auth.ts
export function getClaudeAIOAuthTokens(): AuthTokens | null {
    // 从钥匙串读取
    const tokens = readFromKeychain('claude-api');
    return tokens;
}
```

### OAuth 认证

```typescript
// utils/auth.ts
export async function startOAuthFlow(): Promise<AuthTokens> {
    // 1. 打开浏览器进行 OAuth
    const authUrl = buildOAuthUrl();
    await openBrowser(authUrl);

    // 2. 等待回调
    const code = await waitForCallback();

    // 3. 交换 token
    const tokens = await exchangeCodeForTokens(code);
    return tokens;
}
```

## 改造优化建议

### 高优先级

1. **添加请求日志**
   ```typescript
   // 在 claude.ts 添加请求/响应日志
   function logAPIRequest(params: QueryParams) {
       console.log('[API Request]', {
           model: params.model,
           messageCount: params.messages.length,
           toolsCount: params.tools?.length,
           timestamp: new Date().toISOString(),
       });
   }
   ```

2. **实现请求缓存**
   ```typescript
   // 对相同内容添加缓存
   const requestCache = new LRUCache<string, Response>({ max: 100 });
   ```

### 中优先级

1. **添加响应压缩**
   - 启用 gzip 压缩
   - 减少网络传输

2. **实现连接池**
   - 复用 HTTP 连接
   - 减少连接开销

### 低优先级

1. **添加指标收集**
   - API 延迟
   - Token 使用量
   - 错误率

2. **支持更多提供商**
   - Cohere
   - AI21
   - 本地模型

## 下一步

- [工具系统架构分析](./05_tools_analysis.md)
- [UI 层（Ink）渲染系统分析](./06_ink_ui_analysis.md)
