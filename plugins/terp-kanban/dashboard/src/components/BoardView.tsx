import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { api } from '../api';
import { BoardData, Column, Task } from '../types';
import { KanbanColumn } from './KanbanColumn';

interface BoardViewProps {
  boardId: string;
  onBack: () => void;
}

export const BoardView: React.FC<BoardViewProps> = ({ boardId, onBack }) => {
  const queryClient = useQueryClient();
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [isAddingColumn, setIsAddingColumn] = useState(false);

  const { data: boardData, isLoading } = useQuery({
    queryKey: ['board', boardId],
    queryFn: () => api.fetchBoard(boardId),
    enabled: !!boardId,
  });

  const createTaskMutation = useMutation({
    mutationFn: ({ columnId, title, description }: { columnId: string; title: string; description?: string }) =>
      api.createTask(boardId, columnId, title, description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, updates }: { taskId: string; updates: Partial<Pick<Task, 'title' | 'description'>> }) =>
      api.updateTask(taskId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: api.deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    },
  });

  const moveTaskMutation = useMutation({
    mutationFn: ({ taskId, targetColumnId }: { taskId: string; targetColumnId: string }) =>
      api.moveTask(taskId, targetColumnId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    },
  });

  const createColumnMutation = useMutation({
    mutationFn: (title: string) => api.createColumn(boardId, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      setNewColumnTitle('');
      setIsAddingColumn(false);
    },
  });

  const deleteColumnMutation = useMutation({
    mutationFn: api.deleteColumn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    },
  });

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    moveTaskMutation.mutate({ taskId: draggableId, targetColumnId: destination.droppableId });
  };

  const handleAddColumn = (e: React.FormEvent) => {
    e.preventDefault();
    if (newColumnTitle.trim()) {
      createColumnMutation.mutate(newColumnTitle.trim());
    }
  };

  if (isLoading) {
    return <div className="loading">Loading board...</div>;
  }

  if (!boardData) {
    return <div className="error">Board not found</div>;
  }

  const sortedColumns = [...boardData.columns].sort((a, b) => a.order - b.order);

  return (
    <div className="board-view">
      <div className="board-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h2>{boardData.board.name}</h2>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="kanban-board">
          {sortedColumns.map((column) => {
            const columnTasks = boardData.tasks
              .filter(t => t.columnId === column.id)
              .sort((a, b) => a.createdAt - b.createdAt);
            return (
              <KanbanColumn
                key={column.id}
                column={column}
                tasks={columnTasks}
                onCreateTask={(columnId, title, description) =>
                  createTaskMutation.mutate({ columnId, title, description })
                }
                onUpdateTask={(taskId, updates) =>
                  updateTaskMutation.mutate({ taskId, updates })
                }
                onDeleteTask={(taskId) => deleteTaskMutation.mutate(taskId)}
                onDeleteColumn={(columnId) => {
                  if (confirm('Delete this column and all its tasks?')) {
                    deleteColumnMutation.mutate(columnId);
                  }
                }}
                onRenameColumn={() => {}}
              />
            );
          })}

          {isAddingColumn ? (
            <form className="add-column-form" onSubmit={handleAddColumn}>
              <input
                type="text"
                placeholder="Column title"
                value={newColumnTitle}
                onChange={(e) => setNewColumnTitle(e.target.value)}
                autoFocus
              />
              <div className="form-buttons">
                <button type="submit" disabled={createColumnMutation.isPending}>
                  {createColumnMutation.isPending ? 'Adding...' : 'Add'}
                </button>
                <button type="button" onClick={() => { setIsAddingColumn(false); setNewColumnTitle(''); }}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button className="add-column-btn" onClick={() => setIsAddingColumn(true)}>
              + Add Column
            </button>
          )}
        </div>
      </DragDropContext>
    </div>
  );
};