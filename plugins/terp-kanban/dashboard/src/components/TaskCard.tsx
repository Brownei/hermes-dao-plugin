import React, { useState } from 'react';
import { Task, UpdateTaskRequest } from '../types';
import { Draggable } from '@hello-pangea/dnd';

interface TaskCardProps {
  task: Task;
  index: number;
  onEdit: (task: UpdateTaskRequest) => void;
  onDelete: (taskId: string) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, index, onEdit, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDesc, setEditDesc] = useState(task.body || '');

  const handleSave = () => {
    onEdit({ title: editTitle, body: editDesc });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(task.title);
    setEditDesc(task.body || '');
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="task-card editing">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          placeholder="Task title"
          autoFocus
        />
        <textarea
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
        />
        <div className="task-actions">
          <button onClick={handleSave}>Save</button>
          <button onClick={handleCancel}>Cancel</button>
          <button className="delete" onClick={() => { onDelete(task.id); setIsEditing(false); }}>
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          className={`task-card ${snapshot.isDragging ? 'dragging' : ''}`}
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => setIsEditing(true)}
        >
          <div className="task-title">{task.title}</div>
          {task.body && (
            <div className="task-description">{task.body}</div>
          )}
          <div className="task-meta">
            {task.priority && (
              <span className={`task-priority priority-${task.priority.toLowerCase()}`}>
                {task.priority}
              </span>
            )}
            {task.status && (
              <span className={`task-status status-${task.status.toLowerCase()}`}>
                {task.status}
              </span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
};