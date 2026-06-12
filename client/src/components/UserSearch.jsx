import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import Avatar from './Avatar';

export default function UserSearch({ onSelect, onClose, onlineUsers }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!query.trim()) { setUsers([]); return; }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const results = await api.searchUsers(query);
        if (!controller.signal.aborted) setUsers(results);
      } catch { setUsers([]); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 300);
    return () => { clearTimeout(timer); abortRef.current?.abort(); };
  }, [query]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Новый чат</h3>
          <button onClick={onClose}>✕</button>
        </div>
        <input
          className="modal-search"
          placeholder="Поиск по имени или логину..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        <div className="modal-list">
          {loading && <div className="modal-empty">Поиск...</div>}
          {!loading && query && users.length === 0 && (
            <div className="modal-empty">Никого не найдено</div>
          )}
          {users.map(u => (
            <button key={u.id} className="modal-item" onClick={() => onSelect(u)}>
              <Avatar user={u} online={onlineUsers.includes(u.id)} />
              <div>
                <div className="modal-item-name">{u.displayName}</div>
                <div className="modal-item-sub">@{u.username}</div>
                {u.bio && <div className="modal-item-bio">{u.bio}</div>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
