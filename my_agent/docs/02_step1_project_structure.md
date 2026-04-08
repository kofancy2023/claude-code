# Step 1: 项目基础结构

## 目标

搭建一个可运行的最小 TypeScript + Bun 项目。

## 交付物

```
my_agent/
├── package.json      # 依赖管理
├── tsconfig.json     # TypeScript 配置
├── src/
│   └── index.ts      # 入口文件
└── docs/
    └── ...           # 文档
```

## 1.1 为什么选择 Bun？

### Bun vs Node.js vs Deno

| 特性 | Bun | Node.js | Deno |
|------|-----|---------|------|
| 启动速度 | ⚡⚡⚡ 快 | ⚡ 慢 | ⚡⚡ 中 |
| TypeScript | 内置 | 需配置 | 内置 |
| npm 兼容 | ✅ | ✅ | ❌ |
| 生态 | 📦 增长中 | 📦📦📦 成熟 | 📦 新 |

**我们的选择**: Bun - 因为：
1. 启动速度快，开发体验好
2. 内置 TypeScript 支持，无需额外配置
3. 兼容 npm生态

## 1.2 package.json 创建

### 核心依赖分析

```json
{
  "name": "my-agent",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "bun run src/index.ts",
    "build": "bun build ./src/index.ts --outdir=dist --target=bun",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.52.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}
```

### 关键配置解释

| 字段 | 值 | 原因 |
|------|-----|------|
| `"type": "module"` | ESM 模块 | 使用 `import/export` 语法 |
| `"scripts.dev"` | `bun run` | Bun 比 ts-node 快 |
| `@anthropic-ai/sdk` | 核心依赖 | Anthropic 官方 SDK |

## 1.3 tsconfig.json 配置

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["bun-types"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 关键配置解析

| 配置 | 值 | 原因 |
|------|-----|------|
| `target` | ES2022 | 支持 top-level await |
| `moduleResolution` | bundler | 与 Bun/Vite 兼容 |
| `types` | bun-types | Bun 全局类型声明 |
| `strict` | true | 类型安全 |

## 1.4 入口文件实现

```typescript
// src/index.ts

console.log("Hello, AI Agent!");

// 测试 CLI 参数
const args = process.argv.slice(2);
console.log("Args:", args);
```

## 1.5 验证步骤

### 运行测试

```bash
cd my_agent
bun run src/index.ts
```

**预期输出**:
```
Hello, AI Agent!
Args: []
```

```bash
bun run src/index.ts --foo bar
```

**预期输出**:
```
Hello, AI Agent!
Args: [ "--foo", "bar" ]
```

## 1.6 完整目录结构

```
my_agent/
├── package.json
├── tsconfig.json
├── src/
│   └── index.ts           # 入口文件
├── docs/
│   ├── 01_mvp_plan.md     # 总体计划
│   └── 02_step1_project_structure.md  # 本文档
└── README.md              # 项目说明
```

## 关键知识点

### 1. ESM vs CommonJS

```typescript
// ESM (ES Modules) - 我们的选择
import { readFile } from 'fs/promises';
export function hello() {}

// CommonJS - 传统方式
const fs = require('fs/promises');
module.exports = { hello };
```

**ESM 优势**:
- 静态分析更好（tree shaking）
- 异步加载更自然
- 未来标准

### 2. Bun 的特殊性

Bun 支持：
- 内置 TypeScript，无需构建
- `bun-types` 提供全局类型
- `.env` 文件自动加载

```typescript
// Bun 自动加载 .env
// ANTHROPIC_API_KEY=sk-xxx
console.log(process.env.ANTHROPIC_API_KEY);
```

## 下一步

继续 [Step 2: 实现 CLI 入口和 REPL 循环](./03_step2_repl_implementation.md)
