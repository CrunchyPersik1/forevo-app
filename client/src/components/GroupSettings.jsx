import { useState, useRef, useEffect } from 'react';
import Avatar from './Avatar';
import { api } from '../api';
import { compressAvatar } from '../utils/avatar';

export default function GroupSettings({
  chat, user, onlineUsers, onClose, onUpdate, onLeave, onDelete,
}) {
  const [name, setName] = useState(chat.groupName || chat.name);
  const [members, setMembers] = useState(chat.members);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const searchTimerRef = useRef(null);

  const canEdit = chat.isAdmin || chat.isCreator;

  const handleSearch = (q) => {
    setQuery(q);
    clearTimeout(searchTimerRef.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await api.searchUsers(q);
        setSearchResults(results.filter(u => !members.find(m => m.id === u.id)));
      } catch { setSearchResults([]); }
    }, 300);
  };

  useEffect(() => () => clearTimeout(searchTimerRef.current), []);

  const handleSaveName = async () => {
    if (!name.trim() || name === chat.groupName) return;
    setLoading(true);
    try {
      const updated = await api.updateGroup(chat.id, { name: name.trim() });
      onUpdate(updated);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarLoading(true);
    try {
      const compressed = await compressAvatar(file);
      const updated = await api.uploadGroupAvatar(chat.id, compressed);
      onUpdate(updated);
    } catch (err) { setError(err.message); }
    finally { setAvatarLoading(false); e.target.value = ''; }
  };

  const handleAddMember = async (userId) => {
    setLoading(true);
    try {
      await api.addMember(chat.id, userId);
      const updated = await api.getChat(chat.id);
      setMembers(updated.members);
      onUpdate(updated);
      setQuery('');
      setSearchResults([]);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleRemove = async (userId) => {
    if (!confirm('Удалить участника из группы?')) return;
    setLoading(true);
    try {
      await api.removeMember(chat.id, userId);
      const updated = await api.getChat(chat.id);
      setMembers(updated.members);
      onUpdate(updated);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleMakeAdmin = async (userId) => {
    setLoading(true);
    try {
      await api.assignAdmin(chat.id, userId);
      const updated = await api.getChat(chat.id);
      setMembers(updated.members);
      onUpdate(updated);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleLeave = async () => {
    if (!confirm('Выйти из группы?')) return;
    setLoading(true);
    try {
      await api.leaveGroup(chat.id);
      onLeave(chat.id);
      onClose();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Удалить группу? Это действие необратимо.')) return;
    setLoading(true);
    try {
      await api.deleteGroup(chat.id);
      onDelete(chat.id);
      onClose();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal group-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Настройки группы</h3>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="profile-avatar-section">
          <div
            className={`profile-avatar-upload ${!canEdit ? 'disabled' : ''}`}
            onClick={() => canEdit && !avatarLoading && fileRef.current?.click()}
          >
            <Avatar user={{ displayName: name, avatar: chat.groupAvatar || chat.avatar, id: chat.id, isGroup: true }} size={80} lazy={false} />
            {avatarLoading && <div className="avatar-loading-overlay"><div className="spinner small" /></div>}
            {canEdit && <span className="avatar-upload-hint">Аватар группы</span>}
          </div>
          {canEdit && <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleAvatar} />}
        </div>

        {canEdit ? (
          <div className="profile-form">
            <label>Название группы</label>
            <div className="username-row">
              <input value={name} onChange={e => setName(e.target.value)} />
              <button type="button" className="check-btn" onClick={handleSaveName} disabled={loading}>Сохранить</button>
            </div>
          </div>
        ) : (
          <div className="profile-form"><h3 style={{ padding: '0 4px' }}>{name}</h3></div>
        )}

        <div className="group-members-section">
          <h4>Участники ({members.length})</h4>
          {canEdit && (
            <input
              className="modal-search"
              placeholder="Добавить участника..."
              value={query}
              onChange={e => handleSearch(e.target.value)}
            />
          )}
          {searchResults.map(u => (
            <button key={u.id} className="modal-item" onClick={() => handleAddMember(u.id)}>
              <Avatar user={u} online={onlineUsers.includes(u.id)} size={32} />
              <div>
                <div className="modal-item-name">{u.displayName}</div>
                <div className="modal-item-sub">@{u.username}</div>
              </div>
            </button>
          ))}
          <div className="modal-list">
            {members.map(m => (
              <div key={m.id} className="modal-item member-row">
                <Avatar user={m} online={onlineUsers.includes(m.id)} size={36} />
                <div className="member-info">
                  <div className="modal-item-name">
                    {m.displayName}
                    {chat.createdBy === m.id && <span className="badge">создатель</span>}
                    {chat.admins?.includes(m.id) && chat.createdBy !== m.id && <span className="badge">админ</span>}
                  </div>
                  <div className="modal-item-sub">@{m.username}</div>
                </div>
                {canEdit && m.id !== user.id && m.id !== chat.createdBy && (
                  <div className="member-actions">
                    {chat.isCreator && !chat.admins?.includes(m.id) && (
                      <button className="text-btn" onClick={() => handleMakeAdmin(m.id)} title="Сделать админом">👑</button>
                    )}
                    <button className="text-btn danger" onClick={() => handleRemove(m.id)} title="Удалить">✕</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {error && <div className="auth-error" style={{ margin: '0 16px' }}>{error}</div>}

        <button className="logout-btn" onClick={handleLeave} disabled={loading}>Выйти из группы</button>
        {canEdit && (
          <button className="logout-btn danger-fill" onClick={handleDelete} disabled={loading}>
            Удалить группу
          </button>
        )}
      </div>
    </div>
  );
}
