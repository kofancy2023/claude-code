import type { Tool } from '../types/index.js';

export const DateTool: Tool = {
  name: 'DateTool',
  description: 'Get the current date and time. Use this when you need to know the current date for scheduling, searching for recent events, or any time-sensitive queries. Returns the current date in YYYY-MM-DD format and time in HH:MM:SS format.',

  inputSchema: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'Timezone for the date (default: local timezone, e.g., "Asia/Shanghai", "America/New_York")',
      },
    },
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    const timezone = input.timezone as string | undefined;

    try {
      const now = new Date();

      const dateStr = now.toLocaleDateString('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      const timeStr = now.toLocaleTimeString('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = dayNames[now.getDay()];

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