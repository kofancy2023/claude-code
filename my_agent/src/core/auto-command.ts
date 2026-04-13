/**
 * 自动执行命令
 *
 * 提供 /auto 命令启用自主执行模式
 */

import { createAutoExecutor } from '../agent/index.js';
import type { AIProvider } from '../services/api/types.js';
import type { CommandContext } from './commands.js';
import { terminal } from '../ui/terminal.js';

/**
 * 创建自动执行命令
 */
export function createAutoCommand(client: AIProvider) {
  return {
    name: 'auto',

    description: '启用自动执行模式，AI 将自动分解并执行复杂任务',

    usage: '/auto <task description>',

    execute: async (args: string[], context: CommandContext): Promise<void> => {
      if (args.length === 0) {
        console.log('用法: /auto <任务描述>');
        console.log('示例: /auto 帮我把所有 TODO 找出来并生成报告');
        return;
      }

      const taskDescription = args.join(' ');
      console.log(`正在分析任务: ${taskDescription}`);

      try {
        const executor = createAutoExecutor({
          aiProvider: client,
          config: {
            enabled: true,
            showProgress: true,
            requirePlanApproval: true,
          },
        });

        executor.onProgress((progress) => {
          console.log(`[${progress.completed}/${progress.total}] ${progress.percentage}%`);
        });

        executor.setApprovalCallback(async (plan) => {
          console.log('\n执行计划:');
          for (let i = 0; i < plan.tasks.length; i++) {
            const task = plan.tasks[i];
            console.log(`  ${i + 1}. ${task.description} (${task.tool.name})`);
          }

          return true;  // 自动执行，无需确认
        });

        console.log(terminal.renderInfo('\n开始自动执行...\n'));

        const result = await executor.execute(taskDescription);

        if (result.success) {
          console.log(terminal.renderSuccess(`\n执行成功! ${result.summary}`));
        } else {
          console.log(terminal.renderError(`\n执行失败: ${result.summary}`));
        }

        if (result.results.length > 0) {
          console.log('\n执行详情:');
          for (const r of result.results) {
            const icon = r.status === 'completed' ? '✓' : r.status === 'failed' ? '✗' : '-';
            console.log(`  ${icon} ${r.description}: ${r.status}`);
            if (r.error) {
              console.log(`    错误: ${r.error}`);
            }
          }
        }
      } catch (error) {
        console.log(terminal.renderError(`\n执行出错: ${error instanceof Error ? error.message : String(error)}`));
      }
    },
  };
}
