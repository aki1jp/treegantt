import { z } from 'zod';
import { apiFetch } from './client.js';

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

// 読み取り専用ツールのみ。書き込み系（create_task 等）はここに追加しない
// （docs/ai_integration_policy.md §4.2 の方針）。
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
];
