/**
 * 数据库插件
 *
 * 提供数据库相关的工具：
 * - QueryTool: 执行 SQL 查询
 * - TableListTool: 列出数据库表
 * - SchemaTool: 查看表结构
 */

import type { AgentPlugin } from '../types.js';

/**
 * 数据库连接配置
 */
interface DbConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

/**
 * 模拟数据库连接
 * 实际项目中应使用真实的数据库驱动 (如 pg, mysql2 等)
 */
class MockDbConnection {
  private config: DbConfig;

  constructor(config: DbConfig = {}) {
    this.config = config;
  }

  async query(sql: string): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
    console.log(`[MockDB] Executing query on ${this.config.database}: ${sql}`);

    if (sql.trim().toLowerCase().startsWith('select')) {
      return {
        rows: [
          { id: 1, name: '示例数据', created_at: new Date().toISOString() },
          { id: 2, name: '测试数据', created_at: new Date().toISOString() },
        ],
        rowCount: 2,
      };
    }

    return { rows: [], rowCount: 0 };
  }

  async listTables(): Promise<string[]> {
    return ['users', 'products', 'orders', 'settings'];
  }

  async getTableSchema(tableName: string): Promise<{ columns: { name: string; type: string }[] }> {
    const schemas: Record<string, { columns: { name: string; type: string }[] }> = {
      users: {
        columns: [
          { name: 'id', type: 'integer' },
          { name: 'name', type: 'varchar(255)' },
          { name: 'email', type: 'varchar(255)' },
          { name: 'created_at', type: 'timestamp' },
        ],
      },
      products: {
        columns: [
          { name: 'id', type: 'integer' },
          { name: 'name', type: 'varchar(255)' },
          { name: 'price', type: 'decimal(10,2)' },
        ],
      },
    };

    return schemas[tableName] || { columns: [] };
  }

  async close(): Promise<void> {
    console.log('[MockDB] Connection closed');
  }
}

/**
 * 数据库查询工具
 */
const QueryTool = {
  name: 'DbQuery',
  description: '执行 SQL 查询语句',
  inputSchema: {
    type: 'object' as const,
    properties: {
      sql: {
        type: 'string',
        description: '要执行的 SQL 查询语句',
      },
      limit: {
        type: 'number',
        description: '返回结果的最大行数',
        default: 100,
      },
    },
    required: ['sql'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    const sql = input.sql as string;

    if (!sql || typeof sql !== 'string') {
      return 'Error: SQL query is required';
    }

    const dangerousPatterns = [
      /\b(drop|delete|truncate|alter)\b/i,
      /;\s*(drop|delete|truncate|alter)/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql)) {
        return 'Error: Dangerous SQL operation blocked for security';
      }
    }

    try {
      const db = new MockDbConnection();
      const result = await db.query(sql);
      await db.close();

      if (result.rows.length === 0) {
        return 'Query executed successfully. No results returned.';
      }

      return JSON.stringify(result.rows.slice(0, (input.limit as number) || 100), null, 2);
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * 表列表工具
 */
const TableListTool = {
  name: 'DbListTables',
  description: '列出数据库中的所有表',
  inputSchema: {
    type: 'object' as const,
    properties: {
      pattern: {
        type: 'string',
        description: '表名过滤模式 (支持 * 作为通配符)',
      },
    },
  },

  execute: async (): Promise<string> => {
    try {
      const db = new MockDbConnection();
      const tables = await db.listTables();
      await db.close();

      return tables.join('\n');
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * 表结构工具
 */
const SchemaTool = {
  name: 'DbSchema',
  description: '查看数据库表的结构定义',
  inputSchema: {
    type: 'object' as const,
    properties: {
      table: {
        type: 'string',
        description: '表名',
      },
    },
    required: ['table'],
  },

  execute: async (input: Record<string, unknown>): Promise<string> => {
    const table = input.table as string;

    if (!table || typeof table !== 'string') {
      return 'Error: Table name is required';
    }

    try {
      const db = new MockDbConnection();
      const schema = await db.getTableSchema(table);
      await db.close();

      if (schema.columns.length === 0) {
        return `Table "${table}" not found`;
      }

      const lines = [`Table: ${table}`, 'Columns:', ''];
      for (const col of schema.columns) {
        lines.push(`  - ${col.name}: ${col.type}`);
      }

      return lines.join('\n');
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

/**
 * 数据库插件定义
 */
const dbPlugin: AgentPlugin = {
  metadata: {
    name: 'db-plugin',
    version: '1.0.0',
    description: '提供数据库操作相关工具',
    author: 'My Agent Team',
    tags: ['database', 'sql', 'query'],
    minAgentVersion: '0.1.0',
  },

  config: [
    {
      key: 'defaultLimit',
      value: 100,
      type: 'number',
      description: '查询结果默认返回的最大行数',
    },
    {
      key: 'allowDrop',
      value: false,
      type: 'boolean',
      description: '是否允许执行 DROP 操作 (危险)',
      sensitive: true,
    },
  ],

  tools: [QueryTool, TableListTool, SchemaTool],

  hooks: {
    onLoad: () => {
      console.log('[DbPlugin] Database plugin loaded');
    },
    beforeToolExecute: (tool, input) => {
      if (tool.name === 'DbQuery') {
        console.log('[DbPlugin] Query about to execute:', (input as { sql?: string }).sql);
      }
    },
    afterToolExecute: (tool, input, result) => {
      if (tool.name === 'DbQuery') {
        console.log('[DbPlugin] Query completed, result length:', result.length);
      }
    },
    onToolError: (tool, input, error) => {
      console.error(`[DbPlugin] Tool ${tool.name} error:`, error.message);
    },
  },
};

export default dbPlugin;
