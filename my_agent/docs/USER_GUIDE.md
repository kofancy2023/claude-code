# My Agent 用户指南

> 版本: 0.1.0
> 最后更新: 2026-04-15

---

## 1. 项目概述

My Agent 是一个基于 AI 的代码助手工具，灵感来源于 Claude Code。它提供了以下核心功能：

- **AI 驱动的代码助手**：支持多种 AI 提供商，包括 GLM、Anthropic、OpenAI 和 Gemini
- **强大的工具系统**：内置 25+ 种工具，支持文件操作、Git 操作、网络搜索等
- **会话管理**：支持创建、保存、加载和导出会话
- **向量存储/记忆系统**：能够记住过去的对话内容，提供更连贯的交互体验
- **编辑器 LSP 集成**：支持代码补全、定义查找等智能代码功能
- **VS Code 扩展**：提供 IDE 集成
- **插件系统**：支持自定义插件扩展功能
- **MCP 集成**：支持 MCP (Model Context Protocol) 工具

## 2. 快速开始

### 2.1 安装依赖

```bash
cd my_agent
npm install
```

### 2.2 配置环境变量

#### 使用 GLM (默认)

```bash
# Linux/macOS
export AI_API_KEY=your-glm-api-key

# Windows (PowerShell)
$env:AI_API_KEY="your-glm-api-key"
```

#### 使用 Anthropic

```bash
# Linux/macOS
export AI_PROVIDER=anthropic
export ANTHROPIC_API_KEY=your-anthropic-api-key

# Windows (PowerShell)
$env:AI_PROVIDER="anthropic"
$env:ANTHROPIC_API_KEY="your-anthropic-api-key"
```

#### 使用 OpenAI

```bash
# Linux/macOS
export AI_PROVIDER=openai
export OPENAI_API_KEY=your-openai-api-key

# Windows (PowerShell)
$env:AI_PROVIDER="openai"
$env:OPENAI_API_KEY="your-openai-api-key"
```

#### 使用 Gemini

```bash
# Linux/macOS
export AI_PROVIDER=gemini
export GEMINI_API_KEY=your-gemini-api-key

# Windows (PowerShell)
$env:AI_PROVIDER="gemini"
$env:GEMINI_API_KEY="your-gemini-api-key"
```

### 2.3 运行 My Agent

```bash
npm run dev
```

## 3. 基本使用

### 3.1 对话模式

启动 My Agent 后，您可以直接输入问题或指令，AI 会给出响应。例如：

```
> 帮我写一个 TypeScript 函数，计算斐波那契数列
```

### 3.2 命令模式

My Agent 支持多种命令，以 `/` 开头：

- `/help` - 显示帮助信息
- `/session` - 会话管理命令
- `/clear` - 清除终端
- `/exit` - 退出 My Agent
- `/chains` - 显示注册的工具链

## 4. 会话管理

### 4.1 列出所有会话

```
/session list
```

### 4.2 创建新会话

```
/session create "My Project"
```

### 4.3 加载会话

```
/session load session-12345
```

### 4.4 删除会话

```
/session delete session-12345
```

### 4.5 重命名会话

```
/session rename session-12345 "New Name"
```

### 4.6 导出会话

```
# 导出到标准输出
/session export session-12345

# 导出到文件
/session export session-12345 session.json
```

### 4.7 导入会话

```
/session import session.json
```

## 5. 工具系统

My Agent 内置了 25+ 种工具，AI 可以根据需要自动使用这些工具：

### 5.1 文件操作工具

- `FileReadTool` - 读取文件内容
- `FileWriteTool` - 写入文件内容
- `FileListTool` - 列出目录中的文件
- `GlobTool` - 使用 glob 模式匹配文件
- `GrepTool` - 搜索文件内容
- `EditTool` - 编辑文件内容
- `MkdirTool` - 创建目录
- `RmTool` - 删除文件或目录
- `CopyTool` - 复制文件或目录
- `MoveTool` - 移动文件或目录

### 5.2 Git 操作工具

- `GitStatusTool` - 查看 Git 状态
- `GitCommitTool` - 提交 Git 更改
- `GitPushTool` - 推送 Git 更改
- `GitPullTool` - 拉取 Git 更改
- `GitBranchTool` - 管理 Git 分支
- `GitDiffTool` - 查看 Git 差异

### 5.3 GitHub 工具

- `GitHubRepoTool` - 操作 GitHub 仓库
- `GitHubIssueTool` - 管理 GitHub Issue
- `GitHubCodeSearchTool` - 搜索 GitHub 代码
- `GitHubPullRequestTool` - 管理 GitHub PR
- `GitHubCommitTool` - 管理 GitHub 提交
- `GitHubBranchTool` - 管理 GitHub 分支
- `GitHubUserTool` - 查看 GitHub 用户信息

### 5.4 其他工具

