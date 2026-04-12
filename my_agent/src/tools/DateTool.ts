import type { Tool } from '../types/index.js';

/**
 * 日期时间工具
 *
 * 获取当前的日期和时间信息
 *
 * 功能：
 * - 获取当前日期（YYYY-MM-DD 格式）
 * - 获取当前时间（HH:MM:SS 格式）
 * - 支持不同时区
 * - 返回星期和月份名称
 */
export const DateTool: Tool = {
  /** 工具名称 */
  name: 'DateTool',
  /** 工具描述 */
  description: 'Get the current date and time. Use this when you need to know the current date for scheduling, searching for recent events, or any time-sensitive queries. Returns the current date in YYYY-MM-DD format and time in HH:MM:SS format.',

  /** 输入参数 schema */
  inputSchema: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'Timezone for the date (default: local timezone, e.g., "Asia/Shanghai", "America/New_York")',
      },
    },
  },

  /**
   * 获取当前日期时间
   *
   * @param input - 可选的 timezone 字段
   * @returns JSON 格式的日期时间信息
   */
  execute: async (input: Record<string, unknown>): Promise<string> => {
    const timezone = input.timezone as string | undefined;

    try {
      const now = new Date();

      // 格式化为 YYYY-MM-DD
      const dateStr = now.toLocaleDateString('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      // 格式化为 HH:MM:SS
      const timeStr = now.toLocaleTimeString('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      // 星期名称
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = dayNames[now.getDay()];

      // 月份名称
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      const monthName = monthNames[now.getMonth()];

      return JSON.stringify({
        date: dateStr,
        time: timeStr,
        day: dayName,
        month: monthName,
        year: now.getFullYear(),
        timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        timestamp: now.toISOString(),
      }, null, 2);
    } catch (error) {
      return `Error getting date: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};
