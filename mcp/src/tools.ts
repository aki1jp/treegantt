import { z } from 'zod';
import { apiFetch, apiMutate } from './client.js';

interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
}

function textResult(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

// タスクの共通フィールド（作成・更新で共有）。api/src/routes/tasks.ts の
// TASK_BODY_PROPERTIES と同じドメイン制約を持たせる（titleColor/titleBgColor/order は
// 装飾・手動並び順のためスコープ外。docs/ai_integration_policy.md §4.2）。
const taskWritableFields = {
  parentId: z.string().nullable().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['todo', 'wip', 'done', 'wait', 'pending']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  progress: z.number().min(0).max(100).optional(),
  assignee: z.string().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  isMilestone: z.boolean().optional(),
  predecessors: z.array(z.string()).optional(),
  estimateMinutes: z.number().min(0).nullable().optional(),
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'list_projects',
    description: 'プロジェクト一覧を取得する（読み取り専用）',
    inputSchema: {},
    handler: async () => textResult(await apiFetch('/projects')),
  },
  {
    name: 'list_tasks',
    description:
      '指定プロジェクトのタスク一覧を取得する（status/assignee/priorityで絞り込み可、読み取り専用）',
    inputSchema: {
      projectId: z.string(),
      status: z.string().optional(),
      assignee: z.string().optional(),
      priority: z.string().optional(),
    },
    handler: async (args) => {
      const { projectId, status, assignee, priority } = args as {
        projectId: string;
        status?: string;
        assignee?: string;
        priority?: string;
      };
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (assignee) params.set('assignee', assignee);
      if (priority) params.set('priority', priority);
      const qs = params.toString();
      const path = `/projects/${encodeURIComponent(projectId)}/tasks${qs ? `?${qs}` : ''}`;
      return textResult(await apiFetch(path));
    },
  },
  {
    name: 'get_task',
    description: 'タスク単体の詳細を取得する（読み取り専用）',
    inputSchema: { taskId: z.string() },
    handler: async (args) => {
      const { taskId } = args as { taskId: string };
      return textResult(await apiFetch(`/tasks/${encodeURIComponent(taskId)}`));
    },
  },
  {
    name: 'export_project',
    description:
      'プロジェクトの全タスク・依存関係を1回でエクスポート取得する（読み取り専用。アドバイス・分析用のコンテキスト取得に適する）',
    inputSchema: { projectId: z.string() },
    handler: async (args) => {
      const { projectId } = args as { projectId: string };
      return textResult(await apiFetch(`/projects/${encodeURIComponent(projectId)}/export/json`));
    },
  },
  {
    name: 'get_settings',
    description: 'アプリ既定のリソース設定（稼働キャパシティ・稼働日）を取得する（読み取り専用）',
    inputSchema: {},
    handler: async () => textResult(await apiFetch('/settings')),
  },
  // 書き込みツール（段階1）。人間の承認ゲートはMCPクライアント側の実行前確認プロンプトに委ねる
  // （docs/ai_integration_policy.md §4.2）。
  {
    name: 'create_task',
    description: 'タスクを新規作成する（書き込み）。titleは必須。',
    inputSchema: {
      projectId: z.string(),
      title: z.string().min(1).max(200),
      ...taskWritableFields,
    },
    handler: async (args) => {
      const { projectId, ...body } = args as { projectId: string } & Record<string, unknown>;
      return textResult(await apiMutate('POST', `/projects/${encodeURIComponent(projectId)}/tasks`, body));
    },
  },
  {
    name: 'update_task',
    description: 'タスクを部分更新する（書き込み）。指定したフィールドのみ変更される。',
    inputSchema: {
      taskId: z.string(),
      title: z.string().min(1).max(200).optional(),
      ...taskWritableFields,
    },
    handler: async (args) => {
      const { taskId, ...body } = args as { taskId: string } & Record<string, unknown>;
      return textResult(await apiMutate('PATCH', `/tasks/${encodeURIComponent(taskId)}`, body));
    },
  },
  {
    name: 'delete_task',
    description:
      'タスクを削除する（書き込み）。mode省略時は子孫ごと削除、"single"なら本体のみ削除し子は繰り上げる。',
    inputSchema: {
      taskId: z.string(),
      mode: z.enum(['subtree', 'single']).optional(),
    },
    handler: async (args) => {
      const { taskId, mode } = args as { taskId: string; mode?: 'subtree' | 'single' };
      const qs = mode ? `?mode=${encodeURIComponent(mode)}` : '';
      await apiMutate('DELETE', `/tasks/${encodeURIComponent(taskId)}${qs}`);
      return textResult({ deleted: true, taskId, mode: mode ?? 'subtree' });
    },
  },
];
