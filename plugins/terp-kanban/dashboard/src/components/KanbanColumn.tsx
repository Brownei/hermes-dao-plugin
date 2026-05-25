import React, { useState } from 'react';
import { Droppable } from '@hello-pangea/dnd';
import { Column, Task, UpdateTaskRequest } from '../types';
import { TaskCard } from './TaskCard';

interface KanbanColumnProps {
  column: Column;
  tasks: Task[];
  boardSlug: string;
  onCreateTask: (columnId: string, title: string, description?: string) => void;
  onUpdateTask: (taskId: string, updates: UpdateTaskRequest) => void;
  onDeleteTask: (taskId: string) => void;
  onDeleteColumn: (columnId: string) => void;
  onRenameColumn: (columnId: string, newTitle: string) => void;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  column,
  tasks,
  boardSlug,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onDeleteColumn,
  onRenameColumn,
}) => {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(column.title);

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskTitle.trim()) {
      onCreateTask(column.id, newTaskTitle.trim());
      setNewTaskTitle('');
      setIsAdding(false);
    }
  };

  const handleRename = () => {
    if (editTitle.trim() && editTitle !== column.title) {
      onRenameColumn(column.id, editTitle.trim());
    }
    setIsEditing(false);
  };

  return (
    <div className="kanban-column">
      <div className="column-header">
        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            autoFocus
          />
        ) : (
          <h3 onDoubleClick={() => setIsEditing(true)}>{column.title}</h3>
        )}
        <span className="task-count">{tasks.length}</span>
        <button className="column-delete" onClick={() => onDeleteColumn(column.id)}>×</button>
      </div>

      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            className={`task-list ${snapshot.isDraggingOver ? 'drag-over' : ''}`}
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                onEdit={(updatedTask) => onUpdateTask(task.id, updatedTask)}
                onDelete={onDeleteTask}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {isAdding ? (
        <form className="add-task-form" onSubmit={handleAddTask}>
          <input
            type="text"
            placeholder="Task title"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            autoFocus
          />
          <div className="form-buttons">
            <button type="submit">Add</button>
            <button type="button" onClick={() => { setIsAdding(false); setNewTaskTitle(''); }}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="add-task-btn" onClick={() => setIsAdding(true)}>
          + Add Task
        </button>
      )}
    </div>
  );
};