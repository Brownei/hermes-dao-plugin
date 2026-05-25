import React, { useState, useEffect, useCallback } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { ConnectedWallet } from 'cosmes/wallet';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { WalletConnect } from './components/WalletConnect';
import { KanbanColumn } from './components/KanbanColumn';
import { useBoards, useBoard, useCreateBoard, useDeleteBoard, useCreateTask, useUpdateTask, useDeleteTask, useMoveTask, useWalletUser } from './hooks/useKanban';
import { useToast, ToastContainer } from './hooks/useToast';
import { setCurrentWallet, getChallenge, signAndVerify, getSessionToken, setSessionToken } from './auth';
import { Board, CreateBoardRequest } from './types';

const App: React.FC = () => {
  const queryClient = useQueryClient();
  const { toasts, addToast, removeToast } = useToast();
  const [selectedBoardSlug, setSelectedBoardSlug] = useState<string | null>(null);
  const [connectedWallet, setConnectedWallet] = useState<ConnectedWallet | null>(null);
  const [wallets, setWallets] = useState<Record<string, ConnectedWallet>>({});
  const [activeNav, setActiveNav] = useState<string>('boards');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const { data: user, isLoading: isUserLoading } = useWalletUser();
  const { data: boards = [], isLoading: isBoardsLoading } = useBoards();
  const { data: boardData, isLoading: isBoardLoading } = useBoard(selectedBoardSlug);

  const createTaskMutation = useCreateTask();
  const updateTaskMutation = useUpdateTask();
  const deleteTaskMutation = useDeleteTask();
  const moveTaskMutation = useMoveTask();
  const createBoardMutation = useCreateBoard();
  const deleteBoardMutation = useDeleteBoard();

  useEffect(() => {
    const storedToken = getSessionToken();
    if (storedToken) {
      queryClient.invalidateQueries({ queryKey: ['wallet', 'user'] });
    }
  }, [queryClient]);

  const handleWalletChange = useCallback((newWallets: Record<string, ConnectedWallet>) => {
    setWallets(newWallets);
    const wallet = newWallets[Object.keys(newWallets)[0]] || null;
    setConnectedWallet(wallet);
    setCurrentWallet(wallet);
  }, []);

  const handleAuthenticate = useCallback(async () => {
    if (!connectedWallet || isAuthenticating) return;

    setIsAuthenticating(true);
    try {
      const challenge = await getChallenge();
      await signAndVerify(challenge);
      queryClient.invalidateQueries({ queryKey: ['wallet', 'user'] });
      addToast('Successfully authenticated with Hermes', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Authentication failed', 'error');
    } finally {
      setIsAuthenticating(false);
    }
  }, [connectedWallet, isAuthenticating, queryClient, addToast]);

  const handleCreateBoard = useCallback(() => {
    const name = prompt('Enter board name:');
    if (!name?.trim()) return;

    const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const data: CreateBoardRequest = {
      slug,
      name: name.trim(),
      author_name: user?.author_name || 'Anonymous',
      chain_id: user?.chain_id || 'terp-1',
    };

    createBoardMutation.mutate(data, {
      onSuccess: (newBoard) => {
        setSelectedBoardSlug(newBoard.slug);
        addToast(`Board "${newBoard.name}" created`, 'success');
      },
      onError: (error) => {
        addToast(error instanceof Error ? error.message : 'Failed to create board', 'error');
      },
    });
  }, [createBoardMutation, user, addToast]);

  const handleDeleteBoard = useCallback((slug: string) => {
    if (!confirm('Delete this board?')) return;

    deleteBoardMutation.mutate(slug, {
      onSuccess: () => {
        if (selectedBoardSlug === slug) {
          setSelectedBoardSlug(null);
        }
        addToast('Board deleted', 'success');
      },
      onError: (error) => {
        addToast(error instanceof Error ? error.message : 'Failed to delete board', 'error');
      },
    });
  }, [deleteBoardMutation, selectedBoardSlug, addToast]);

  const handleDragEnd = useCallback((result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    moveTaskMutation.mutate(
      { task_ids: [draggableId], column_id: destination.droppableId },
      {
        onError: (error) => {
          addToast(error instanceof Error ? error.message : 'Failed to move task', 'error');
        },
      }
    );
  }, [moveTaskMutation, addToast]);

  const columns = boardData?.columns.sort((a, b) => a.order - b.order) || [];
  const isLoading = isBoardsLoading || isBoardLoading;

  return (
    <div className="app">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">◇</span>
            <span className="logo-text">Hermes Agent</span>
          </div>
        </div>
        <div className="header-center">
          <WalletConnect
            onWalletChange={handleWalletChange}
            onAuthenticate={handleAuthenticate}
            isAuthenticated={!!user}
            isAuthenticating={isAuthenticating}
          />
        </div>
        <div className="header-right">
          <div className="header-status">
            <span className="status-dot online"></span>
            <span className="status-text">System Online</span>
          </div>
        </div>
      </header>

      <div className="app-layout">
        <aside className="left-sidebar">
          <nav className="sidebar-nav">
            <button
              className={`nav-item ${activeNav === 'boards' ? 'active' : ''}`}
              onClick={() => setActiveNav('boards')}
            >
              <span className="nav-icon">▦</span>
              <span className="nav-text">Boards</span>
            </button>
            <button
              className={`nav-item ${activeNav === 'tasks' ? 'active' : ''}`}
              onClick={() => setActiveNav('tasks')}
            >
              <span className="nav-icon">☐</span>
              <span className="nav-text">All Tasks</span>
            </button>
            <button
              className={`nav-item ${activeNav === 'agents' ? 'active' : ''}`}
              onClick={() => setActiveNav('agents')}
            >
              <span className="nav-icon">◈</span>
              <span className="nav-text">Agents</span>
            </button>
            <button
              className={`nav-item ${activeNav === 'workflows' ? 'active' : ''}`}
              onClick={() => setActiveNav('workflows')}
            >
              <span className="nav-icon">↻</span>
              <span className="nav-text">Workflows</span>
            </button>
            <button
              className={`nav-item ${activeNav === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveNav('settings')}
            >
              <span className="nav-icon">⚙</span>
              <span className="nav-text">Settings</span>
            </button>
          </nav>

          <div className="sidebar-boards">
            <div className="sidebar-section-title">
              <span>Your Boards</span>
              <button className="add-btn" onClick={handleCreateBoard}>+</button>
            </div>
            {isBoardsLoading ? (
              <div className="loading-small">Loading...</div>
            ) : (
              <div className="board-list">
                {boards.map((board) => (
                  <div
                    key={board.slug}
                    className={`board-item ${selectedBoardSlug === board.slug ? 'active' : ''}`}
                    onClick={() => setSelectedBoardSlug(board.slug)}
                  >
                    <span className="board-color" style={{ backgroundColor: board.color || '#1d9bf0' }}></span>
                    <span className="board-name">{board.name}</span>
                    {board.author === user?.address && (
                      <button
                        className="board-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBoard(board.slug);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="main-content">
          {selectedBoardSlug && boardData ? (
            <div className="board-view">
              <div className="board-header">
                <h2 className="board-title">{boardData.board.name}</h2>
                <div className="board-actions">
                  <button className="action-btn" onClick={() => setSelectedBoardSlug(null)}>
                    ← Back
                  </button>
                </div>
              </div>
              <DragDropContext onDragEnd={handleDragEnd}>
                <div className="kanban-board">
                  {columns.map((column) => {
                    const columnTasks = boardData.tasks
                      .filter((t) => t.column_id === column.id)
                      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                    return (
                      <KanbanColumn
                        key={column.id}
                        column={column}
                        tasks={columnTasks}
                        boardSlug={selectedBoardSlug}
                        onCreateTask={(columnId, title, description) =>
                          createTaskMutation.mutate(
                            { board_slug: selectedBoardSlug, column_id: columnId, title, body: description },
                            {
                              onError: (error) => addToast(error instanceof Error ? error.message : 'Failed to create task', 'error'),
                            }
                          )
                        }
                        onUpdateTask={(taskId, updates) =>
                          updateTaskMutation.mutate(
                            { taskId, data: updates },
                            {
                              onError: (error) => addToast(error instanceof Error ? error.message : 'Failed to update task', 'error'),
                            }
                          )
                        }
                        onDeleteTask={(taskId) =>
                          deleteTaskMutation.mutate(taskId, {
                            onError: (error) => addToast(error instanceof Error ? error.message : 'Failed to delete task', 'error'),
                          })
                        }
                        onDeleteColumn={() => {}}
                        onRenameColumn={() => {}}
                      />
                    );
                  })}
                </div>
              </DragDropContext>
            </div>
          ) : isLoading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading board...</p>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">▦</div>
              <h3>Select or Create a Board</h3>
              <p>Choose a board from the sidebar or create a new one to get started.</p>
              <button className="create-board-btn" onClick={handleCreateBoard}>
                + Create New Board
              </button>
            </div>
          )}
        </main>

        <aside className="right-sidebar">
          <div className="sidebar-section">
            <div className="section-header">
              <span className="section-icon">⚡</span>
              <span className="section-title">System Status</span>
            </div>
            <div className="status-list">
              <div className="status-item">
                <span className="status-label">Agent Core</span>
                <span className="status-badge running">Running</span>
              </div>
              <div className="status-item">
                <span className="status-label">Task Queue</span>
                <span className="status-badge">{boardData?.tasks.length || 0} tasks</span>
              </div>
              <div className="status-item">
                <span className="status-label">Connected Wallet</span>
                <span className="status-badge">{user ? 'Active' : 'None'}</span>
              </div>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="section-header">
              <span className="section-icon">◉</span>
              <span className="section-title">Quick Examples</span>
            </div>
            <div className="example-list">
              <div
                className="example-item"
                onClick={() =>
                  columns[0] &&
                  createTaskMutation.mutate(
                    { board_slug: selectedBoardSlug || '', column_id: columns[0].id, title: 'Deploy to staging', body: 'Run deployment workflow' },
                    { onError: (error) => addToast(error instanceof Error ? error.message : 'Failed', 'error') }
                  )
                }
              >
                <span className="example-icon">⬆</span>
                <span className="example-text">Deploy to staging</span>
              </div>
              <div
                className="example-item"
                onClick={() =>
                  columns[0] &&
                  createTaskMutation.mutate(
                    { board_slug: selectedBoardSlug || '', column_id: columns[0].id, title: 'Run tests', body: 'Execute test suite' },
                    { onError: (error) => addToast(error instanceof Error ? error.message : 'Failed', 'error') }
                  )
                }
              >
                <span className="example-icon">✓</span>
                <span className="example-text">Run test suite</span>
              </div>
              <div
                className="example-item"
                onClick={() =>
                  columns[0] &&
                  createTaskMutation.mutate(
                    { board_slug: selectedBoardSlug || '', column_id: columns[0].id, title: 'Build artifact', body: 'Compile production build' },
                    { onError: (error) => addToast(error instanceof Error ? error.message : 'Failed', 'error') }
                  )
                }
              >
                <span className="example-icon">⬡</span>
                <span className="example-text">Build artifact</span>
              </div>
              <div
                className="example-item"
                onClick={() =>
                  columns[0] &&
                  createTaskMutation.mutate(
                    { board_slug: selectedBoardSlug || '', column_id: columns[0].id, title: 'Sync data', body: 'Pull latest data from API' },
                    { onError: (error) => addToast(error instanceof Error ? error.message : 'Failed', 'error') }
                  )
                }
              >
                <span className="example-icon">↻</span>
                <span className="example-text">Sync external data</span>
              </div>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="section-header">
              <span className="section-icon">⌘</span>
              <span className="section-title">Shortcuts</span>
            </div>
            <div className="shortcut-list">
              <div className="shortcut-item">
                <kbd>Ctrl</kbd>+<kbd>K</kbd>
                <span>Quick search</span>
              </div>
              <div className="shortcut-item">
                <kbd>N</kbd>
                <span>New task</span>
              </div>
              <div className="shortcut-item">
                <kbd>B</kbd>
                <span>New board</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default App;