import type { Tool } from '../types/index.js';

/**
 * 工具链节点接口
 * 表示工具链中的单个执行节点
 */
export interface ToolChainNode {
  /** 节点唯一标识 */
  id: string;
  /** 要执行的工具 */
  tool: Tool;
  /** 执行条件（返回 true 时才执行） */
  condition?: (input: Record<string, unknown>) => boolean;
  /** 依赖节点 ID 列表（只有这些节点都成功后才执行） */
  dependsOn?: string[];
  /** 重试配置 */
  retry?: {
    /** 最大重试次数 */
    maxAttempts: number;
    /** 每次重试的等待时间（毫秒） */
    backoffMs: number;
  };
}

/**
 * 工具链接口
 * 定义一个完整的工具链
 */
export interface ToolChain {
  /** 工具链唯一标识 */
  id: string;
  /** 工具链名称 */
  name: string;
  /** 工具链描述 */
  description: string;
  /** 节点列表 */
  nodes: ToolChainNode[];
  /** 是否并行执行（默认 false 顺序执行） */
  parallel?: boolean;
}

/**
 * 工具链执行结果
 */
export interface ToolChainResult {
  /** 工具链 ID */
  chainId: string;
  /** 是否全部成功 */
  success: boolean;
  /** 各个节点的执行结果 */
  results: Map<string, {
    /** 是否成功 */
    success: boolean;
    /** 成功时的输出 */
    output?: string;
    /** 失败时的错误信息 */
    error?: string;
    /** 执行耗时（毫秒） */
    duration: number;
  }>;
  /** 总执行耗时（毫秒） */
  totalDuration: number;
}

/**
 * 条件工具接口
 * 根据条件动态选择工具
 */
export interface ConditionalTool {
  /** 工具实例 */
  tool: Tool;
  /** 匹配条件 */
  condition: (input: Record<string, unknown>) => boolean;
  /** 工具描述 */
  description: string;
}

/**
 * 工具链执行器
 *
 * 核心职责：
 * - 注册和管理工具链
 * - 按顺序或并行执行工具链
 * - 处理节点间的依赖关系
 * - 支持条件执行和重试机制
 *
 * 使用流程：
 * 1. 创建 ToolChainExecutor 实例
 * 2. 使用 registerChain() 注册工具链
 * 3. 使用 executeChain() 执行工具链
 */
export class ToolChainExecutor {
  /** 存储已注册的工具链 */
  private chains: Map<string, ToolChain> = new Map();

  /**
   * 注册工具链
   *
   * @param chain - 要注册的工具链
   */
  registerChain(chain: ToolChain): void {
    this.chains.set(chain.id, chain);
  }

  /**
   * 获取指定工具链
   *
   * @param chainId - 工具链 ID
   * @returns 工具链或 undefined
   */
  getChain(chainId: string): ToolChain | undefined {
    return this.chains.get(chainId);
  }

  /**
   * 列出所有已注册的工具链
   *
   * @returns 工具链数组
   */
  listChains(): ToolChain[] {
    return Array.from(this.chains.values());
  }

