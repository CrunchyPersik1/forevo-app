import { useState, useRef } from 'react';
import Avatar from './Avatar';
import { api } from '../api';
import { compressAvatar } from '../utils/avatar';
import { validateUsername, formatRegistrationDate } from '../utils';

const BIO_MAX = 150;

const THEMES = [
  { id: 'dark-purple', name: 'Фиолетовая (тёмная)', preview: 'linear-gradient(135deg, #0f0f14, #6c5ce7)' },
  { id: 'dark-blue', name: 'Синяя (тёмная)', preview: 'linear-gradient(135deg, #0d1117, #2196f3)' },
  { id: 'dark-green', name: 'Зелёная (тёмная)', preview: 'linear-gradient(135deg, #0e1621, #00a884)' },
  { id: 'light-purple', name: 'Фиолетовая (светлая)', preview: 'linear-gradient(135deg, #ffffff, #6c5ce7)' },
  { id: 'light-blue', name: 'Синяя (светлая)', preview: 'linear-gradient(135deg, #ffffff, #2196f3)' },
  { id: 'light-green', name: 'Зелёная (светлая)', preview: 'linear-gradient(135deg, #ffffff, #00a884)' },
];

export default function Profile({ user, onSave, onLogout, onClose, theme, onSetTheme }) {
  const [screen, setScreen] = useState('view');
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
      setScreen('view');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (screen === 'view') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal profile-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Профиль</h3>
            <button onClick={onClose}>✕</button>
          </div>

          <div className="profile-avatar-section">
            <Avatar user={avatarUser} size={96} lazy={false} />
            <h3 style={{ marginTop: 12, fontSize: 20, fontWeight: 600 }}>{avatarUser.displayName}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>@{avatarUser.username}</p>
            <p className="profile-joined">На сайте с {formatRegistrationDate(user.createdAt)}</p>
          </div>

          <div style={{ padding: '12px 20px' }}>
            <button className="modal-submit" style={{ width: '100%', margin: 0, marginBottom: 8 }} onClick={() => setScreen('edit')}>
              ✏️ Изменить профиль
            </button>
            <button className="modal-submit" style={{ width: '100%', margin: 0, marginBottom: 8, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} onClick={() => setScreen('custom')}>
              🎨 Кастомизация
            </button>
          </div>

          <button className="logout-btn" onClick={onLogout}>Выйти из аккаунта</button>
        </div>
      </div>
    );
  }

  if (screen === 'edit') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal profile-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <button onClick={() => setScreen('view')}>←</button>
            <h3>Изменить профиль</h3>
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
          </div>

          {error && <div className="auth-error" style={{ margin: '0 20px' }}>{error}</div>}

          <button className="modal-submit" onClick={handleSave} disabled={saving || avatarLoading}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'custom') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal profile-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <button onClick={() => setScreen('view')}>←</button>
            <h3>Кастомизация</h3>
            <button onClick={onClose}>✕</button>
          </div>

          <div className="profile-form">
            <label>Тема оформления</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => onSetTheme(t.id)}
                  style={{
                    padding: '12px 8px',
                    background: theme === t.id ? 'var(--accent-subtle)' : 'var(--bg-tertiary)',
                    border: theme === t.id ? '2px solid var(--accent)' : '2px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ width: '100%', height: 32, borderRadius: 8, background: t.preview, marginBottom: 6 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t.name}</span>
                </button>
              ))}
            </div>

            <label>Цвет ника</label>
            <div className="color-picker-row">
              {['#ff6b6b', '#ffa502', '#ffd93d', '#6bcb77', '#4d96ff', '#6c5ce7', '#e84393', '#00cec9'].map(c => (
                <button key={c} className={`color-dot ${avatarUser.nicknameColor === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={async () => {
                    try {
                      const updated = await api.updateNicknameColor(c);
                      setAvatarUser(updated);
                      await onSave(updated, { silent: true });
                    } catch (e) { alert(e.message); }
                  }} />
              ))}
              <button className={`color-dot ${avatarUser.nicknameColor === 'gradient' ? 'active' : ''}`}
                style={{ background: 'linear-gradient(135deg, #6c5ce7, #e84393)' }}
                onClick={async () => {
                  try {
                    const updated = await api.updateNicknameColor('gradient');
                    setAvatarUser(updated);
                    await onSave(updated, { silent: true });
                  } catch (e) { alert(e.message); }
                }} />
              {avatarUser.isModerator && (
                <button className={`color-dot ${avatarUser.nicknameColor === 'rainbow' ? 'active' : ''}`}
                  style={{ background: 'linear-gradient(90deg, red, orange, yellow, green, blue, violet)' }}
                  onClick={async () => {
                    try {
                      const updated = await api.updateNicknameColor('rainbow');
                      setAvatarUser(updated);
                      await onSave(updated, { silent: true });
                    } catch (e) { alert(e.message); }
                  }} />
              )}
              {avatarUser.nicknameColor && (
                <button className="color-dot clear" onClick={async () => {
                  try {
                    const updated = await api.updateNicknameColor(null);
                    setAvatarUser(updated);
                    await onSave(updated, { silent: true });
                  } catch {}
                }}>✕</button>
              )}
            </div>

            <label>Эмодзи на аватарку</label>
            <div className="emoji-picker-row">
              {['👑', '🔥', '💎', '🎮', '🎵', '💀', '🤖', '⭐', '❤️', '🚀', '🦋', '🌸'].map(e => (
                <button key={e} className={`emoji-dot ${avatarUser.avatarEmoji === e ? 'active' : ''}`}
                  onClick={async () => {
                    try {
                      const updated = await api.updateAvatarEmoji(e);
                      setAvatarUser(updated);
                      await onSave(updated, { silent: true });
                    } catch (err) { alert(err.message); }
                  }}>{e}</button>
              ))}
              {avatarUser.avatarEmoji && (
                <button className="emoji-dot clear" onClick={async () => {
                  try {
                    const updated = await api.updateAvatarEmoji(null);
                    setAvatarUser(updated);
                    await onSave(updated, { silent: true });
                  } catch {}
                }}>✕</button>
              )}
            </div>

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

            <label>Статус</label>
            <div className="status-selector">
              {[
                { id: 'online', label: '🟢 В сети', dot: 'online' },
                { id: 'dnd', label: '🔴 Не беспокоить', dot: 'dnd' },
                { id: 'offline', label: '⚪ Оффлайн', dot: 'offline' },
              ].map(s => (
                <button
                  key={s.id}
                  className={`status-option ${avatarUser.userStatus === s.id ? 'active' : ''}`}
                  onClick={async () => {
                    try {
                      const updated = await api.updateStatus(s.id);
                      setAvatarUser(updated);
                      await onSave(updated, { silent: true });
                    } catch (e) { alert(e.message); }
                  }}
                >
                  <span className={`status-dot ${s.dot}`} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
