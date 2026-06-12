import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import { formatLastSeen } from '../utils';

export default function ChatWindow({
  chat, user, messages, onlineUsers, typingUsers,
  onSend, onEdit, onDelete, onReact, onForward, onPin, onBack, onMarkRead,
  onOpenProfile, onOpenGroupSettings, onClearHistory, onLoadMore,
  wallpaper, onSetWallpaper, chatTheme, onSetTheme,
}) {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const [replyTo, setReplyTo] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const lastReadRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, typingUsers.length]);

  useEffect(() => {
    if (!chat || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.senderId !== user.id && last.id !== lastReadRef.current) {
      lastReadRef.current = last.id;
      onMarkRead(last.id);
    }
  }, [messages, user.id, onMarkRead, chat]);

  const handleTyping = (isTyping) => {
    const socket = window.__socket;
    if (!socket || !chat) return;
    socket.emit(isTyping ? 'typing:start' : 'typing:stop', { chatId: chat.id });
  };

  const loadMore = async () => {
    if (!chat || loadingMore || !messages.length) return;
    setLoadingMore(true);
    const el = containerRef.current;
    const prevHeight = el?.scrollHeight || 0;
    try {
      const older = await onLoadMore?.(chat.id, messages[0].createdAt);
      if (older?.length && el) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight - prevHeight;
        });
      }
    } finally {
      setLoadingMore(false);
    }
  };

  if (!chat) {
    return (
      <div className="chat-window empty">
        <div className="chat-empty-state">
          <div className="chat-empty-icon">💬</div>
          <h2>Forevo</h2>
          <p>Выберите чат или начните новый разговор</p>
        </div>
      </div>
    );
  }

  const other = chat.type === 'direct' ? chat.members.find(m => m.id !== user.id) : null;
  const isOnline = other ? onlineUsers.includes(other.id) : false;
  const statusText = chat.type === 'group'
    ? `${chat.members.length} участников`
    : isOnline ? 'в сети' : formatLastSeen(other?.lastSeen);

  const typers = typingUsers.filter(id => id !== user.id);
  const typerNames = typers.map(id => chat.members.find(m => m.id === id)?.displayName).filter(Boolean);

  const headerUser = chat.type === 'group'
    ? { displayName: chat.groupName || chat.name, avatar: chat.groupAvatar || chat.avatar, id: chat.id, isGroup: true }
    : { displayName: chat.name, avatar: chat.avatar, id: other?.id || chat.id };

  const handleHeaderClick = () => {
    if (chat.type === 'direct' && other) onOpenProfile?.(other.id);
    else if (chat.type === 'group') onOpenGroupSettings?.();
  };

  const handleClearHistory = async () => {
    if (!confirm('Очистить историю чата? Сообщения будут удалены только для вас.')) return;
    setShowMenu(false);
    await onClearHistory?.(chat.id);
  };

  const pinnedIds = new Set();
  if (chat.pinnedMessage) pinnedIds.add(chat.pinnedMessage.id);

  return (
    <div className="chat-window">
      <div className="chat-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <Avatar user={headerUser} online={chat.type === 'direct' ? isOnline : undefined} size={36} onClick={handleHeaderClick} />
        <div className="chat-header-info clickable" onClick={handleHeaderClick}>
          <h3>{chat.name}</h3>
          <span className="chat-header-status">{statusText}</span>
        </div>
        <button className="icon-btn" onClick={() => setShowMenu(!showMenu)} title="Меню">⋮</button>
        {showMenu && (
          <>
            <div className="msg-menu-overlay" onClick={() => setShowMenu(false)} />
            <div className="chat-header-menu" onClick={e => e.stopPropagation()}>
              {chat.type === 'group' && (
                <button onClick={() => { setShowMenu(false); onOpenGroupSettings?.(); }}>⚙️ Настройки группы</button>
              )}
              {chat.type === 'direct' && other && (
                <button onClick={() => { setShowMenu(false); onOpenProfile?.(other.id); }}>👤 Профиль</button>
              )}
              <button onClick={() => {
                setShowMenu(false);
                const themes = [
                  { name: 'Тёмная', bg: '#0f0f14', text: '#f0f0f5' },
                  { name: 'Светлая', bg: '#f5f5f7', text: '#1a1a1a' },
                  { name: 'Океан', bg: '#0a1628', text: '#e0e8f0' },
                  { name: 'Лес', bg: '#0d1a0d', text: '#d0e8d0' },
                  { name: 'Закат', bg: '#1a0a0a', text: '#f0d0c0' },
                  { name: 'Космос', bg: '#0a0a1a', text: '#d0d0f0' },
                  { name: 'Розовый', bg: '#1a0a14', text: '#f0d0e8' },
                  { name: 'Удалить', bg: null, text: null },
                ];
                const choice = prompt('Выберите тему (введите номер):\n' + themes.map((t, i) => `${i + 1}. ${t.name}`).join('\n'));
                if (choice) {
                  const idx = parseInt(choice) - 1;
                  if (idx >= 0 && idx < themes.length) {
                    onSetTheme(themes[idx]);
                  }
                }
              }}>🎨 Тема чата</button>
              <button onClick={handleClearHistory}>🗑 Очистить историю</button>
            </div>
          </>
        )}
      </div>

      {chat.pinnedMessage && (
        <div className="pinned-banner" onClick={() => {
          const el = containerRef.current;
          const idx = messages.findIndex(m => m.id === chat.pinnedMessage.id);
          if (idx >= 0 && el) {
            const itemH = 80;
            el.scrollTop = idx * itemH;
          }
        }}>
          <span className="pinned-icon">📌</span>
          <div className="pinned-info">
            <span className="pinned-label">Закреплённое</span>
            <span className="pinned-text">{chat.pinnedMessage.content || 'Вложение'}</span>
          </div>
        </div>
      )}

      <div className="chat-messages" ref={containerRef} style={{
        ...(wallpaper ? { backgroundImage: `url(${wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
        ...(chatTheme ? { backgroundColor: chatTheme.bg, color: chatTheme.text } : {}),
      }} onScroll={(e) => {
        if (e.target.scrollTop < 50) loadMore();
      }}>
        {loadingMore && <div className="loading-more">Загрузка...</div>}
        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const showSender = chat.type === 'group' && msg.senderId !== user.id &&
            (!prev || prev.senderId !== msg.senderId || prev.type === 'system');
          const showColoredName = chat.type === 'direct' && msg.senderId !== user.id;
          const sender = chat.members.find(m => m.id === msg.senderId) || {
            id: msg.senderId,
            displayName: msg.senderName,
            avatar: msg.senderAvatar,
            nicknameColor: msg.senderNicknameColor,
            isModerator: msg.senderIsModerator,
            avatarEmoji: msg.senderAvatarEmoji,
          };
          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwn={msg.senderId === user.id}
              showSender={showSender}
              showColoredName={showColoredName}
              senderUser={sender}
              isPinned={pinnedIds.has(msg.id)}
              onReply={setReplyTo}
              onEdit={onEdit}
              onDelete={onDelete}
              onReact={onReact}
              onForward={onForward}
              onPin={onPin}
              onOpenProfile={onOpenProfile}
            />
          );
        })}
        {typerNames.length > 0 && (
          <div className="typing-indicator">
            <span className="typing-dots"><span /><span /><span /></span>
            {typerNames.join(', ')} {typerNames.length > 1 ? 'печатают' : 'печатает'}...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <MessageInput
        onSend={onSend}
        onTyping={handleTyping}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        members={chat.members}
        chatId={chat.id}
      />
    </div>
  );
}