  /**
   * 执行工具链
   *
   * 根据工具链配置选择顺序或并行执行
   *
   * @param chainId - 工具链 ID
   * @param initialInput - 初始输入参数
   * @param executeTool - 实际执行工具的回调函数
   * @returns 执行结果
   */
  async executeChain(
    chainId: string,
    initialInput: Record<string, unknown>,
    executeTool: (tool: Tool, input: Record<string, unknown>) => Promise<string>
  ): Promise<ToolChainResult> {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Chain not found: ${chainId}`);
    }

    const startTime = Date.now();
    const results = new Map<string, {
      success: boolean;
      output?: string;
      error?: string;
      duration: number;
    }>();

    // 根据配置选择执行方式
    if (chain.parallel) {
      await this.executeParallel(chain, initialInput, results, executeTool);
    } else {
      await this.executeSequential(chain, initialInput, results, executeTool);
    }

    // 检查是否全部成功
    const allSuccess = Array.from(results.values()).every((r) => r.success);

    return {
      chainId,
      success: allSuccess,
      results,
      totalDuration: Date.now() - startTime,
    };
  }

  /**
   * 顺序执行工具链
   *
   * 按节点顺序依次执行，每个节点等待前一个完成
   *
   * @param chain - 工具链
   * @param initialInput - 初始输入
   * @param results - 结果存储
   * @param executeTool - 执行回调
   */
  private async executeSequential(
    chain: ToolChain,
    initialInput: Record<string, unknown>,
    results: Map<string, { success: boolean; output?: string; error?: string; duration: number }>,
    executeTool: (tool: Tool, input: Record<string, unknown>) => Promise<string>
  ): Promise<void> {
    // 上下文对象，存储中间结果供后续节点使用
    const context = { ...initialInput };

    for (const node of chain.nodes) {
      const nodeStart = Date.now();

      // 1. 检查依赖是否满足
      if (!this.checkDependencies(node, results)) {
        results.set(node.id, {
          success: false,
          error: 'Dependencies not met',
          duration: Date.now() - nodeStart,
        });
        continue;
      }

      // 2. 检查执行条件
      if (node.condition && !node.condition(context)) {
        results.set(node.id, {
          success: true,
          output: 'Skipped: condition not met',
          duration: Date.now() - nodeStart,
        });
        continue;
      }

      // 3. 构建输入参数（合并依赖节点的输出）
      const input = this.buildInput(node, context, results);

      // 4. 执行工具（带重试）
      const output = await this.executeWithRetry(node, input, executeTool);

      // 5. 保存输出到上下文
      context[`${node.id}_output`] = output;

      // 6. 尝试解析 JSON 输出并合并到上下文
      if (output) {
        try {
          const parsed = JSON.parse(output);
          Object.assign(context, parsed);
        } catch {
          // 非 JSON 输出，只保存为上下文
        }
      }

      results.set(node.id, {
        success: true,
        output,
        duration: Date.now() - nodeStart,
      });
    }
  }

  /**
   * 并行执行工具链
   *
   * 所有无依赖或依赖已满足的节点同时执行
   *
   * @param chain - 工具链
   * @param initialInput - 初始输入
   * @param results - 结果存储
   * @param executeTool - 执行回调
   */
  private async executeParallel(
    chain: ToolChain,
    initialInput: Record<string, unknown>,
    results: Map<string, { success: boolean; output?: string; error?: string; duration: number }>,
    executeTool: (tool: Tool, input: Record<string, unknown>) => Promise<string>
  ): Promise<void> {
    // 筛选出可以立即执行的节点（无条件或条件满足）
    const readyNodes = chain.nodes.filter((node) => {
      if (!node.condition) return true;
      return node.condition(initialInput);
    });

    // 并行执行所有就绪节点
    const promises = readyNodes.map(async (node) => {
      const nodeStart = Date.now();
      try {
        const input = this.buildInput(node, initialInput, results);
        const output = await this.executeWithRetry(node, input, executeTool);
        results.set(node.id, {
          success: true,
          output,
          duration: Date.now() - nodeStart,
        });
      } catch (error) {
        results.set(node.id, {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - nodeStart,
        });
      }
    });

    await Promise.all(promises);
  }

  /**
   * 检查依赖是否满足
   *
   * 所有依赖节点都必须成功执行才算满足
   *
   * @param node - 当前节点
   * @param results - 已执行节点的结果
   * @returns 是否满足依赖
   */
  private checkDependencies(
    node: ToolChainNode,
    results: Map<string, { success: boolean }>
  ): boolean {
    if (!node.dependsOn || node.dependsOn.length === 0) {
      return true;
    }

    return node.dependsOn.every((depId) => {
      const result = results.get(depId);
      return result && result.success;
    });
  }

  /**
   * 构建节点的输入参数
   *
   * 从上下文中提取节点需要的参数，并注入依赖节点的输出
   *
   * @param node - 当前节点
   * @param context - 执行上下文
   * @param results - 已执行节点的结果
   * @returns 节点输入参数
   */
  private buildInput(
    node: ToolChainNode,
    context: Record<string, unknown>,
    results: Map<string, { output?: string }>
  ): Record<string, unknown> {
    const input: Record<string, unknown> = {};

    // 从上下文提取节点 Schema 中定义的参数
    for (const key of Object.keys(node.tool.inputSchema.properties || {})) {
      if (context[key] !== undefined) {
        input[key] = context[key];
      }
    }

    // 注入依赖节点的输出
    if (node.dependsOn) {
      for (const depId of node.dependsOn) {
        const depResult = results.get(depId);
        if (depResult?.output) {
          input[`${depId}_result`] = depResult.output;
        }
      }
    }

    return input;
  }

  /**
   * 带重试的执行
   *
   * 如果指定了重试次数，失败后会等待一段时间后重试
   * 等待时间 = backoffMs * attempt（指数退避）
   *
   * @param node - 节点
   * @param input - 输入参数
   * @param executeTool - 执行回调
   * @returns 工具输出
   */
  private async executeWithRetry(
    node: ToolChainNode,
    input: Record<string, unknown>,
    executeTool: (tool: Tool, input: Record<string, unknown>) => Promise<string>
  ): Promise<string> {
    const maxAttempts = node.retry?.maxAttempts || 1;
    const backoffMs = node.retry?.backoffMs || 1000;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await executeTool(node.tool, input);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 如果还有重试机会，等待后重试
        if (attempt < maxAttempts) {
          await this.delay(backoffMs * attempt);
        }
      }
    }

    throw lastError;
  }

  /**
   * 等待指定时间
   *
   * @param ms - 毫秒
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 从工具序列创建工具链
   *
   * 便捷方法，自动设置依赖关系（每个工具依赖前一个）
   *
   * @param name - 工具链名称
   * @param description - 工具链描述
   * @param tools - 工具列表（按执行顺序）
   * @param options - 可选配置（并行、重试）
   * @returns 创建的工具链
   */
  createChainFromSequence(
    name: string,
    description: string,
    tools: Tool[],
    options?: {
      parallel?: boolean;
      retry?: { maxAttempts: number; backoffMs: number };
    }
  ): ToolChain {
    const nodes: ToolChainNode[] = tools.map((tool, index) => ({
      id: `node-${index}-${tool.name}`,
      tool,
      // 除第一个外，每个节点依赖前一个
      dependsOn: index > 0 ? [`node-${index - 1}-${tools[index - 1].name}`] : undefined,
      retry: options?.retry,
    }));

    return {
      id: `chain-${Date.now()}`,
      name,
      description,
      nodes,
      parallel: options?.parallel,
    };
  }
}

/**
 * 条件工具执行器
 *
 * 根据输入条件动态选择要执行的工具
 * 适用于需要根据上下文决定使用哪个工具的场景
 */
export class ConditionalToolExecutor {
  /** 已注册的条件工具列表 */
  private conditions: ConditionalTool[] = [];

  /**
   * 注册条件工具
   *
   * @param tool - 工具实例
   * @param condition - 匹配条件
   * @param description - 描述
   */
  register(tool: Tool, condition: (input: Record<string, unknown>) => boolean, description: string): void {
    this.conditions.push({ tool, condition, description });
  }

  /**
   * 查找匹配的工具
   *
   * 返回第一个匹配条件的工具
   *
   * @param input - 输入参数
   * @returns 匹配的工具或 undefined
   */
  findMatchingTool(input: Record<string, unknown>): Tool | undefined {
    for (const ct of this.conditions) {
      if (ct.condition(input)) {
        return ct.tool;
      }
    }
    return undefined;
  }

  /**
   * 列出所有已注册的条件
   *
   * @returns 条件和工具的对应列表
   */
  listConditions(): Array<{ tool: string; description: string }> {
    return this.conditions.map((ct) => ({
      tool: ct.tool.name,
      description: ct.description,
    }));
  }
}

/**
 * 工具链执行器单例
 */
export const toolChainExecutor = new ToolChainExecutor();

/**
 * 条件工具执行器单例
 */
export const conditionalToolExecutor = new ConditionalToolExecutor();
