import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Board } from '../types';

interface BoardListProps {
  onSelectBoard: (boardId: string) => void;
  selectedBoardId: string | null;
}

export const BoardList: React.FC<BoardListProps> = ({ onSelectBoard, selectedBoardId }) => {
  const [newBoardName, setNewBoardName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const queryClient = useQueryClient();

  const { data: boards = [], isLoading } = useQuery({
    queryKey: ['boards'],
    queryFn: api.fetchBoards,
  });

  const createBoardMutation = useMutation({
    mutationFn: api.createBoard,
    onSuccess: (newBoard) => {
      queryClient.setQueryData<Board[]>(['boards'], (old) => [...(old || []), newBoard]);
      setNewBoardName('');
      setIsCreating(false);
      onSelectBoard(newBoard.id);
    },
  });

  const deleteBoardMutation = useMutation({
    mutationFn: api.deleteBoard,
    onSuccess: (_, boardId) => {
      queryClient.setQueryData<Board[]>(['boards'], (old) => (old || []).filter(b => b.id !== boardId));
      if (selectedBoardId === boardId) {
        onSelectBoard('');
      }
    },
  });

  const handleCreateBoard = (e: React.FormEvent) => {
    e.preventDefault();
    if (newBoardName.trim()) {
      createBoardMutation.mutate(newBoardName.trim());
    }
  };

  if (isLoading) {
    return <div className="loading">Loading boards...</div>;
  }

  return (
    <div className="board-list">
      <h2 className="board-list-title">Boards</h2>
      
      <div className="boards">
        {boards.map((board) => (
          <div
            key={board.id}
            className={`board-item ${selectedBoardId === board.id ? 'selected' : ''}`}
            onClick={() => onSelectBoard(board.id)}
          >
            <span className="board-name">{board.name}</span>
            <button
              className="board-delete"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Delete this board?')) {
                  deleteBoardMutation.mutate(board.id);
                }
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {isCreating ? (
        <form className="create-board-form" onSubmit={handleCreateBoard}>
          <input
            type="text"
            placeholder="Board name"
            value={newBoardName}
            onChange={(e) => setNewBoardName(e.target.value)}
            autoFocus
          />
          <div className="form-buttons">
            <button type="submit" disabled={createBoardMutation.isPending}>
              {createBoardMutation.isPending ? 'Creating...' : 'Create'}
            </button>
            <button type="button" onClick={() => setIsCreating(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="new-board-btn" onClick={() => setIsCreating(true)}>
          + New Board
        </button>
      )}
    </div>
  );
};