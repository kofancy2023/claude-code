/**
 * Agent 自主模式类型定义
 *
 * 支持 Agent 自动连续执行多步任务，减少用户交互
 */

import type { Tool } from '../types/index.js';

/**
 * 任务状态
 */
export enum TaskStatus {
  /** 等待执行 */
  Pending = 'pending',

  /** 执行中 */
  Running = 'running',

  /** 已完成 */
  Completed = 'completed',

  /** 执行失败 */
  Failed = 'failed',

  /** 已取消 */
  Cancelled = 'cancelled',

  /** 等待依赖完成 */
  WaitingForDeps = 'waiting_for_deps',
}

/**
 * 任务优先级
 */
export enum TaskPriority {
  Low = 0,
  Normal = 1,
  High = 2,
  Critical = 3,
}

/**
 * 子任务定义
 */
export interface SubTask {
  /** 任务唯一 ID */
  id: string;

  /** 任务描述 */
  description: string;

  /** 任务状态 */
  status: TaskStatus;

  /** 使用的工具 */
  tool: Tool;

  /** 工具输入参数 */
  input: Record<string, unknown>;

  /** 任务优先级 */
  priority: TaskPriority;

  /** 依赖的任务 ID 列表 */
  dependencies: string[];

  /** 执行结果 */
  result?: string;

  /** 错误信息 */
  error?: string;

  /** 开始时间 */
  startTime?: number;

  /** 结束时间 */
  endTime?: number;

  /** 重试次数 */
  retryCount: number;

  /** 最大重试次数 */
  maxRetries: number;
}

/**
 * 执行计划
 */
export interface ExecutionPlan {
  /** 计划 ID */
  id: string;

  /** 原始用户请求 */
  originalQuery: string;

  /** 任务列表 */
  tasks: SubTask[];

  /** 计划创建时间 */
  createdAt: number;

  /** 计划状态 */
  status: 'planning' | 'executing' | 'completed' | 'failed' | 'cancelled';

  /** 预估完成时间 (毫秒) */
  estimatedDuration?: number;
}

/**
 * 任务分解结果
 */
export interface DecompositionResult {
  /** 是否成功分解 */
  success: boolean;

  /** 子任务列表 */
  tasks: Omit<SubTask, 'id' | 'status' | 'result' | 'error' | 'startTime' | 'endTime' | 'retryCount'>[];

  /** 分解理由 */
  reasoning: string;

  /** 预估步骤数 */
  estimatedSteps: number;

  /** 错误信息 (如果失败) */
  error?: string;
}

/**
 * 执行配置
 */
export interface AutoExecuteConfig {
  /** 是否启用自动执行模式 */
  enabled: boolean;

  /** 最大并发任务数 */
  maxConcurrentTasks: number;

  /** 单任务超时时间 (毫秒) */
  taskTimeout: number;

  /** 最大总执行时间 (毫秒) */
  maxTotalTimeout: number;

  /** 是否显示执行进度 */
  showProgress: boolean;

  /** 是否需要用户确认执行计划 */
  requirePlanApproval: boolean;

  /** 自动取消无响应任务 */
  autoCancelStale: boolean;

  /** 无响应超时时间 (毫秒) */
  staleTimeout: number;

  /** 执行失败时最大重试次数 */
  maxRetries: number;
}

/**
 * 默认配置
 */
export const DEFAULT_AUTO_EXECUTE_CONFIG: AutoExecuteConfig = {
  enabled: false,
  maxConcurrentTasks: 3,
  taskTimeout: 60000,
  maxTotalTimeout: 300000,
  showProgress: true,
  requirePlanApproval: true,
  autoCancelStale: true,
  staleTimeout: 120000,
  maxRetries: 2,
};

/**
 * 执行事件
 */
export interface ExecutionEvent {
  /** 事件类型 */
  type:
    | 'task_started'
    | 'task_completed'
    | 'task_failed'
    | 'task_cancelled'
    | 'plan_started'
    | 'plan_completed'
    | 'plan_failed'
    | 'plan_cancelled'
    | 'progress_update';

  /** 计划 ID */
  planId?: string;

  /** 任务 ID */
  taskId?: string;

  /** 事件数据 */
  data?: unknown;

  /** 时间戳 */
  timestamp: number;
}

/**
 * 执行监听器
 */
export type ExecutionListener = (event: ExecutionEvent) => void | Promise<void>;

/**
 * 执行结果
 */
export interface ExecutionResult {
  /** 是否成功 */
  success: boolean;

  /** 计划 ID */
  planId: string;

  /** 完成的任务数 */
  completedTasks: number;

  /** 失败的任务数 */
  failedTasks: number;

  /** 总执行时间 (毫秒) */
  totalDuration: number;

  /** 执行摘要 */
  summary: string;

  /** 详细结果 */
  results: Array<{
    taskId: string;
    description: string;
    status: TaskStatus;
    result?: string;
    error?: string;
    duration: number;
  }>;
}

/**
 * 任务分解提示词
 */
export const TASK_DECOMPOSITION_PROMPT = `你是一个任务分解专家。当用户描述一个复杂任务时，你需要将其分解为多个简单的子任务。

规则：
1. 每个子任务应该只使用一个工具
2. 考虑任务之间的依赖关系
3. 子任务数量控制在 2-10 个之间
4. 每个子任务描述要清晰明确

请按以下格式分解任务：

任务分解：
1. [子任务1描述] - 使用 [工具名]
2. [子任务2描述] - 使用 [工具名]
...

预估步骤数：[数字]

分解理由：[简要说明为什么要这样分解]`;
