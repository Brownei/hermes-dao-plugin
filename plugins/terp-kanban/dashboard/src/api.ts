import { getAuthHeaders } from './auth';
import {
  Board,
  BoardData,
  Task,
  BoardMember,
  ShareLink,
  TaskComment,
  TaskLog,
  BoardStats,
  KanbanConfig,
  HomeChannel,
  Diagnostics,
  Assignee,
  CreateBoardRequest,
  CreateTaskRequest,
  UpdateTaskRequest,
  BulkUpdateTasksRequest,
  AddMemberRequest,
  UpdateMemberRoleRequest,
} from './types';

const API_BASE = '/api/plugins/terp-kanban';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  board: {
    get: (slug?: string): Promise<BoardData> => {
      const params = slug ? `?board=${slug}` : '';
      return fetchApi<BoardData>(`/board${params}`);
    },

    list: (): Promise<Board[]> => fetchApi<Board[]>('/wallet/boards'),

    getPublic: (): Promise<Board[]> => fetchApi<Board[]>('/wallet/boards/public'),

    create: (data: CreateBoardRequest): Promise<Board> =>
      fetchApi<Board>('/wallet/boards', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (slug: string, data: Partial<Pick<CreateBoardRequest, 'name' | 'description' | 'icon' | 'color'>>): Promise<Board> =>
      fetchApi<Board>(`/wallet/boards/${slug}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    delete: (slug: string): Promise<void> =>
      fetchApi<void>(`/wallet/boards/${slug}`, { method: 'DELETE' }),

    switch: (slug: string): Promise<void> =>
      fetchApi<void>(`/boards/${slug}/switch`, { method: 'POST' }),
  },

  task: {
    get: (taskId: string): Promise<Task> => fetchApi<Task>(`/tasks/${taskId}`),

    create: (data: CreateTaskRequest): Promise<Task> =>
      fetchApi<Task>('/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (taskId: string, data: UpdateTaskRequest): Promise<Task> =>
      fetchApi<Task>(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    bulk: (data: BulkUpdateTasksRequest): Promise<Task[]> =>
      fetchApi<Task[]>('/tasks/bulk', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    delete: (taskId: string): Promise<void> =>
      fetchApi<void>(`/tasks/${taskId}`, { method: 'DELETE' }),

    addComment: (taskId: string, body: string): Promise<TaskComment> =>
      fetchApi<TaskComment>(`/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),

    reclaim: (taskId: string): Promise<void> =>
      fetchApi<void>(`/tasks/${taskId}/reclaim`, { method: 'POST' }),

    specify: (taskId: string, specs: Record<string, unknown>): Promise<Task> =>
      fetchApi<Task>(`/tasks/${taskId}/specify`, {
        method: 'POST',
        body: JSON.stringify(specs),
      }),

    reassign: (taskId: string, walletAddr: string): Promise<Task> =>
      fetchApi<Task>(`/tasks/${taskId}/reassign`, {
        method: 'POST',
        body: JSON.stringify({ wallet_addr: walletAddr }),
      }),

    homeSubscribe: (taskId: string, platform: string): Promise<void> =>
      fetchApi<void>(`/tasks/${taskId}/home-subscribe/${platform}`, { method: 'POST' }),

    homeUnsubscribe: (taskId: string, platform: string): Promise<void> =>
      fetchApi<void>(`/tasks/${taskId}/home-subscribe/${platform}`, { method: 'DELETE' }),

    getLog: (taskId: string): Promise<TaskLog> => fetchApi<TaskLog>(`/tasks/${taskId}/log`),
  },

  link: {
    create: (sourceTaskId: string, targetTaskId: string, linkType: string): Promise<void> =>
      fetchApi<void>('/links', {
        method: 'POST',
        body: JSON.stringify({ source_task_id: sourceTaskId, target_task_id: targetTaskId, link_type: linkType }),
      }),

    delete: (sourceTaskId: string, targetTaskId: string): Promise<void> =>
      fetchApi<void>('/links', {
        method: 'DELETE',
        body: JSON.stringify({ source_task_id: sourceTaskId, target_task_id: targetTaskId }),
      }),
  },

  member: {
    list: (boardSlug: string): Promise<BoardMember[]> =>
      fetchApi<BoardMember[]>(`/wallet/boards/${boardSlug}/members`),

    add: (boardSlug: string, data: AddMemberRequest): Promise<BoardMember> =>
      fetchApi<BoardMember>(`/wallet/boards/${boardSlug}/members`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    remove: (boardSlug: string, walletAddr: string): Promise<void> =>
      fetchApi<void>(`/wallet/boards/${boardSlug}/members/${walletAddr}`, { method: 'DELETE' }),

    updateRole: (boardSlug: string, walletAddr: string, data: UpdateMemberRoleRequest): Promise<BoardMember> =>
      fetchApi<BoardMember>(`/wallet/boards/${boardSlug}/members/${walletAddr}/role`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },

  share: {
    create: (boardSlug: string, role: string = 'viewer', expiresInDays?: number, expiresAt?: string): Promise<ShareLink> =>
      fetchApi<ShareLink>('/shares', {
        method: 'POST',
        body: JSON.stringify({ 
          board: boardSlug, 
          role,
          expires_in_days: expiresInDays?.toString(),
          expires_at: expiresAt,
        }),
      }),

    list: (boardSlug: string): Promise<ShareLink[]> =>
      fetchApi<ShareLink[]>(`/shares?board_slug=${boardSlug}`),

    revoke: (shareId: string): Promise<void> =>
      fetchApi<void>(`/shares/${shareId}`, { method: 'DELETE' }),

    getInfo: (token: string): Promise<{ board: Board; expires_at: string | null }> =>
      fetchApi(`/share/${token}`),

    getData: (token: string): Promise<BoardData> =>
      fetchApi(`/share/${token}/data`),

    validate: (shareId: string): Promise<{ valid: boolean; expires_at: string | null }> =>
      fetchApi(`/shares/validate/${shareId}`),
  },

  column: {
    create: (boardSlug: string, name: string, color?: string): Promise<any> =>
      fetchApi<any>(`/wallet/boards/${boardSlug}/columns`, {
        method: 'POST',
        body: JSON.stringify({ name, color }),
      }),

    update: (boardSlug: string, colId: number, name?: string, color?: string): Promise<any> =>
      fetchApi<any>(`/wallet/boards/${boardSlug}/columns/${colId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, color }),
      }),

    delete: (boardSlug: string, colId: number): Promise<void> =>
      fetchApi<void>(`/wallet/boards/${boardSlug}/columns/${colId}`, { method: 'DELETE' }),

    reorder: (boardSlug: string, columnIds: number[]): Promise<void> =>
      fetchApi<void>(`/wallet/boards/${boardSlug}/columns/reorder`, {
        method: 'POST',
        body: JSON.stringify({ column_ids: columnIds }),
      }),
  },

  system: {
    getDiagnostics: (): Promise<Diagnostics> => fetchApi('/diagnostics'),

    getConfig: (): Promise<KanbanConfig> => fetchApi('/config'),

    getHomeChannels: (): Promise<HomeChannel[]> => fetchApi('/home-channels'),

    getStats: (boardSlug: string): Promise<BoardStats> =>
      fetchApi(`/stats?board=${boardSlug}`),

    getAssignees: (boardSlug: string): Promise<Assignee[]> =>
      fetchApi(`/assignees?board=${boardSlug}`),

    dispatch: (): Promise<void> => fetchApi('/dispatch', { method: 'POST' }),
  },
};