- `BashTool` - 执行 bash 命令
- `WebSearchTool` - 进行网络搜索
- `DateTool` - 获取当前日期和时间
- `LSPTool` - 代码智能提示和分析

## 6. 配置选项

### 6.1 环境变量

| 环境变量 | 描述 | 默认值 |
|---------|------|--------|
| `AI_PROVIDER` | AI 提供商 (glm, anthropic, openai, gemini) | `glm` |
| `AI_API_KEY` | AI 提供商 API 密钥 | - |
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 | - |
| `OPENAI_API_KEY` | OpenAI API 密钥 | - |
| `GEMINI_API_KEY` | Gemini API 密钥 | - |
| `AI_MODEL` | AI 模型名称 | 各提供商的默认模型 |
| `AI_BASE_URL` | AI API 基础 URL | 各提供商的默认 URL |

### 6.2 CLI 参数

```bash
# 使用命令行参数
my-agent --provider glm --api-key your-key

# 使用短选项
my-agent -p anthropic -k your-key -m claude-3-5-sonnet

# 显示帮助
my-agent --help
```

## 7. 高级功能

### 7.1 向量存储/记忆系统

My Agent 内置了向量存储系统，可以记住过去的对话内容，提供更连贯的交互体验。当您提问时，My Agent 会自动检索相关的记忆并作为上下文提供给 AI。

### 7.2 编辑器 LSP 集成

My Agent 集成了 LSP (Language Server Protocol)，支持以下功能：

- 代码补全
- 签名帮助
- 定义查找
- 引用查找
- 文档符号
- 代码操作
- 文档格式化

### 7.3 插件系统

My Agent 支持插件扩展，可以通过以下方式安装插件：

```bash
# 安装内置插件
my-agent plugin install git

# 安装第三方插件
my-agent plugin install https://github.com/user/plugin-name
```

### 7.4 工具链

工具链是一系列工具的组合，可以用于完成复杂的任务。例如，您可以创建一个工具链来：

1. 搜索代码库中的特定函数
2. 读取相关文件
3. 分析代码
4. 生成修复方案
5. 应用修复

## 8. VS Code 扩展

My Agent 提供了 VS Code 扩展，您可以在 VS Code 中直接使用 My Agent 的功能：

### 8.1 安装扩展

1. 打开 VS Code
2. 进入扩展面板 (Ctrl+Shift+X)
3. 搜索 "My Agent"
4. 点击安装

### 8.2 使用扩展

- **侧边栏**：打开 My Agent 侧边栏，直接与 AI 对话
- **命令面板**：使用 `Ctrl+Shift+P` 打开命令面板，输入 "My Agent" 查看可用命令
- **快捷键**：使用 `Ctrl+Shift+A` (Windows/Linux) 或 `Cmd+Shift+A` (Mac) 快速提问

## 9. 常见问题

### 9.1 API 密钥问题

- **问题**：API 密钥无效或过期
- **解决方案**：检查 API 密钥是否正确，确保您的账户有足够的配额

### 9.2 工具执行失败

- **问题**：工具执行失败，显示权限错误
- **解决方案**：确保您有足够的权限执行该操作，例如写入文件或执行命令

### 9.3 性能问题

- **问题**：响应速度慢
- **解决方案**：检查网络连接，考虑使用更强大的 AI 模型，或减少上下文长度

### 9.4 会话管理问题

- **问题**：会话保存失败
- **解决方案**：确保您有写入权限，检查磁盘空间

## 10. 贡献指南

### 10.1 代码规范

- 使用 TypeScript
- 所有公共 API 需要添加 JSDoc 注释
- 提交前运行 `npm test`
- 遵循现有的代码风格

### 10.2 Git 提交规范

```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式调整
refactor: 重构
test: 测试相关
chore: 构建/工具相关
```

### 10.3 开发流程

1. Fork 仓库
2. 创建特性分支
3. 提交更改
4. 运行测试
5. 创建 Pull Request

## 11. 故障排除

### 11.1 查看日志

```bash
# 查看详细日志
my-agent --debug
```

### 11.2 常见错误

| 错误信息 | 可能原因 | 解决方案 |
|---------|---------|---------|
| `API key not found` | 未设置 API 密钥 | 设置相应的环境变量 |
| `Tool execution failed` | 工具执行失败 | 检查工具参数和权限 |
| `Session not found` | 会话不存在 | 检查会话 ID 是否正确 |
| `Context length exceeded` | 上下文长度超过限制 | 减少对话长度或使用更强大的模型 |

## 12. 许可证

My Agent 采用 MIT 许可证，详见 LICENSE 文件。

## 13. 联系方式

- **GitHub**：[https://github.com/yourusername/my-agent](https://github.com/yourusername/my-agent)
- **Email**：support@my-agent.dev

---

感谢使用 My Agent！如果您有任何问题或建议，欢迎联系我们。