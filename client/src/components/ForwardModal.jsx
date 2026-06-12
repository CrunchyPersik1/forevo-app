import { useState } from 'react';
import Avatar from './Avatar';

export default function ForwardModal({ chats, user, onSelect, onClose }) {
  const [query, setQuery] = useState('');

  const filtered = chats.filter(c => {
    if (!query.trim()) return true;
    return c.name?.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Переслать сообщение</h3>
          <button onClick={onClose}>✕</button>
        </div>
        <input
          className="modal-search"
          placeholder="Найти чат..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        <div className="modal-list">
          {filtered.map(chat => (
            <button key={chat.id} className="modal-item" onClick={() => onSelect(chat)}>
              <Avatar user={{ id: chat.id, displayName: chat.name, avatar: chat.avatar }} size={36} />
              <div>
                <div className="modal-item-name">{chat.name}</div>
                <div className="modal-item-sub">{chat.type === 'group' ? `${chat.members?.length || 0} участников` : 'Личный чат'}</div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <div className="modal-empty">Нет чатов</div>}
        </div>
      </div>
    </div>
  );
}
