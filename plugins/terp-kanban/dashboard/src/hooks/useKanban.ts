import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import {
  Board,
  BoardData,
  Task,
  BoardMember,
  ShareLink,
  CreateBoardRequest,
  CreateTaskRequest,
  UpdateTaskRequest,
  BulkUpdateTasksRequest,
  AddMemberRequest,
  UpdateMemberRoleRequest,
  WalletUser,
} from '../types';
import { getCurrentUser, getChallenge, signAndVerify, logout as authLogout } from '../auth';

export const queryKeys = {
  boards: ['boards'] as const,
  board: (slug: string) => ['board', slug] as const,
  boardPublic: ['boards', 'public'] as const,
  task: (id: string) => ['task', id] as const,
  members: (slug: string) => ['members', slug] as const,
  shares: (slug: string) => ['shares', slug] as const,
  stats: (slug: string) => ['stats', slug] as const,
  assignees: (slug: string) => ['assignees', slug] as const,
  walletUser: ['wallet', 'user'] as const,
  authChallenge: ['wallet', 'challenge'] as const,
};

export function useBoards() {
  return useQuery({
    queryKey: queryKeys.boards,
    queryFn: () => api.board.list(),
    staleTime: 1000 * 60 * 5,
  });
}

export function useBoardPublic() {
  return useQuery({
    queryKey: queryKeys.boardPublic,
    queryFn: () => api.board.getPublic(),
    staleTime: 1000 * 60 * 5,
  });
}

export function useBoard(slug: string | null) {
  return useQuery({
    queryKey: queryKeys.board(slug || ''),
    queryFn: () => api.board.get(slug || undefined),
    enabled: !!slug,
    staleTime: 1000 * 30,
  });
}

export function useCreateBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBoardRequest) => api.board.create(data),
    onSuccess: (newBoard) => {
      queryClient.setQueryData<Board[]>(queryKeys.boards, (old) =>
        old ? [...old, newBoard] : [newBoard]
      );
    },
  });
}

export function useUpdateBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ slug, data }: { slug: string; data: Partial<CreateBoardRequest> }) =>
      api.board.update(slug, data),
    onSuccess: (updatedBoard) => {
      queryClient.setQueryData<Board[]>(queryKeys.boards, (old) =>
        old?.map((b) => (b.slug === updatedBoard.slug ? updatedBoard : b))
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.board(updatedBoard.slug) });
    },
  });
}

export function useDeleteBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (slug: string) => api.board.delete(slug),
    onSuccess: (_, slug) => {
      queryClient.setQueryData<Board[]>(queryKeys.boards, (old) =>
        old?.filter((b) => b.slug !== slug)
      );
    },
  });
}

export function useTask(taskId: string | null) {
  return useQuery({
    queryKey: queryKeys.task(taskId || ''),
    queryFn: () => api.task.get(taskId!),
    enabled: !!taskId,
    staleTime: 1000 * 30,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTaskRequest) => api.task.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board'] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: UpdateTaskRequest }) =>
      api.task.update(taskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board'] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => api.task.delete(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board'] });
    },
  });
}

export function useBulkUpdateTasks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkUpdateTasksRequest) => api.task.bulk(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board'] });
    },
  });
}

export function useMoveTask() {
  return useBulkUpdateTasks();
}

export function useTaskComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: string }) =>
      api.task.addComment(taskId, body),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.task(taskId) });
    },
  });
}

export function useBoardMembers(boardSlug: string | null) {
  return useQuery({
    queryKey: queryKeys.members(boardSlug || ''),
    queryFn: () => api.member.list(boardSlug!),
    enabled: !!boardSlug,
    staleTime: 1000 * 60,
  });
}

export function useAddMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ boardSlug, data }: { boardSlug: string; data: AddMemberRequest }) =>
      api.member.add(boardSlug, data),
    onSuccess: (_, { boardSlug }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members(boardSlug) });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ boardSlug, walletAddr }: { boardSlug: string; walletAddr: string }) =>
      api.member.remove(boardSlug, walletAddr),
    onSuccess: (_, { boardSlug }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members(boardSlug) });
    },
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      boardSlug,
      walletAddr,
      data,
    }: {
      boardSlug: string;
      walletAddr: string;
      data: UpdateMemberRoleRequest;
    }) => api.member.updateRole(boardSlug, walletAddr, data),
    onSuccess: (_, { boardSlug }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members(boardSlug) });
    },
  });
}

export function useShares(boardSlug: string | null) {
  return useQuery({
    queryKey: queryKeys.shares(boardSlug || ''),
    queryFn: () => api.share.list(boardSlug!),
    enabled: !!boardSlug,
    staleTime: 1000 * 60,
  });
}

export function useCreateShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ boardSlug, expiresIn }: { boardSlug: string; expiresIn?: number }) =>
      api.share.create(boardSlug, expiresIn),
    onSuccess: (_, { boardSlug }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shares(boardSlug) });
    },
  });
}

export function useRevokeShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ shareId, boardSlug }: { shareId: string; boardSlug: string }) =>
      api.share.revoke(shareId),
    onSuccess: (_, { boardSlug }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shares(boardSlug) });
    },
  });
}

export function useBoardStats(boardSlug: string | null) {
  return useQuery({
    queryKey: queryKeys.stats(boardSlug || ''),
    queryFn: () => api.system.getStats(boardSlug!),
    enabled: !!boardSlug,
    staleTime: 1000 * 60,
  });
}

export function useAssignees(boardSlug: string | null) {
  return useQuery({
    queryKey: queryKeys.assignees(boardSlug || ''),
    queryFn: () => api.system.getAssignees(boardSlug!),
    enabled: !!boardSlug,
    staleTime: 1000 * 60,
  });
}

export function useWalletUser() {
  return useQuery({
    queryKey: queryKeys.walletUser,
    queryFn: getCurrentUser,
    staleTime: 1000 * 60,
    retry: false,
  });
}

export function useAuthChallenge() {
  return useQuery({
    queryKey: queryKeys.authChallenge,
    queryFn: getChallenge,
    enabled: false,
  });
}

export function useVerifyWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (challenge: Awaited<ReturnType<typeof getChallenge>>) => {
      const result = await signAndVerify(challenge);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.walletUser });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authLogout,
    onSuccess: () => {
      queryClient.clear();
    },
  });
}