import Avatar from './Avatar';
import { formatTime } from '../utils';

export default function ChatList({ chats, activeChat, onlineUsers, onSelect, onNewChat, onNewGroup, onProfile, themeIcon, onToggleTheme, onRequestNotifications }) {
  const notifGranted = typeof Notification !== 'undefined' && Notification.permission === 'granted';

  return (
    <div className="chat-list">
      {!notifGranted && (
        <div className="notif-banner" onClick={onRequestNotifications}>
          🔔 Включить уведомления
        </div>
      )}
      <div className="chat-list-header">
        <h2>Чаты</h2>
        <div className="chat-list-actions">
          <button className="icon-btn" onClick={onNewGroup} title="Новая группа">👥</button>
          <button className="icon-btn" onClick={onProfile} title="Профиль">👤</button>
        </div>
      </div>

      <div className="chat-list-search">
        <input placeholder="Поиск чатов..." readOnly onClick={onNewChat} />
      </div>

      <div className="chat-list-items">
        {chats.length === 0 && (
          <div className="chat-list-empty">
            <p>Нет чатов</p>
            <button onClick={onNewChat}>Начать общение</button>
          </div>
        )}
        {chats.map(chat => {
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
                  : chat.lastMessage?.type === 'file'
                    ? '📎 Файл'
                    : chat.lastMessage?.content || 'Нет сообщений';

          return (
            <button
              key={chat.id}
              className={`chat-item ${activeChat?.id === chat.id ? 'active' : ''}`}
              onClick={() => onSelect(chat)}
            >
              <Avatar user={{ id: chat.id, displayName: chat.name, avatar: chat.avatar }} online={isOnline} />
              <div className="chat-item-info">
                <div className="chat-item-top">
                  <span
                    className={`chat-item-name ${other?.nicknameColor === 'rainbow' ? 'nickname-rainbow' : other?.nicknameColor === 'gradient' ? 'nickname-gradient' : ''}`}
                    style={other?.nicknameColor && other.nicknameColor !== 'rainbow' && other.nicknameColor !== 'gradient' ? { color: other.nicknameColor } : undefined}
                  >
                    {other?.isModerator && '⭐ '}{chat.name}
                  </span>
                  {chat.lastMessage && (
                    <span className="chat-item-time">{formatTime(chat.lastMessage.createdAt)}</span>
                  )}
                </div>
                <div className="chat-item-bottom">
                  <span className="chat-item-preview">{preview}</span>
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
          <div className="avatar" style={{ width: 48, height: 48, background: '#0088cc', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
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
          <div className="avatar" style={{ width: 48, height: 48, background: 'linear-gradient(135deg, #ff6b6b, #ffa502)', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', color: '#fff' }}>
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

      <div className="chat-list-version">Forevo v1.5.0</div>
    </div>
  );
}
