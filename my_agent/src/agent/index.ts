/**
 * Agent 自主模式模块导出
 *
 * 提供 Agent 自动连续执行多步任务的能力
 */

// 类型定义
export * from './types.js';

// 任务分解器
export { TaskDecomposer } from './decomposer.js';

// 执行计划器
export { ExecutionPlanner } from './planner.js';

// 自主执行引擎
export { AutoExecuteEngine } from './engine.js';

// 自主执行器
export { AutoExecutor, createAutoExecutor } from './auto-executor.js';
export type { AutoExecutorOptions, PlanApprovalCallback } from './auto-executor.js';
