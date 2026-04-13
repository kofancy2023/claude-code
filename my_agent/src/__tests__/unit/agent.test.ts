/**
 * Agent 自主模式单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionPlanner } from '../../agent/planner.js';
import { AutoExecuteEngine } from '../../agent/engine.js';
import type { ExecutionPlan, SubTask, TaskStatus } from '../../agent/types.js';
import { TaskStatus as TS, TaskPriority } from '../../agent/types.js';

describe('ExecutionPlanner', () => {
  let planner: ExecutionPlanner;

  beforeEach(() => {
    planner = new ExecutionPlanner();
  });

  describe('generatePlan', () => {
    it('should generate a plan from decomposition result', () => {
      const decomposition = {
        success: true,
        tasks: [
          {
            description: 'Search for TODO comments',
            tool: { name: 'GrepTool', description: '', inputSchema: { type: 'object', properties: {} }, execute: async () => '' },
            input: { pattern: 'TODO' },
            priority: TaskPriority.Normal,
            dependencies: [],
          },
          {
            description: 'Write results to file',
            tool: { name: 'WriteTool', description: '', inputSchema: { type: 'object', properties: {} }, execute: async () => '' },
            input: { path: 'report.md' },
            priority: TaskPriority.Normal,
            dependencies: [],
          },
        ],
        reasoning: 'Simple two-step task',
        estimatedSteps: 2,
      };

      const plan = planner.generatePlan(decomposition, 'Find all TODOs');

      expect(plan.originalQuery).toBe('Find all TODOs');
      expect(plan.tasks).toHaveLength(2);
      expect(plan.tasks[0].id).toBe('task-1');
      expect(plan.tasks[1].id).toBe('task-2');
      expect(plan.status).toBe('planning');
    });

    it('should respect task dependencies', () => {
      const decomposition = {
        success: true,
        tasks: [
          {
            description: 'Task A',
            tool: { name: 'ToolA', description: '', inputSchema: { type: 'object', properties: {} }, execute: async () => '' },
            input: {},
            priority: TaskPriority.Normal,
            dependencies: [],
          },
          {
            description: 'Task B depends on A',
            tool: { name: 'ToolB', description: '', inputSchema: { type: 'object', properties: {} }, execute: async () => '' },
            input: {},
            priority: TaskPriority.Normal,
            dependencies: ['task-1'],
          },
        ],
        reasoning: '',
        estimatedSteps: 2,
      };

      const plan = planner.generatePlan(decomposition, '');

      expect(plan.tasks[0].dependencies).toEqual([]);
      expect(plan.tasks[1].dependencies).toEqual(['task-1']);
    });
  });

  describe('topologicalSort', () => {
    it('should sort tasks by dependencies', () => {
      const tasks: SubTask[] = [
        {
          id: 'task-1',
          description: 'First',
          tool: { name: 'Tool', description: '', inputSchema: { type: 'object', properties: {} }, execute: async () => '' },
          input: {},
          priority: TaskPriority.Normal,
          dependencies: [],
          status: TS.Pending,
          retryCount: 0,
          maxRetries: 3,
        },
        {
          id: 'task-2',
          description: 'Second',
          tool: { name: 'Tool', description: '', inputSchema: { type: 'object', properties: {} }, execute: async () => '' },
          input: {},
          priority: TaskPriority.Normal,
          dependencies: ['task-1'],
          status: TS.Pending,
          retryCount: 0,
          maxRetries: 3,
        },
      ];

      const result = planner.generatePlan({ success: true, tasks, reasoning: '', estimatedSteps: 2 }, '');

      expect(result.tasks[0].id).toBe('task-1');
      expect(result.tasks[1].id).toBe('task-2');
    });
  });

  describe('getNextExecutableTasks', () => {
    it('should return tasks with no pending dependencies', () => {
      const plan = planner.generatePlan({
        success: true,
        tasks: [
          {
            description: 'Task 1',
            tool: { name: 'Tool', description: '', inputSchema: { type: 'object', properties: {} }, execute: async () => '' },
            input: {},
            priority: TaskPriority.Normal,
            dependencies: [],
          },
          {
            description: 'Task 2',
            tool: { name: 'Tool', description: '', inputSchema: { type: 'object', properties: {} }, execute: async () => '' },
            input: {},
            priority: TaskPriority.Normal,
            dependencies: [],
          },
        ],
        reasoning: '',
        estimatedSteps: 2,
      }, '');

      const next = planner.getNextExecutableTasks(plan);

      expect(next).toHaveLength(2);
    });

    it('should not return tasks with unfinished dependencies', () => {
      const plan = planner.generatePlan({
        success: true,
        tasks: [
          {
            description: 'Task 1',
            tool: { name: 'Tool', description: '', inputSchema: { type: 'object', properties: {} }, execute: async () => '' },
            input: {},
            priority: TaskPriority.Normal,
            dependencies: [],
          },
          {
            description: 'Task 2',
            tool: { name: 'Tool', description: '', inputSchema: { type: 'object', properties: {} }, execute: async () => '' },
            input: {},
            priority: TaskPriority.Normal,
            dependencies: ['task-1'],
          },
        ],
        reasoning: '',
        estimatedSteps: 2,
      }, '');

      plan.tasks[0].status = TS.Running;

      const next = planner.getNextExecutableTasks(plan);

      expect(next).toHaveLength(0);
    });
  });

  describe('getProgress', () => {
    it('should return correct progress', () => {
      const plan = planner.generatePlan({
        success: true,
        tasks: [
          {
            description: 'Task 1',
            tool: { name: 'Tool', description: '', inputSchema: { type: 'object', properties: {} }, execute: async () => '' },
            input: {},
            priority: TaskPriority.Normal,
            dependencies: [],
          },
          {
            description: 'Task 2',
            tool: { name: 'Tool', description: '', inputSchema: { type: 'object', properties: {} }, execute: async () => '' },
            input: {},
            priority: TaskPriority.Normal,
            dependencies: [],
          },
        ],
        reasoning: '',
        estimatedSteps: 2,
      }, '');

      plan.tasks[0].status = TS.Completed;

      const progress = planner.getProgress(plan);

      expect(progress.completed).toBe(1);
      expect(progress.total).toBe(2);
      expect(progress.percentage).toBe(50);
    });
  });

  describe('validatePlan', () => {
    it('should validate a valid plan', () => {
      const plan = planner.generatePlan({
        success: true,
        tasks: [
          {
            description: 'Task 1',
            tool: { name: 'Tool', description: '', inputSchema: { type: 'object', properties: {} }, execute: async () => '' },
            input: {},
            priority: TaskPriority.Normal,
            dependencies: [],
          },
        ],
        reasoning: '',
        estimatedSteps: 1,
      }, '');

      const result = planner.validatePlan(plan);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty plan', () => {
      const plan = planner.generatePlan({
        success: true,
        tasks: [],
        reasoning: '',
        estimatedSteps: 0,
      }, '');

      const result = planner.validatePlan(plan);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Plan has no tasks');
    });
  });
});

describe('AutoExecuteEngine', () => {
  let engine: AutoExecuteEngine;
  let mockExecuteFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    engine = new AutoExecuteEngine({ taskTimeout: 5000, maxTotalTimeout: 30000 });
    mockExecuteFn = vi.fn();
  });

  afterEach(() => {
    if (engine.getIsRunning()) {
      engine.cancel();
    }
  });

  describe('execute', () => {
    it('should execute all tasks successfully', async () => {
      const plan: ExecutionPlan = {
        id: 'test-plan',
        originalQuery: 'Test',
        tasks: [
          {
            id: 'task-1',
            description: 'Task 1',
            tool: { name: 'Tool1', description: '', inputSchema: { type: 'object', properties: {} }, execute: async () => '' },
            input: {},
            priority: TaskPriority.Normal,
            dependencies: [],
            status: TS.Pending,
            retryCount: 0,
            maxRetries: 3,
          },
          {
            id: 'task-2',
            description: 'Task 2',
            tool: { name: 'Tool2', description: '', inputSchema: { type: 'object', properties: {} }, execute: async () => '' },
            input: {},
            priority: TaskPriority.Normal,
            dependencies: [],
            status: TS.Pending,
            retryCount: 0,
            maxRetries: 3,
          },
        ],
        createdAt: Date.now(),
        status: 'planning',
      };

      mockExecuteFn.mockResolvedValue('result');

      const result = await engine.execute(plan, mockExecuteFn);

      expect(result.success).toBe(true);
      expect(result.completedTasks).toBe(2);
      expect(result.failedTasks).toBe(0);
      expect(mockExecuteFn).toHaveBeenCalledTimes(2);
    });

    it('should handle task failure', async () => {
      const plan: ExecutionPlan = {
        id: 'test-plan',
        originalQuery: 'Test',
        tasks: [
          {
            id: 'task-1',
            description: 'Task 1',
            tool: { name: 'Tool1', description: '', inputSchema: { type: 'object', properties: {} }, execute: async () => '' },
            input: {},
            priority: TaskPriority.Normal,
            dependencies: [],
            status: TS.Pending,
            retryCount: 0,
            maxRetries: 0,
          },
        ],
        createdAt: Date.now(),
        status: 'planning',
      };

      mockExecuteFn.mockRejectedValue(new Error('Task failed'));

      const result = await engine.execute(plan, mockExecuteFn);

      expect(result.success).toBe(false);
      expect(result.failedTasks).toBe(1);
    });
  });

  describe('events', () => {
    it('should emit task_started and task_completed events', async () => {
      const plan: ExecutionPlan = {
        id: 'test-plan',
        originalQuery: 'Test',
        tasks: [
          {
            id: 'task-1',
            description: 'Task 1',
            tool: { name: 'Tool1', description: '', inputSchema: { type: 'object', properties: {} }, execute: async () => '' },
            input: {},
            priority: TaskPriority.Normal,
            dependencies: [],
            status: TS.Pending,
            retryCount: 0,
            maxRetries: 3,
          },
        ],
        createdAt: Date.now(),
        status: 'planning',
      };

      const events: string[] = [];

      engine.addListener((event) => {
        events.push(event.type);
      });

      mockExecuteFn.mockResolvedValue('result');

      await engine.execute(plan, mockExecuteFn);

      expect(events).toContain('task_started');
      expect(events).toContain('task_completed');
      expect(events).toContain('plan_started');
      expect(events).toContain('plan_completed');
    });
  });

  describe('cancel', () => {
    it('should cancel running execution', async () => {
      const plan: ExecutionPlan = {
        id: 'test-plan',
        originalQuery: 'Test',
        tasks: [
          {
            id: 'task-1',
            description: 'Task 1',
            tool: { name: 'Tool1', description: '', inputSchema: { type: 'object', properties: {} }, execute: async () => '' },
            input: {},
            priority: TaskPriority.Normal,
            dependencies: [],
            status: TS.Pending,
            retryCount: 0,
            maxRetries: 3,
          },
        ],
        createdAt: Date.now(),
        status: 'planning',
      };

      mockExecuteFn.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 1000));
        return 'result';
      });

      const executePromise = engine.execute(plan, mockExecuteFn);

      engine.cancel();

      const result = await executePromise;

      expect(result.success).toBe(false);
    });
  });
});
