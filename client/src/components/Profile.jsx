import { useState, useRef, useEffect } from 'react';
import Avatar from './Avatar';
import Icon from './Icon';
import { api } from '../api';
import { compressAvatar } from '../utils/avatar';
import { validateUsername, formatRegistrationDate } from '../utils';

const BIO_MAX = 150;

const THEMES = [
  { id: 'dark-purple', name: 'Фиолетовая', preview: 'linear-gradient(135deg, #0f0f14, #6c5ce7)' },
  { id: 'dark-blue', name: 'Синяя', preview: 'linear-gradient(135deg, #0d1117, #2196f3)' },
  { id: 'dark-green', name: 'Зелёная', preview: 'linear-gradient(135deg, #0e1621, #00a884)' },
  { id: 'dark', name: 'Тёмная', preview: 'linear-gradient(135deg, #0a0a0a, #1a1a1a)' },
  { id: 'light-purple', name: 'Светлая', preview: 'linear-gradient(135deg, #ffffff, #6c5ce7)' },
  { id: 'light-blue', name: 'Светлая синяя', preview: 'linear-gradient(135deg, #ffffff, #2196f3)' },
  { id: 'light-green', name: 'Светлая зелёная', preview: 'linear-gradient(135deg, #ffffff, #00a884)' },
  { id: 'light', name: 'Светлая', preview: 'linear-gradient(135deg, #ffffff, #f0f0f0)' },
];

const GRADIENTS = [
  { id: 'grad-1', colors: 'linear-gradient(135deg, #667eea, #764ba2)' },
  { id: 'grad-2', colors: 'linear-gradient(135deg, #f093fb, #f5576c)' },
  { id: 'grad-3', colors: 'linear-gradient(135deg, #4facfe, #00f2fe)' },
  { id: 'grad-4', colors: 'linear-gradient(135deg, #43e977, #38f9d7)' },
  { id: 'grad-5', colors: 'linear-gradient(135deg, #fa709a, #fee140)' },
  { id: 'grad-6', colors: 'linear-gradient(135deg, #a18cd1, #fbc2eb)' },
  { id: 'grad-7', colors: 'linear-gradient(135deg, #ffecd2, #fcb69f)' },
  { id: 'grad-8', colors: 'linear-gradient(135deg, #ff9a9e, #fecfef)' },
];

function FloatingEmojis() {
  const emojis = ['✨', '💫', '⭐', '🌟', '💖', '💜', '🔮', '💎'];
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

export function playProfileSound(soundId) {
  if (!soundId || soundId === 0) return;
  const freqs = { 1: 523, 2: 880, 3: 330, 4: 1047, 5: 440 };
  const freq = freqs[soundId];
  if (!freq) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.value = 0.12;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.stop(ctx.currentTime + 0.5);
  } catch {}
}

