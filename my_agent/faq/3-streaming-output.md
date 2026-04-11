# 流式输出实现详解

本文档详细解释 AI Agent 项目中流式输出的实现原理和技术细节。

---

## 1. 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户输入 "你好"                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  GLMClient.sendMessage()                                         │
│  - 发起 HTTP 请求，设置 stream: true                             │
│  - 返回一个 ReadableStream（SSE 数据流）                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  parseSSEStream() 循环读取                                      │
│  - 每次读到数据 → 触发 onChunk 回调                             │
│  - 数据格式: data: {"choices":[{"delta":{"content":"你"}}]}
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
         onChunk(text)            onComplete(fullText)
                    │                       │
                    ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  REPL.createStreamCallbacks()                                   │
│  - onChunk: 直接输出文本片段                                    │
│  - onComplete: 输出完成统计信息                                  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  终端输出                                                        │
│  你好！有什么可以帮助你的吗？                                     │
│  ✓ 135 tokens, 15s (9 tok/s)                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心组件

### 2.1 回调接口 (src/services/api/types.ts)

```typescript
interface StreamCallbacks {
  /** 每个文本片段到达时触发 */
  onChunk?: (text: string) => void;
  /** 流结束时触发 */
  onComplete?: (fullText: string) => void;
  /** 发生错误时触发 */
  onError?: (error: Error) => void;
}
```

这个接口定义了流式传输的三个关键事件，允许调用者订阅这些事件来实现自定义处理逻辑。

### 2.2 回调创建 (src/core/Repl.ts)

```typescript
private createStreamCallbacks(): StreamCallbacks {
  let tokenCount = 0;
  const startTime = Date.now();

  return {
    onChunk: (text: string) => {
      tokenCount++;
      process.stdout.write(text);  // 直接输出文本片段
    },
    onComplete: (_fullText: string) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const speed = elapsed && parseFloat(elapsed) > 0
        ? Math.round(tokenCount / parseFloat(elapsed))
        : 0;
      process.stdout.write(`\n\x1b[32m✓\x1b[0m \x1b[90m${tokenCount} tokens, ${elapsed}s (${speed} tok/s)\x1b[0m\n\n`);
    },
    onError: (error: Error) => {
      process.stdout.write('\n');
      console.error(terminal.renderError(error.message));
    },
  };
}
```

### 2.3 GLMClient 流式解析 (src/services/api/GLMClient.ts)

```typescript
private async parseSSEStream(
  response: Response,
  callbacks?: StreamCallbacks
): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop()!;

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();

        if (data === '[DONE]') continue;

        try {
          const chunk = JSON.parse(data);
          const content = chunk.choices[0]?.delta?.content;

          if (content) {
            fullText += content;
            callbacks?.onChunk?.(content);
          }
        } catch {
          // 忽略无法解析的行
        }
      }
    }
  } catch (error) {
    callbacks?.onError?.(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }

  callbacks?.onComplete?.(fullText);
  return fullText;
}
```

---

## 3. 关键技术点

### 3.1 Web Streams API

使用 `ReadableStream` 和 `TextDecoder` 处理 HTTP 流式响应：

| API | 说明 |
|-----|------|
| `response.body.getReader()` | 获取流读取器 |
| `reader.read()` | 异步读取下一个数据块 |
| `decoder.decode(value, { stream: true })` | 解码二进制数据，保留未完成的 UTF-8 序列 |

### 3.2 SSE (Server-Sent Events) 格式

GLM API 返回的 SSE 数据格式：

```
data: {"choices":[{"delta":{"content":"你"}}]}
data: {"choices":[{"delta":{"content":"好"}}]}
data: [DONE]
```

解析规则：
1. 按 `\n` 分割行
2. 跳过不以 `data: ` 开头的行
3. 跳过 `data: [DONE]` 结束标记
4. 提取 `choices[0].delta.content` 作为实际文本

### 3.3 ANSI 转义序列

用于控制终端颜色：

| 转义序列 | 说明 |
|---------|------|
| `\x1b[32m` | 设置前景色为绿色 |
| `\x1b[31m` | 设置前景色为红色 |
| `\x1b[0m` | 重置所有属性 |
| `\x1b[90m` | 设置前景色为亮黑色（灰色） |

---

## 4. 设计理念

### 4.1 简洁至上

参考 Claude Code 的实现方式，采用最简单直接的方案：

| 方案 | 优点 | 缺点 |
|-----|------|------|
| ~~实时速度显示~~ | 炫酷 | 终端兼容性差，闪烁 |
| 简洁直接输出 | 稳定可靠，无依赖 | 无实时反馈 |
| 完成时统计 | 清晰简洁 | 需等待完成 |

### 4.2 避免复杂光标操作

之前方案使用了 `\x1b[1A`（上移光标）、`\x1b[2K`（清除行）等转义序列，在不同终端下表现不一致。现在的方案直接写入，不做覆盖，稳定性更高。

### 4.3 零额外依赖

使用 Node.js 内置的 `process.stdout.write` 和原生 Web Streams API，无需第三方库。

---

## 5. 终端显示效果

```
────────────────────────────────────────────────────────────
你好

你好！有什么可以帮助你的吗？

✓ 135 tokens, 15s (9 tok/s)

>
```

### 显示元素说明

| 元素 | 说明 |
|-----|------|
| `✓` | 绿色勾号，表示成功完成 |
| `135 tokens` | 总 token 数量 |
| `15s` | 总耗时（秒） |
| `9 tok/s` | 平均 token 速度（每秒 token 数） |

---

## 6. 使用示例

### 6.1 基本用法

```typescript
const callbacks = {
  onChunk: (text: string) => {
    process.stdout.write(text);
  },
  onComplete: (fullText: string) => {
    console.log(`\n完成！共 ${fullText.length} 字符`);
  },
  onError: (error: Error) => {
    console.error(`错误: ${error.message}`);
  },
};

await client.sendMessage(messages, tools, callbacks);
```

### 6.2 带计时的完整示例

```typescript
private createStreamCallbacks(): StreamCallbacks {
  let tokenCount = 0;
  const startTime = Date.now();

  return {
    onChunk: (text: string) => {
      tokenCount++;
      process.stdout.write(text);
    },
    onComplete: (_fullText: string) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const speed = elapsed && parseFloat(elapsed) > 0
        ? Math.round(tokenCount / parseFloat(elapsed))
        : 0;
      process.stdout.write(
        `\n\x1b[32m✓\x1b[0m \x1b[90m${tokenCount} tokens, ${elapsed}s (${speed} tok/s)\x1b[0m\n\n`
      );
    },
    onError: (error: Error) => {
      process.stdout.write('\n');
      console.error(terminal.renderError(error.message));
    },
  };
}
```

---

## 7. StreamingRenderer 保留但简化

虽然当前的 REPL 实现不使用 `StreamingRenderer`，但该类仍然保留在 `terminal.ts` 中，可用于需要更复杂 UI 场景：

```typescript
// 可用于需要原地更新的场景
const streamer = terminal.createStream();
streamer.start('thinking...');

// 模拟流式输出
for (const char of 'Hello World') {
  await delay(50);
  streamer.update('', tokenCount);
  process.stdout.write(char);
  tokenCount++;
}

streamer.finish('Completed');
```

---

## 8. 注意事项

1. **Windows 兼容性**: `process.stdout.write` 在 Windows 上正常工作
2. **非 TTY 环境**: 在管道或重定向输出时，颜色转义序列可能被忽略
3. **缓冲区**: 大量输出时考虑添加防抖处理
4. **错误恢复**: 流中断后应在终端清晰显示错误信息
