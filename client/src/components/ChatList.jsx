import { useState } from 'react';
import Avatar from './Avatar';
import { formatTime } from '../utils';

export default function ChatList({ chats, activeChat, onlineUsers, onSelect, onNewGroup, onProfile, onRequestNotifications, onArchive, onDeleteChats, onMarkAllRead, onOpenFavorites, onOpenArchive, archivedIds }) {
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const notifGranted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const toggleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const handleDelete = () => {
    if (selected.size === 0) return;
    if (!confirm('Удалить ' + selected.size + ' чат(ов)?')) return;
    onDeleteChats([...selected]);
    setSelected(new Set());
    setEditMode(false);
  };

  const handleArchive = () => {
    if (selected.size === 0) return;
    onArchive([...selected]);
    setSelected(new Set());
    setEditMode(false);
  };

  const handleReadAll = () => {
    onMarkAllRead();
    setEditMode(false);
  };

  const archivedCount = archivedIds ? chats.filter(c => archivedIds.has(c.id)).length : 0;

  return (
    <div className="chat-list">
      {!notifGranted && (
        <div className="notif-banner" onClick={onRequestNotifications}>
          🔔 Включить уведомления
        </div>
      )}

      <div className="chat-list-header">
        {isMobile ? (
          <>
            {editMode ? (
              <button className="text-btn edit-btn" onClick={() => { setEditMode(false); setSelected(new Set()); }}>Готово</button>
            ) : (
              <button className="text-btn edit-btn" onClick={() => setEditMode(true)}>Изм.</button>
            )}
            <h2 className="chat-list-title">Чаты</h2>
            <button className="icon-btn" onClick={onNewGroup} title="Новая группа">👥</button>
          </>
        ) : (
          <>
            <div className="chat-list-header-left">
              <button className="icon-btn" onClick={onProfile} title="Меню">☰</button>
              <h2>Чаты</h2>
            </div>
            <div className="chat-list-header-right">
              <button className="icon-btn" onClick={onNewGroup} title="Новая группа">👥</button>
              {editMode ? (
                <button className="text-btn" onClick={() => { setEditMode(false); setSelected(new Set()); }}>Готово</button>
              ) : (
                <button className="icon-btn" onClick={() => setEditMode(true)} title="Изменить">✏️</button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="chat-list-search">
        <input placeholder="Поиск" readOnly onClick={onNewGroup} />
      </div>

      <div className="chat-list-items">
        <button className="chat-item favorites-item" onClick={onOpenFavorites}>
          <div className="avatar" style={{ width: 46, height: 46, background: 'linear-gradient(135deg, #ffa502, #ff6348)', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', flexShrink: 0 }}>
            📝
          </div>
          <div className="chat-item-info">
            <div className="chat-item-top">
              <span className="chat-item-name">Избранное</span>
            </div>
            <div className="chat-item-bottom">
              <span className="chat-item-preview">Ваши заметки и избранное</span>
            </div>
          </div>
        </button>

        <button className="chat-item archive-folder" onClick={onOpenArchive}>
          <div className="avatar" style={{ width: 46, height: 46, background: 'var(--bg-tertiary)', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', flexShrink: 0 }}>
            📂
          </div>
          <div className="chat-item-info">
            <div className="chat-item-top">
              <span className="chat-item-name">Архив</span>
            </div>
            <div className="chat-item-bottom">
              <span className="chat-item-preview">{archivedCount} chat(s)</span>
            </div>
          </div>
        </button>

        {chats.filter(c => !archivedIds?.has(c.id)).map(chat => {
          const other = chat.type === 'direct' ? chat.members.find(m => m.id !== chat._myId) : null;
          const isOnline = other ? onlineUsers.includes(other.id) : false;
          const preview = chat.lastMessage?.type === 'system'
            ? chat.lastMessage.content
            : chat.lastMessage?.deletedAt
              ? 'Сообщение удалено'
              : chat.lastMessage?.type === 'image'
                ? '📷 Фото'
                : chat.lastMessage?.type === 'voice'
                  ? '🎤 Голосовое'
                  : chat.lastMessage?.type === 'video'
                    ? '🎬 Видео'
                    : chat.lastMessage?.type === 'file'
                      ? '📎 Файл'
                      : chat.lastMessage?.content || 'Нет сообщений';

          const senderPrefix = chat.type === 'group' && chat.lastMessage && !chat.lastMessage.deletedAt
            ? chat.lastMessage.senderName?.split(' ')[0] + ': '
            : '';

          return (
            <button
              key={chat.id}
              className={'chat-item ' + (activeChat?.id === chat.id ? 'active ' : '') + (selected.has(chat.id) ? 'selected' : '')}
              onClick={() => editMode ? toggleSelect(chat.id) : onSelect(chat)}
            >
              {editMode && (
                <div className={'chat-select ' + (selected.has(chat.id) ? 'checked' : '')}>
                  {selected.has(chat.id) ? '✓' : ''}
                </div>
              )}
              <Avatar user={{ id: chat.id, displayName: chat.name, avatar: chat.avatar }} online={isOnline} size={46} />
              <div className="chat-item-info">
                <div className="chat-item-top">
                  <span
                    className={'chat-item-name ' + (other?.nicknameColor === 'rainbow' ? 'nickname-rainbow' : other?.nicknameColor === 'gradient' ? 'nickname-gradient' : '')}
                    style={other?.nicknameColor && other.nicknameColor !== 'rainbow' && other.nicknameColor !== 'gradient' ? { color: other.nicknameColor } : undefined}
                  >
                    {(other?.isModerator ? '⭐ ' : '') + (chat.pinned ? '📌 ' : '') + chat.name}
                  </span>
                  {chat.lastMessage && (
                    <span className="chat-item-time">{formatTime(chat.lastMessage.createdAt)}</span>
                  )}
                </div>
                <div className="chat-item-bottom">
                  <span className="chat-item-preview">
                    {senderPrefix}{preview}
                  </span>
                  {chat.unreadCount > 0 && (
                    <span className="chat-item-badge">{chat.unreadCount}</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}

        <a
          href="https://t.me/ForevoM"
          target="_blank"
          rel="noopener noreferrer"
          className="chat-item pinned-item"
        >
          <div className="avatar" style={{ width: 46, height: 46, background: '#0088cc', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', flexShrink: 0 }}>
            ✈️
          </div>
          <div className="chat-item-info">
            <div className="chat-item-top">
              <span className="chat-item-name">Forevo Telegram</span>
            </div>
            <div className="chat-item-bottom">
              <span className="chat-item-preview">@ForevoM — новости и обновления</span>
            </div>
          </div>
        </a>

        <div className="chat-item pinned-item crunchycorp-item">
          <div className="avatar" style={{ width: 46, height: 46, background: 'linear-gradient(135deg, #ff6b6b, #ffa502)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', color: '#fff', flexShrink: 0 }}>
            CC
          </div>
          <div className="chat-item-info">
            <div className="chat-item-top">
              <span className="chat-item-name">CrunchyCo</span>
            </div>
            <div className="chat-item-bottom">
              <span className="chat-item-preview">© 2026 CrunchyCo. Все права защищены.</span>
            </div>
          </div>
        </div>
      </div>

      {editMode && selected.size > 0 && (
        <div className="edit-actions">
          <button className="edit-action-btn" onClick={handleReadAll}>✓ Прочитать все</button>
          <button className="edit-action-btn" onClick={handleArchive}>📥 В архив</button>
          <button className="edit-action-btn danger" onClick={handleDelete}>🗑 Удалить</button>
        </div>
      )}
    </div>
  );
}