export default function Profile({ user, onSave, onLogout, onClose, theme, onSetTheme, notifEnabled, onEnableNotifications, onDisableNotifications }) {
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
  const [myNfts, setMyNfts] = useState([]);
  const fileRef = useRef(null);

  useEffect(() => {
    if (user.profileSound) playProfileSound(user.profileSound);
  }, []);

  const handleCheckUsername = async () => {
    const err = validateUsername(username);
    if (err) { setUsernameError(err); setUsernameStatus(null); return; }
    if (username === user.username) { setUsernameStatus('current'); setUsernameError(''); return; }
    try {
      const res = await api.checkUsername(username);
      setUsernameStatus(res.available ? 'available' : 'taken');
      setUsernameError(res.available ? '' : 'Имя занято');
    } catch (e) { setUsernameError(e.message); }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarLoading(true);
    try {
      const compressed = await compressAvatar(file);
      const updated = await api.uploadAvatar(compressed);
      setAvatarUser(updated);
      await onSave(updated, { silent: true });
    } catch (err) { setError(err.message); }
    finally { setAvatarLoading(false); e.target.value = ''; }
  };

  const handleDeleteAvatar = async () => {
    if (!confirm('Удалить аватар?')) return;
    setAvatarLoading(true);
    try {
      const updated = await api.deleteAvatar();
      setAvatarUser(updated);
      await onSave(updated, { silent: true });
    } catch (err) { setError(err.message); }
    finally { setAvatarLoading(false); }
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
      try { updated = await api.updateProfile({ displayName, bio }); }
      catch (e) { if (username !== user.username) try { await api.changeUsername(user.username); } catch {} throw e; }
      setAvatarUser(updated);
      await onSave(updated);
      setScreen('view');
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const gradientObj = GRADIENTS.find(g => g.id === avatarUser.profileGradient);

  if (screen === 'view') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal profile-modal" onClick={e => e.stopPropagation()} style={{ position: 'relative', overflow: 'hidden' }}>
          {gradientObj && <div className="profile-gradient" style={{ background: gradientObj.colors }} />}
          <FloatingEmojis />

          <div className="profile-header">
            <div className="profile-avatar-section">
              <div className="profile-avatar-ring">
                <Avatar user={avatarUser} size={110} lazy={false} />
              </div>
              <h3 className="profile-name">{avatarUser.displayName}</h3>
              <p className="profile-username">@{avatarUser.username}</p>
              <div className="profile-status-row">
                <span className={`status-dot ${avatarUser.userStatus || 'online'}`} />
                <span>{avatarUser.userStatus === 'dnd' ? 'Не беспокоить' : avatarUser.userStatus === 'offline' ? 'Оффлайн' : 'В сети'}</span>
              </div>
            </div>
          </div>

          <div className="profile-content">
            <div className="profile-card">
              <div className="profile-card-row">
                <Icon name="user" size={18} />
                <span>ID: {user.id?.slice(0, 8)}...</span>
              </div>
              <div className="profile-card-row">
                <Icon name="globe" size={18} />
                <span>На сайте с {formatRegistrationDate(user.createdAt)}</span>
              </div>
              {avatarUser.bio && (
                <div className="profile-card-row">
                  <Icon name="mail" size={18} />
                  <span>{avatarUser.bio}</span>
                </div>
              )}
            </div>

            <div className="profile-actions">
              <button className="profile-action-btn primary" onClick={() => setScreen('edit')}>
                <Icon name="pencil" size={18} /> Изменить профиль
              </button>
              <button className="profile-action-btn" onClick={() => setScreen('custom')}>
                <Icon name="settings" size={18} /> Кастомизация
              </button>
            </div>

            <button className="profile-logout" onClick={onLogout}>
              <Icon name="lock" size={18} /> Выйти из аккаунта
            </button>

            <div className="profile-legal">
              <button className="legal-link" onClick={() => setScreen('terms')}>Условия</button>
              <button className="legal-link" onClick={() => setScreen('privacy')}>Конфиденциальность</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'edit') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal profile-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <button onClick={() => setScreen('view')}><Icon name="arrow-left" size={20} /></button>
            <h3>Изменить профиль</h3>
            <div style={{ width: 32 }} />
          </div>

          <div className="profile-avatar-section">
            <div className="profile-avatar-upload" onClick={() => !avatarLoading && fileRef.current?.click()}>
              <Avatar user={avatarUser} size={96} lazy={false} />
              {avatarLoading && <div className="avatar-loading-overlay"><div className="spinner small" /></div>}
              <span className="avatar-upload-hint">Загрузить аватар</span>
            </div>
            <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleAvatarUpload} />
            {avatarUser.avatar && <button className="text-btn danger" onClick={handleDeleteAvatar}>Удалить аватар</button>}
          </div>

          <div className="profile-form">
            <label>Имя</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} />
            <label>Юзернейм</label>
            <div className="username-row">
              <input value={username} onChange={e => { setUsername(e.target.value.toLowerCase()); setUsernameStatus(null); setUsernameError(''); }} placeholder="username" />
              <button className="check-btn" onClick={handleCheckUsername}>Проверить</button>
            </div>
            {usernameStatus === 'available' && <span className="field-ok">✓ Доступно</span>}
            {usernameError && <span className="field-error">{usernameError}</span>}
            <label>О себе ({bio.length}/{BIO_MAX})</label>
            <textarea value={bio} onChange={e => setBio(e.target.value.slice(0, BIO_MAX))} rows={3} placeholder="Расскажите о себе..." />
          </div>

          {error && <div className="auth-error" style={{ margin: '0 20px' }}>{error}</div>}
          <button className="modal-submit" onClick={handleSave} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
        </div>
      </div>
    );
  }

  if (screen === 'custom') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal profile-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <button onClick={() => setScreen('view')}><Icon name="arrow-left" size={20} /></button>
            <h3>Кастомизация</h3>
            <div style={{ width: 32 }} />
          </div>

          <div className="profile-form">
            <label>Тема</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
              {THEMES.map(t => (
                <button key={t.id} onClick={() => onSetTheme(t.id)}
                  style={{ padding: '12px 4px', background: theme === t.id ? 'var(--accent-subtle)' : 'var(--bg-tertiary)', border: theme === t.id ? '2px solid var(--accent)' : '2px solid var(--border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'center' }}>
                  <div style={{ width: '100%', height: 28, borderRadius: 6, background: t.preview, marginBottom: 4 }} />
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{t.name}</span>
                </button>
              ))}
            </div>

            <label>Фон профиля</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
              {GRADIENTS.map(g => (
                <button key={g.id} style={{ height: 36, borderRadius: 8, background: g.colors, border: avatarUser.profileGradient === g.id ? '3px solid var(--text-primary)' : '3px solid transparent', cursor: 'pointer' }}
                  onClick={async () => { try { const u = await api.updateGradient(g.id); setAvatarUser(u); await onSave(u, { silent: true }); } catch {} }} />
              ))}
              {avatarUser.profileGradient && (
                <button style={{ height: 36, borderRadius: 8, background: 'var(--bg-tertiary)', border: '2px solid var(--border)', cursor: 'pointer', fontSize: 14, color: 'var(--text-secondary)' }}
                  onClick={async () => { try { const u = await api.updateGradient(null); setAvatarUser(u); await onSave(u, { silent: true }); } catch {} }}>✕</button>
              )}
            </div>

            <label>Звук профиля</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {[{ id: 0, name: 'Нет' }, { id: 1, name: 'Мелодия' }, { id: 2, name: 'Звон' }, { id: 3, name: 'Тихий' }, { id: 4, name: 'Яркий' }, { id: 5, name: 'Мягкий' }].map(s => (
                <button key={s.id} className={`status-option ${avatarUser.profileSound === s.id ? 'active' : ''}`}
                  onClick={() => { if (s.id) playProfileSound(s.id); api.updateSound(s.id).then(u => { setAvatarUser(u); onSave(u, { silent: true }); }); }}>
                  {s.name}
                </button>
              ))}
            </div>

            <label>Цвет ника</label>
            <div className="color-picker-row">
              {['#ff6b6b', '#ffa502', '#ffd93d', '#6bcb77', '#4d96ff', '#6c5ce7', '#e84393', '#00cec9'].map(c => (
                <button key={c} className={`color-dot ${avatarUser.nicknameColor === c ? 'active' : ''}`} style={{ background: c }}
                  onClick={async () => { try { const u = await api.updateNicknameColor(c); setAvatarUser(u); await onSave(u, { silent: true }); } catch {} }} />
              ))}
              <button className={`color-dot ${avatarUser.nicknameColor === 'gradient' ? 'active' : ''}`}
                style={{ background: 'linear-gradient(135deg, #6c5ce7, #e84393)' }}
                onClick={async () => { try { const u = await api.updateNicknameColor('gradient'); setAvatarUser(u); await onSave(u, { silent: true }); } catch {} }} />
              {avatarUser.isModerator && (
                <button className={`color-dot ${avatarUser.nicknameColor === 'rainbow' ? 'active' : ''}`}
                  style={{ background: 'linear-gradient(90deg, red, orange, yellow, green, blue, violet)' }}
                  onClick={async () => { try { const u = await api.updateNicknameColor('rainbow'); setAvatarUser(u); await onSave(u, { silent: true }); } catch {} }} />
              )}
              {avatarUser.nicknameColor && (
                <button className="color-dot clear" onClick={async () => { try { const u = await api.updateNicknameColor(null); setAvatarUser(u); await onSave(u, { silent: true }); } catch {} }}>✕</button>
              )}
            </div>

            <label>Эмодзи на аватарку</label>
            <div className="emoji-picker-row">
              {['👑', '🔥', '💎', '🎮', '🎵', '💀', '🤖', '⭐', '❤️', '🚀', '🦋', '🌸'].map(e => (
                <button key={e} className={`emoji-dot ${avatarUser.avatarEmoji === e ? 'active' : ''}`}
                  onClick={async () => { try { const u = await api.updateAvatarEmoji(e); setAvatarUser(u); await onSave(u, { silent: true }); } catch {} }}>{e}</button>
              ))}
              {avatarUser.avatarEmoji && (
                <button className="emoji-dot clear" onClick={async () => { try { const u = await api.updateAvatarEmoji(null); setAvatarUser(u); await onSave(u, { silent: true }); } catch {} }}>✕</button>
              )}
            </div>

            <label>Статус</label>
            <div className="status-selector">
              {[{ id: 'online', label: '🟢 В сети', dot: 'online' }, { id: 'dnd', label: '🔴 Не беспокоить', dot: 'dnd' }, { id: 'offline', label: '⚪ Оффлайн', dot: 'offline' }].map(s => (
                <button key={s.id} className={`status-option ${avatarUser.userStatus === s.id ? 'active' : ''}`}
                  onClick={async () => { try { const u = await api.updateStatus(s.id); setAvatarUser(u); await onSave(u, { silent: true }); } catch {} }}>
                  <span className={`status-dot ${s.dot}`} />{s.label}
                </button>
              ))}
            </div>

            <label className="toggle-row">
              <span>Email-уведомления</span>
              <input type="checkbox" checked={avatarUser.emailNotifications !== false}
                onChange={async (e) => { try { const u = await api.updateNotifications(e.target.checked); setAvatarUser(u); await onSave(u, { silent: true }); } catch {} }} />
            </label>
            <label className="toggle-row">
              <span>Push-уведомления</span>
              <input type="checkbox" checked={notifEnabled}
                onChange={async (e) => { if (e.target.checked) { const ok = await onEnableNotifications(); if (!ok) alert('Не удалось включить'); } else { await onDisableNotifications(); } }} />
            </label>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
