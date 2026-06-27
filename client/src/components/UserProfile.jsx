import { useState, useEffect } from 'react';
import Avatar from './Avatar';
import Icon from './Icon';
import { api } from '../api';
import { formatLastSeen, formatRegistrationDate } from '../utils';
import { playProfileSound } from './Profile';

const FLOATING_EMOJIS_DEFAULT = ['✨', '💫', '⭐', '🌟', '💖', '💜', '🔮', '💎'];

function FloatingEmojis({ emojis }) {
  return (
    <div className="floating-emojis">
      {emojis.map((e, i) => (
        <span key={i} className="floating-emoji" style={{
          left: `${10 + Math.random() * 80}%`,
          animationDelay: `${i * 0.7}s`,
          animationDuration: `${4 + Math.random() * 3}s`,
        }}>{e}</span>
      ))}
    </div>
  );
}

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
      .then((p) => {
        setProfile(p);
        if (p.profileSound && !isSelf) playProfileSound(p.profileSound);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  const handleMessage = async () => {
    setActionLoading(true);
    try {
      const chat = existingChat || await api.createDirect(userId);
      onOpenChat(chat);
      onClose();
    } catch (e) { setError(e.message); }
    finally { setActionLoading(false); }
  };

  const handleBlock = async () => {
    setActionLoading(true);
    try {
      if (profile.iBlocked) {
        await api.unblockUser(userId);
        setProfile(p => ({ ...p, iBlocked: false, isBlocked: false }));
      } else {
        if (!confirm('Заблокировать пользователя?')) { setActionLoading(false); return; }
        await api.blockUser(userId);
        setProfile(p => ({ ...p, iBlocked: true, isBlocked: true }));
      }
      onBlockChange?.();
    } catch (e) { setError(e.message); }
    finally { setActionLoading(false); }
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
          <div className="modal-empty">{error || 'Не найдено'}</div>
        </div>
      </div>
    );
  }

  const emojis = profile.profileEmojis?.length ? profile.profileEmojis : FLOATING_EMOJIS_DEFAULT;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal profile-modal" onClick={e => e.stopPropagation()} style={{ position: 'relative', overflow: 'hidden' }}>
        <FloatingEmojis emojis={emojis} />

        <div className="profile-header">
          <div className="profile-avatar-section">
            <div className="profile-avatar-ring">
              <Avatar user={profile} size={110} online={isOnline} lazy={false} />
            </div>
            <h3 className="profile-name">
              {profile.isModerator && <span className="mod-badge">⭐</span>}
              {profile.displayName}
              <span className="verification-badge" title="Верифицирован">✓</span>
            </h3>
            <p className="profile-username">@{profile.username}</p>
            <div className="profile-status-row">
              <span className={`status-dot ${profile.userStatus || 'online'}`} />
              <span>{isOnline ? 'в сети' : formatLastSeen(profile.lastSeen)}</span>
            </div>
          </div>
        </div>

        <div className="profile-content">
          <div className="profile-card">
            <div className="profile-card-row">
              <Icon name="globe" size={18} />
              <span>На сайте с {formatRegistrationDate(profile.createdAt)}</span>
            </div>
            {profile.bio && (
              <div className="profile-card-row">
                <Icon name="mail" size={18} />
                <span>{profile.bio}</span>
              </div>
            )}
          </div>

          {!isSelf && (
            <div className="profile-actions">
              <button className="profile-action-btn primary" onClick={handleMessage} disabled={actionLoading || profile.isBlocked}>
                <Icon name="message-square" size={18} /> Написать
              </button>
              <button className="profile-action-btn" onClick={handleBlock} disabled={actionLoading}>
                <Icon name="shield" size={18} /> {profile.iBlocked ? 'Разблокировать' : 'Заблокировать'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
