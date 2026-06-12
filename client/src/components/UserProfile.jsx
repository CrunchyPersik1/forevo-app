import { useState, useEffect } from 'react';
import Avatar from './Avatar';
import { api } from '../api';
import { formatLastSeen, formatRegistrationDate } from '../utils';

export default function UserProfile({
  userId, currentUser, onlineUsers, chats, onClose, onOpenChat, onBlockChange,
}) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const isSelf = userId === currentUser.id;
  const isOnline = onlineUsers.includes(userId);
  const existingChat = chats.find(c =>
    c.type === 'direct' && c.members.some(m => m.id === userId)
  );

  useEffect(() => {
    setLoading(true);
    api.getUser(userId)
      .then(setProfile)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  const handleMessage = async () => {
    setActionLoading(true);
    try {
      const chat = existingChat || await api.createDirect(userId);
      onOpenChat(chat);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleBlock = async () => {
    setActionLoading(true);
    try {
      if (profile.iBlocked) {
        await api.unblockUser(userId);
        setProfile(p => ({ ...p, iBlocked: false, isBlocked: false }));
      } else {
        if (!confirm('Заблокировать пользователя? Вы не сможете обмениваться сообщениями.')) {
          setActionLoading(false);
          return;
        }
        await api.blockUser(userId);
        setProfile(p => ({ ...p, iBlocked: true, isBlocked: true }));
      }
      onBlockChange?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal profile-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-empty"><div className="spinner" /></div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal profile-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-empty">{error || 'Пользователь не найден'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal profile-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Профиль</h3>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="profile-avatar-section">
          <Avatar user={profile} size={96} online={isOnline} lazy={false} />
          <h3>{profile.displayName}</h3>
          <p>@{profile.username}</p>
          <p className="profile-status">
            {isOnline ? 'в сети' : formatLastSeen(profile.lastSeen)}
          </p>
          {profile.bio && <p className="profile-bio">{profile.bio}</p>}
          <p className="profile-joined">На сайте с {formatRegistrationDate(profile.createdAt)}</p>
        </div>

        {error && <div className="auth-error" style={{ margin: '0 20px' }}>{error}</div>}

        {!isSelf && (
          <div className="profile-actions">
            <button className="modal-submit" onClick={handleMessage} disabled={actionLoading || profile.isBlocked}>
              {existingChat ? 'Открыть чат' : 'Написать сообщение'}
            </button>
            <button
              className={`block-btn ${profile.iBlocked ? 'unblock' : ''}`}
              onClick={handleBlock}
              disabled={actionLoading}
            >
              {profile.iBlocked ? 'Разблокировать' : 'Заблокировать'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
