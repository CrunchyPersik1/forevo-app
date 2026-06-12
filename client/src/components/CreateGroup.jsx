import { useState, useEffect } from 'react';
import { api } from '../api';
import Avatar from './Avatar';

export default function CreateGroup({ onCreate, onClose, onlineUsers }) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!query.trim()) { setUsers([]); return; }
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchUsers(query);
        setUsers(results);
      } catch { setUsers([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const toggle = (user) => {
    setSelected(prev =>
      prev.find(u => u.id === user.id)
        ? prev.filter(u => u.id !== user.id)
        : [...prev, user]
    );
  };

  const handleCreate = async () => {
    if (!name.trim() || selected.length === 0) return;
    try {
      await onCreate(name.trim(), selected.map(u => u.id));
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Новая группа</h3>
          <button onClick={onClose}>✕</button>
        </div>

        <input
          className="modal-search"
          placeholder="Название группы"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />

        {selected.length > 0 && (
          <div className="selected-users">
            {selected.map(u => (
              <button key={u.id} className="selected-chip" onClick={() => toggle(u)}>
                {u.displayName} ✕
              </button>
            ))}
          </div>
        )}

        <input
          className="modal-search"
          placeholder="Добавить участников..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />

        <div className="modal-list">
          {users.map(u => (
            <button key={u.id} className={`modal-item ${selected.find(s => s.id === u.id) ? 'selected' : ''}`} onClick={() => toggle(u)}>
              <Avatar user={u} online={onlineUsers.includes(u.id)} size={36} />
              <div>
                <div className="modal-item-name">{u.displayName}</div>
                <div className="modal-item-sub">@{u.username}</div>
              </div>
              {selected.find(s => s.id === u.id) && <span className="check">✓</span>}
            </button>
          ))}
        </div>

        {error && <div className="auth-error" style={{ margin: '0 16px' }}>{error}</div>}

        <button className="modal-submit" disabled={!name.trim() || selected.length === 0} onClick={handleCreate}>
          Создать группу
        </button>
      </div>
    </div>
  );
}
