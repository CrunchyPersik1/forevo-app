import { useState, useRef } from 'react';
import Avatar from './Avatar';
import { api } from '../api';
import { compressAvatar } from '../utils/avatar';
import { validateUsername, formatRegistrationDate } from '../utils';

const BIO_MAX = 150;

export default function Profile({ user, onSave, onLogout, onClose }) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio || '');
  const [avatarUser, setAvatarUser] = useState(user);
  const [saving, setSaving] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState(null);
  const [usernameError, setUsernameError] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const handleCheckUsername = async () => {
    const err = validateUsername(username);
    if (err) { setUsernameError(err); setUsernameStatus(null); return; }
    if (username === user.username) { setUsernameStatus('current'); setUsernameError(''); return; }
    try {
      const res = await api.checkUsername(username);
      setUsernameStatus(res.available ? 'available' : 'taken');
      setUsernameError(res.available ? '' : 'Имя пользователя занято');
    } catch (e) {
      setUsernameError(e.message);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarLoading(true);
    setError('');
    try {
      const compressed = await compressAvatar(file);
      const updated = await api.uploadAvatar(compressed);
      setAvatarUser(updated);
      await onSave(updated, { silent: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setAvatarLoading(false);
      e.target.value = '';
    }
  };

  const handleDeleteAvatar = async () => {
    if (!confirm('Удалить аватарку?')) return;
    setAvatarLoading(true);
    try {
      const updated = await api.deleteAvatar();
      setAvatarUser(updated);
      await onSave(updated, { silent: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      let updated = avatarUser;
      if (username !== user.username) {
        updated = await api.changeUsername(username);
        setAvatarUser(updated);
      }
      try {
        updated = await api.updateProfile({ displayName, bio });
      } catch (profileErr) {
        if (username !== user.username) {
          try { await api.changeUsername(user.username); } catch {}
        }
        throw profileErr;
      }
      setAvatarUser(updated);
      await onSave(updated);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal profile-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Настройки профиля</h3>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="profile-avatar-section">
          <div className="profile-avatar-upload" onClick={() => !avatarLoading && fileRef.current?.click()}>
            <Avatar user={avatarUser} size={96} lazy={false} />
            {avatarLoading && <div className="avatar-loading-overlay"><div className="spinner small" /></div>}
            <span className="avatar-upload-hint">Загрузить аватар</span>
          </div>
          <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleAvatarUpload} />
          {avatarUser.avatar && (
            <button className="text-btn danger" onClick={handleDeleteAvatar} disabled={avatarLoading}>
              Удалить аватар
            </button>
          )}
          <p className="profile-joined">На сайте с {formatRegistrationDate(user.createdAt)}</p>
        </div>

        <div className="profile-form">
          <label>Отображаемое имя</label>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} />

          <label>Имя пользователя</label>
          <div className="username-row">
            <input
              value={username}
              onChange={e => { setUsername(e.target.value.toLowerCase()); setUsernameStatus(null); setUsernameError(''); }}
              placeholder="username"
            />
            <button type="button" className="check-btn" onClick={handleCheckUsername}>Проверить</button>
          </div>
          {usernameStatus === 'available' && <span className="field-ok">✓ Доступно</span>}
          {usernameError && <span className="field-error">{usernameError}</span>}
          <small className="field-hint">Можно менять не чаще 1 раза в 30 дней</small>

          <label>О себе ({bio.length}/{BIO_MAX})</label>
          <textarea
            value={bio}
            onChange={e => setBio(e.target.value.slice(0, BIO_MAX))}
            rows={3}
            placeholder="Расскажите о себе..."
          />

          <label className="toggle-row">
            <span>Email-уведомления</span>
            <input
              type="checkbox"
              checked={avatarUser.emailNotifications !== false}
              onChange={async (e) => {
                try {
                  const updated = await api.updateNotifications(e.target.checked);
                  setAvatarUser(updated);
                  await onSave(updated, { silent: true });
                } catch {}
              }}
            />
          </label>
        </div>

        {error && <div className="auth-error" style={{ margin: '0 20px' }}>{error}</div>}

        <button className="modal-submit" onClick={handleSave} disabled={saving || avatarLoading}>
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
        <button className="logout-btn" onClick={onLogout}>Выйти из аккаунта</button>
      </div>
    </div>
  );
}
