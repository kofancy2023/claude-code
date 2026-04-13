/**
 * 任务分解器
 *
 * 负责将复杂用户查询分解为可执行的子任务
 */

import type { AIProvider } from '../services/api/types.js';
import type { Tool } from '../types/index.js';
import type { DecompositionResult, SubTask } from './types.js';
import { TASK_DECOMPOSITION_PROMPT, TaskPriority } from './types.js';

/**
 * 任务分解器配置
 */
export interface TaskDecomposerOptions {
  /** AI 提供者 */
  aiProvider: AIProvider;

  /** 可用工具列表 */
  availableTools: Tool[];

  /** 最大子任务数量 */
  maxSubTasks?: number;

  /** 是否使用流式输出 */
  stream?: boolean;
}

/**
 * 解析分解结果的响应
 */
interface ParsedTask {
  description: string;
  toolName: string;
  input: Record<string, unknown>;
  priority: TaskPriority;
  dependencies: string[];
}

/**
 * 任务分解器
 *
 * 使用 AI 将复杂任务分解为可执行的子任务序列
 */
export class TaskDecomposer {
  private aiProvider: AIProvider;
  private availableTools: Tool[];
  private maxSubTasks: number;
  private stream: boolean;

  constructor(options: TaskDecomposerOptions) {
    this.aiProvider = options.aiProvider;
    this.availableTools = options.availableTools;
    this.maxSubTasks = options.maxSubTasks || 10;
    this.stream = options.stream ?? false;
  }

  /**
   * 分解用户查询为子任务
   */
  async decompose(userQuery: string): Promise<DecompositionResult> {
    try {
      const toolsDescription = this.getToolsDescription();

      const decompositionPrompt = `${TASK_DECOMPOSITION_PROMPT}

可用工具：
${toolsDescription}

用户任务：${userQuery}`;

      const response = await this.aiProvider.sendMessage(
        [{ role: 'user', content: decompositionPrompt }],
        undefined,
        {}
      );

      const content = response.text || '';
      const parsed = this.parseDecomposition(content);

      if (!parsed.success) {
        return {
          success: false,
          tasks: [],
          reasoning: '',
          estimatedSteps: 0,
          error: parsed.error || 'Failed to parse decomposition result',
        };
      }

      const tasks = this.convertToSubTasks(parsed.tasks);

      return {
        success: true,
        tasks,
        reasoning: parsed.reasoning,
        estimatedSteps: tasks.length,
      };
    } catch (error) {
      return {
        success: false,
        tasks: [],
        reasoning: '',
        estimatedSteps: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取工具描述
   */
  private getToolsDescription(): string {
    return this.availableTools
      .map((tool) => `- ${tool.name}: ${tool.description}`)
      .join('\n');
  }

  /**
   * 解析 AI 返回的分解结果
   */
  private parseDecomposition(
    content: string
  ): { success: boolean; tasks: ParsedTask[]; reasoning: string; error?: string } {
    try {
      const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);

      const tasks: ParsedTask[] = [];
      let reasoning = '';
      let inReasoning = false;

      for (const line of lines) {
        if (line.toLowerCase().startsWith('分解理由：') || line.toLowerCase().startsWith('理由：')) {
          inReasoning = true;
          reasoning = line.substring(line.indexOf('：') + 1).trim();
          continue;
        }

        if (line.toLowerCase().startsWith('预估步骤数：') || line.toLowerCase().startsWith('步骤数：')) {
          inReasoning = false;
          continue;
        }

        if (inReasoning) {
          reasoning += ' ' + line;
          continue;
        }

        const taskMatch = line.match(/^\d+[\.\、\)]?\s*(.+?)\s*[-–]\s*使用\s+(\w+)/);
        if (taskMatch) {
          const [, description, toolName] = taskMatch;
          const tool = this.availableTools.find((t) => t.name === toolName);

          if (tool) {
            tasks.push({
              description: description.trim(),
              toolName: tool.name,
              input: {},
              priority: TaskPriority.Normal,
              dependencies: [],
            });
          }
        }
      }

      if (tasks.length === 0) {
        return {
          success: false,
          tasks: [],
          reasoning: '',
          error: 'No valid tasks found in response',
        };
      }

      return {
        success: true,
        tasks,
        reasoning: reasoning.trim(),
      };
    } catch (error) {
      return {
        success: false,
        tasks: [],
        reasoning: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 转换解析结果为子任务
   */
  private convertToSubTasks(
    parsedTasks: ParsedTask[]
  ): SubTask[] {
    return parsedTasks.slice(0, this.maxSubTasks).map((task, index) => {
      const tool = this.availableTools.find((t) => t.name === task.toolName);

      return {
        id: `task-${index + 1}`,
        description: task.description,
        tool: tool!,
        input: this.extractInputFromDescription(task.description, tool),
        priority: task.priority,
        dependencies: task.dependencies,
        status: 'pending',
        retryCount: 0,
        maxRetries: 3,
      };
    });
  }

  /**
   * 从描述中提取工具输入参数
   * 这是一个简化实现，实际可以使用 AI 来提取
   */
  private extractInputFromDescription(
    description: string,
    tool?: Tool
  ): Record<string, unknown> {
    if (!tool) return {};

    const input: Record<string, unknown> = {};

    if (tool.name.includes('Read') || tool.name.includes('File')) {
      const pathMatch = description.match(/[`"']([^`"']+)[`"']/);
      if (pathMatch) {
        input.path = pathMatch[1];
      }
    }

    if (tool.name.includes('Write') || tool.name.includes('Create')) {
      const pathMatch = description.match(/[`"']([^`"']+)[`"']/);
      const contentMatch = description.match(/内容[是为：]\s*["']([^"']+)["']/);
      if (pathMatch) input.path = pathMatch[1];
      if (contentMatch) input.content = contentMatch[1];
    }

    if (tool.name.includes('Search') || tool.name.includes('Grep')) {
      const patternMatch = description.match(/搜索[到为]?\s*["']([^"']+)["']/);
      if (patternMatch) input.pattern = patternMatch[1];
    }

    return input;
  }

  /**
   * 验证分解结果
   */
  validateDecomposition(result: DecompositionResult): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!result.success) {
      errors.push(result.error || 'Decomposition failed');
      return { valid: false, errors };
    }

    if (result.tasks.length === 0) {
      errors.push('No tasks generated');
    }

    if (result.tasks.length > this.maxSubTasks) {
      errors.push(`Too many tasks: ${result.tasks.length} (max: ${this.maxSubTasks})`);
    }

    for (const task of result.tasks) {
      if (!task.tool) {
        errors.push(`Task "${task.description}" has no valid tool`);
      }

      const hasDeps = task.dependencies && task.dependencies.length > 0;
      if (hasDeps) {
        const depIds = task.dependencies;
        const allTaskIds = result.tasks.map((_, i) => `task-${i + 1}`);

        for (const depId of depIds) {
          if (!allTaskIds.includes(depId) && depId !== 'none') {
            errors.push(`Task "${task.description}" has invalid dependency: ${depId}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
