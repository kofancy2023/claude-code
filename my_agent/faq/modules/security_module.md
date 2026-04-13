# 安全模块设计文档

## 概述

安全模块是 AI Agent 系统的核心防护层，负责验证输入、清理命令、扫描敏感信息以及过滤输出。该模块采用多层防御策略，在命令执行前进行全面的安全检查。

## 核心组件

### 1. InputValidator（输入验证器）

输入验证器负责验证用户输入的各种数据类型，包括路径、命令、URL 和 PII（个人身份信息）。

#### 核心功能

```typescript
export class InputValidator {
  // 路径验证：检测路径遍历攻击
  validatePath(path: string): ValidationResult

  // 命令验证：检测危险字符和命令注入
  validateCommand(command: string, allowShellSyntax?: boolean): ValidationResult

  // URL 验证：确保只允许 HTTP/HTTPS 协议
  validateUrl(url: string): ValidationResult

  // PII 检测：识别邮箱、URL、IP 地址
  containsPII(text: string): PIIResult
}
```

#### 路径遍历攻击防护

路径遍历攻击通过 `../` 或 `..\` 试图访问受保护的系统文件：

```
../../../etc/passwd      → 攻击者试图读取密码文件
..\..\windows\system32   → Windows 系统目录访问
```

验证器使用正则表达式检测这些模式：
```typescript
private pathTraversalPattern = /\.\.\/|\.\.\\/g;
```

#### 危险字符检测

控制字符（0x00-0x1F）和特殊Shell元字符可能被用于命令注入：
```typescript
private dangerousCharsPattern = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;
private commandInjectionPattern = /[;&|`$()<>{}[\]!?*#~%"']/g;
```

---

### 2. CommandSanitizer（命令清理器）

命令清理器提供命令的白名单机制和危险命令阻断。

#### 危险命令阻断

以下命令被完全禁止执行：

| 危险命令 | 说明 |
|---------|------|
| `rm -rf /` | 递归删除根目录 |
| `:(){ :|:& };:` | Fork 炸弹 |
| `dd if=` | 直接磁盘写入 |
| `mkfs` | 格式化文件系统 |
| `(wget\|curl).*\\|\\s*(bash\|sh)` | 远程代码下载执行 |

#### 白名单机制

```typescript
private allowedCommands = new Set([
  'ls', 'dir', 'cat', 'echo', 'pwd', 'cd', 'mkdir',
  'git', 'npm', 'yarn', 'node', 'python',
  // ... 更多安全命令
]);
```

#### 工作流程

```
输入命令
    ↓
检查是否匹配危险命令模式
    ↓ 是 → 直接拒绝，返回警告
    ↓ 否
    ↓
检查命令是否在白名单中
    ↓ 否 → 添加警告（不拒绝）
    ↓ 是
    ↓
清理 Shell 元字符
    ↓
返回清理后的命令
```

---

### 3. SecretScanner（敏感信息扫描器）

扫描文本中的敏感凭证和密钥，支持多种密钥格式。

#### 支持的密钥类型

| 类型 | 严重级别 | 模式示例 |
|-----|---------|---------|
| AWS Access Key | Critical | `AKIA...` |
| GitHub Token | Critical | `ghp_...`, `gho_...` |
| OpenAI API Key | Critical | `sk-...`, `sk-proj-...` |
| Private Key | Critical | `-----BEGIN PRIVATE KEY-----` |
| Bearer Token | High | `Bearer eyJ...` |
| Database URL | High | `postgresql://user:pass@...` |
| JWT Token | High | `eyJ...eyJ...eyJ...` |

#### 扫描结果

```typescript
interface ScanResult {
  hasSecrets: boolean;
  findings: Array<{
    type: string;           // 密钥类型名称
    match: string;          // 脱敏后的密钥
    severity: 'critical' | 'high' | 'medium';
    range: { start: number; end: number };
  }>;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
  };
}
```

#### 密钥脱敏

密钥被部分掩码以保护敏感信息：
```
ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    ↓
ghp_****************************xxxx
```

---

### 4. OutputSanitizer（输出过滤器）

清理输出中的敏感信息，防止密钥泄露。

```typescript
const result = outputSanitizer.sanitize(text);
// result.sanitized: "Your API key is [OpenAI API Key REDACTED]"
```

---

## 安全模块集成

### 在 REPL 中集成

```typescript
import { commandSanitizer, inputValidator, outputSanitizer } from './utils/security.js';

async function executeCommand(input: string): Promise<string> {
  // 1. 验证输入
  const validation = inputValidator.validateCommand(input);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // 2. 清理命令
  const sanitization = commandSanitizer.sanitizeCommand(input);
  if (sanitization.wasModified && sanitization.warnings.length > 0) {
    console.warn('Command warnings:', sanitization.warnings);
  }

  // 3. 执行命令...

  // 4. 清理输出
  const output = outputSanitizer.sanitize(rawOutput);
  if (output.hadSecrets) {
    console.warn('Secrets detected in output and redacted');
  }

  return output.sanitized;
}
```

### 在 BashTool 中集成

```typescript
// BashTool 执行前检查
const sanitization = commandSanitizer.sanitizeCommand(command);
if (sanitization.sanitized === '') {
  throw new Error('Command blocked by security filter');
}
```

---

## 测试验证

运行安全模块测试套件：

```bash
bun run test -- src/__tests__/unit/security.test.ts
```

### 测试覆盖

| 测试类别 | 测试数量 | 覆盖内容 |
|---------|---------|---------|
| InputValidator | 16 | 路径验证、命令验证、URL验证、PII检测 |
| CommandSanitizer | 9 | 危险命令阻断、白名单管理、命令清理 |
| SecretScanner | 10 | 各类密钥检测、脱敏、边界情况 |
| OutputSanitizer | 4 | 输出清理、错误信息清理 |
| 集成测试 | 5 | 多组件协作、真实攻击场景 |

---

## 安全最佳实践

### 1. 纵深防御

不要依赖单一安全机制，多层检查可以捕获不同类型的攻击。

### 2. 最小权限

使用白名单而非黑名单，仅允许明确安全的命令。

### 3. 输出过滤

不仅要保护输入，输出中的敏感信息同样需要脱敏。

### 4. 日志记录

记录安全事件但不要记录敏感信息本身。

### 5. 定期更新

随着新攻击手法的出现，定期更新危险命令模式库。

---

## 文件位置

- 源码：`src/utils/security.ts`
- 测试：`src/__tests__/unit/security.test.ts`
