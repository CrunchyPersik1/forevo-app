import { useState, useEffect } from 'react';
import Avatar from './Avatar';
import { formatTime, formatFileSize } from '../utils';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export default function MessageBubble({
  message, isOwn, onReply, onEdit, onDelete, onReact, showSender, senderUser, onOpenProfile,
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.content || '');

  useEffect(() => {
    if (editing) setEditText(message.content || '');
  }, [message.content, editing]);

  if (message.type === 'system') {
    return <div className="msg-system">{message.content}</div>;
  }

  const handleEdit = async () => {
    if (editText.trim() && editText !== message.content) {
      await onEdit(message.id, editText.trim());
    }
    setEditing(false);
  };

  const avatarUser = senderUser || {
    id: message.senderId,
    displayName: message.senderName,
    avatar: message.senderAvatar,
  };

  return (
    <div className={`msg-row ${isOwn ? 'own' : ''} ${showSender ? 'with-avatar' : ''}`}
      onContextMenu={(e) => { e.preventDefault(); setShowMenu(true); }}>
      {showSender && !isOwn && (
        <Avatar
          user={avatarUser}
          size={28}
          onClick={() => onOpenProfile?.(message.senderId)}
        />
      )}
      <div className="msg-content-col">
        {showSender && !isOwn && (
          <button className="msg-sender" onClick={() => onOpenProfile?.(message.senderId)}>
            {message.senderName}
          </button>
        )}

        {message.replyTo && (
          <div className="msg-reply">
            <span className="msg-reply-name">{message.replyTo.senderName}</span>
            <span className="msg-reply-text">
              {message.replyTo.deletedAt ? 'Удалено' : message.replyTo.content || '📎 Вложение'}
            </span>
          </div>
        )}

        <div className={`msg-bubble ${isOwn ? 'own' : ''} ${message.deletedAt ? 'deleted' : ''}`}>
          {message.deletedAt ? (
            <span className="msg-deleted">Сообщение удалено</span>
          ) : editing ? (
            <div className="msg-edit">
              <input value={editText} onChange={e => setEditText(e.target.value)} autoFocus
                onBlur={handleEdit}
                onKeyDown={e => { if (e.key === 'Enter') handleEdit(); if (e.key === 'Escape') setEditing(false); }} />
              <button onClick={handleEdit}>✓</button>
              <button onClick={() => setEditing(false)}>✕</button>
            </div>
          ) : (
            <>
              {message.type === 'text' && <p className="msg-text">{message.content}</p>}
              {message.type === 'image' && message.attachments?.map(a => (
                <img key={a.id} src={a.url} alt="" className="msg-image" loading="lazy" />
              ))}
              {message.type === 'voice' && message.attachments?.map(a => (
                <audio key={a.id} src={a.url} controls className="msg-audio" preload="metadata" type="audio/webm" />
              ))}
              {message.type === 'file' && message.attachments?.map(a => (
                <a key={a.id} href={a.url} download={a.originalName} className="msg-file">
                  <span>📎</span>
                  <div>
                    <div>{a.originalName}</div>
                    <small>{formatFileSize(a.size)}</small>
                  </div>
                </a>
              ))}
              {message.content && message.type !== 'text' && (
                <p className="msg-text">{message.content}</p>
              )}
            </>
          )}

          <div className="msg-meta">
            {message.editedAt && <span className="msg-edited">изм.</span>}
            <span className="msg-time">{formatTime(message.createdAt)}</span>
            {isOwn && <span className="msg-status">✓✓</span>}
          </div>
        </div>

        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className="msg-reactions">
            {Object.entries(message.reactions).map(([emoji, users]) => (
              <button key={emoji} className="msg-reaction" onClick={() => onReact(message.id, emoji)}>
                {emoji} {users.length > 1 && users.length}
              </button>
            ))}
          </div>
        )}
      </div>

      {showMenu && (
        <>
          <div className="msg-menu-overlay" onClick={() => setShowMenu(false)} />
          <div className="msg-menu">
            {!isOwn && onOpenProfile && (
              <button onClick={() => { onOpenProfile(message.senderId); setShowMenu(false); }}>👤 Профиль</button>
            )}
            <button onClick={() => { onReply(message); setShowMenu(false); }}>↩️ Ответить</button>
            {REACTIONS.map(e => (
              <button key={e} onClick={() => { onReact(message.id, e); setShowMenu(false); }}>{e}</button>
            ))}
            {isOwn && message.type === 'text' && !message.deletedAt && (
              <button onClick={() => { setEditing(true); setShowMenu(false); }}>✏️ Изменить</button>
            )}
            {isOwn && !message.deletedAt && (
              <button className="danger" onClick={() => { onDelete(message.id); setShowMenu(false); }}>🗑 Удалить</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
