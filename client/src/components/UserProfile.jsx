import { useState, useEffect } from 'react';
import Avatar from './Avatar';
import { api } from '../api';
import { formatLastSeen, formatRegistrationDate } from '../utils';
import { playProfileSound } from './Profile';

const RARITY_COLORS = { common: '#8b949e', rare: '#2196f3', epic: '#9c27b0', legendary: '#ff9800', exclusive: '#ffd700' };

export default function UserProfile({
  userId, currentUser, onlineUsers, chats, onClose, onOpenChat, onBlockChange,
}) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [userNfts, setUserNfts] = useState([]);

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
    api.getMyNfts(userId).then(setUserNfts).catch(() => {});
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
          <h3
            className={profile.nicknameColor === 'rainbow' ? 'nickname-rainbow' : profile.nicknameColor === 'gradient' ? 'nickname-gradient' : ''}
            style={profile.nicknameColor && profile.nicknameColor !== 'rainbow' && profile.nicknameColor !== 'gradient' ? { color: profile.nicknameColor } : undefined}
          >
            {profile.isModerator && <span className="mod-badge">⭐</span>}
            {profile.displayName}
          </h3>
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

        {userNfts.length > 0 && (
          <div className="nft-collection" style={{ padding: '0 20px 16px' }}>
            <h4>Коллекция ({userNfts.length})</h4>
            <div className="nft-scroll">
              {userNfts.map(nft => (
                <div key={nft.id} className="nft-card">
                  <div className="nft-card-emoji">{nft.emoji}</div>
                  <div className="nft-card-name">{nft.name}</div>
                  <div className={`nft-card-rarity ${nft.rarity}`}>{nft.rarity === 'exclusive' ? '★' : nft.rarity}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
