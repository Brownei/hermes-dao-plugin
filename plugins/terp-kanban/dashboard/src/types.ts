export type Role = 'admin' | 'editor' | 'viewer';

export interface Board {
  slug: string;
  name: string;
  author: string;
  author_name: string;
  chain_id: string;
  description: string;
  icon: string;
  color: string;
  created_at: string;
}

export interface BoardData {
  board: Board;
  columns: Column[];
  tasks: Task[];
}

export interface Column {
  id: string;
  title: string;
  board_slug: string;
  order: number;
}

export interface Task {
  id: string;
  title: string;
  body: string;
  status: string;
  priority: string;
  assignee: string | null;
  column_id: string;
  board_slug: string;
  created_at: string;
  updated_at: string;
}

export interface BoardMember {
  wallet_addr: string;
  role: Role;
  joined_at: string;
  author_name?: string;
}

export interface WalletUser {
  address: string;
  chain_id: string;
  role: Role;
  board_slug: string;
  author_name?: string;
}

export interface AuthChallenge {
  nonce: string;
  message: string;
  address: string;
}

export interface ShareLink {
  id: string;
  token: string;
  board_slug: string;
  created_at: string;
  expires_at: string | null;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface TaskEvent {
  id: string;
  task_id: string;
  event_type: string;
  actor: string;
  actor_name: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface TaskLog {
  events: TaskEvent[];
}

export interface BoardStats {
  total_tasks: number;
  tasks_by_status: Record<string, number>;
  tasks_by_priority: Record<string, number>;
  tasks_by_assignee: Record<string, number>;
}

export interface KanbanConfig {
  status_columns: string[];
  priority_levels: string[];
}

export interface HomeChannel {
  id: string;
  platform: string;
  name: string;
  enabled: boolean;
}

export interface Diagnostics {
  fleet_status: string;
  signals: Array<{ source: string; level: string; message: string }>;
}

export interface Assignee {
  wallet_addr: string;
  author_name: string;
  task_count: number;
}

export interface CreateBoardRequest {
  slug: string;
  name: string;
  author_name: string;
  chain_id: string;
  description?: string;
  icon?: string;
  color?: string;
}

export interface CreateTaskRequest {
  board_slug: string;
  column_id: string;
  title: string;
  body?: string;
  priority?: string;
}

export interface UpdateTaskRequest {
  status?: string;
  assignee?: string | null;
  priority?: string;
  title?: string;
  body?: string;
  column_id?: string;
}

export interface BulkUpdateTasksRequest {
  task_ids: string[];
  status?: string;
  column_id?: string;
  assignee?: string;
}

export interface AddMemberRequest {
  wallet_addr: string;
  role: 'editor' | 'viewer';
}

export interface UpdateMemberRoleRequest {
  role: 'editor' | 'viewer';
}