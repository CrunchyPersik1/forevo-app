import { useState, useRef, useEffect } from 'react';
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

const GRADIENTS = [
  { id: 'grad-1', colors: 'linear-gradient(135deg, #667eea, #764ba2)' },
  { id: 'grad-2', colors: 'linear-gradient(135deg, #f093fb, #f5576c)' },
  { id: 'grad-3', colors: 'linear-gradient(135deg, #4facfe, #00f2fe)' },
  { id: 'grad-4', colors: 'linear-gradient(135deg, #43e97b, #38f9d7)' },
  { id: 'grad-5', colors: 'linear-gradient(135deg, #fa709a, #fee140)' },
  { id: 'grad-6', colors: 'linear-gradient(135deg, #a18cd1, #fbc2eb)' },
  { id: 'grad-7', colors: 'linear-gradient(135deg, #ffecd2, #fcb69f)' },
  { id: 'grad-8', colors: 'linear-gradient(135deg, #ff9a9e, #fecfef)' },
];

const SOUNDS = [
  { id: 0, name: 'Без звука', freq: 0 },
  { id: 1, name: 'Мелодия', freq: 523 },
  { id: 2, name: 'Звон', freq: 880 },
  { id: 3, name: 'Тихий', freq: 330 },
  { id: 4, name: 'Яркий', freq: 1047 },
  { id: 5, name: 'Мягкий', freq: 440 },
];

export function playProfileSound(soundId) {
  const sound = SOUNDS.find(s => s.id === soundId);
  if (!sound || !sound.freq) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = sound.freq;
    osc.type = 'sine';
    gain.gain.value = 0.12;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.stop(ctx.currentTime + 0.5);
  } catch {}
}

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

  const gradientObj = GRADIENTS.find(g => g.id === avatarUser.profileGradient);

  if (screen === 'view') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal profile-modal" onClick={e => e.stopPropagation()} style={{ position: 'relative', overflow: 'hidden' }}>
          {gradientObj && <div className="profile-gradient" style={{ background: gradientObj.colors }} />}

          <div className="modal-header" style={{ position: 'relative', zIndex: 1 }}>
            <h3>Профиль</h3>
            <button onClick={onClose}>✕</button>
          </div>

          <div className="profile-avatar-section" style={{ position: 'relative', zIndex: 1 }}>
            <Avatar user={avatarUser} size={96} lazy={false} />
            <h3 style={{ marginTop: 12, fontSize: 20, fontWeight: 600 }}>{avatarUser.displayName}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>@{avatarUser.username}</p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span className={`status-dot ${avatarUser.userStatus || 'online'}`} style={{ width: 10, height: 10 }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {avatarUser.userStatus === 'dnd' ? 'Не беспокоить' : avatarUser.userStatus === 'offline' ? 'Оффлайн' : 'В сети'}
              </span>
            </div>

            {avatarUser.badges?.length > 0 && (
              <div className="badge-list">
                {avatarUser.badges.map((b, i) => (
                  <span key={i} className="profile-badge">{b}</span>
                ))}
              </div>
            )}

            <p className="profile-joined">На сайте с {formatRegistrationDate(user.createdAt)}</p>
          </div>

          <div style={{ padding: '12px 20px', position: 'relative', zIndex: 1 }}>
            <button className="modal-submit" style={{ width: '100%', margin: 0, marginBottom: 8 }} onClick={() => setScreen('edit')}>
              ✏️ Изменить профиль
            </button>
            <button className="modal-submit" style={{ width: '100%', margin: 0, marginBottom: 8, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} onClick={() => setScreen('custom')}>
              🎨 Кастомизация
            </button>
          </div>

          <button className="logout-btn" onClick={onLogout}>Выйти из аккаунта</button>

          <div className="legal-links">
            <button className="legal-link" onClick={() => setScreen('terms')}>Условия использования</button>
            <button className="legal-link" onClick={() => setScreen('privacy')}>Политика конфиденциальности</button>
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

            <label>Фон профиля (градиент)</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
              {GRADIENTS.map(g => (
                <button key={g.id}
                  style={{
                    height: 40,
                    borderRadius: 8,
                    background: g.colors,
                    border: avatarUser.profileGradient === g.id ? '3px solid var(--text-primary)' : '3px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onClick={async () => {
                    try {
                      const updated = await api.updateGradient(g.id);
                      setAvatarUser(updated);
                      await onSave(updated, { silent: true });
                    } catch (e) { alert(e.message); }
                  }}
                />
              ))}
              {avatarUser.profileGradient && (
                <button style={{
                  height: 40,
                  borderRadius: 8,
                  background: 'var(--bg-tertiary)',
                  border: '2px solid var(--border)',
                  cursor: 'pointer',
                  fontSize: 14,
                  color: 'var(--text-secondary)',
                }} onClick={async () => {
                  try {
                    const updated = await api.updateGradient(null);
                    setAvatarUser(updated);
                    await onSave(updated, { silent: true });
                  } catch {}
                }}>✕</button>
              )}
            </div>

            <label>Звук профиля</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {SOUNDS.map(s => (
                <button key={s.id}
                  className={`sound-btn ${avatarUser.profileSound === s.id ? 'active' : ''}`}
                  style={avatarUser.profileSound === s.id ? { borderColor: 'var(--accent)', background: 'var(--accent-subtle)' } : undefined}
                  onClick={async () => {
                    if (s.freq) playProfileSound(s.id);
                    try {
                      const updated = await api.updateSound(s.id);
                      setAvatarUser(updated);
                      await onSave(updated, { silent: true });
                    } catch (e) { alert(e.message); }
                  }}
                >
                  {s.name}
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

            <label className="toggle-row">
              <span>Push-уведомления</span>
              <input
                type="checkbox"
                checked={typeof Notification !== 'undefined' && Notification.permission === 'granted'}
                onChange={async (e) => {
                  if (e.target.checked) {
                    if ('Notification' in window) {
                      const perm = await Notification.requestPermission();
                      if (perm === 'granted') {
                        try {
                          const reg = await navigator.serviceWorker?.ready;
                          if (reg) {
                            const { publicKey } = await api.getVapidKey();
                            if (publicKey) {
                              const sub = await reg.pushManager.subscribe({
                                userVisibleOnly: true,
                                applicationServerKey: publicKey,
                              });
                              await api.subscribePush({
                                endpoint: sub.endpoint,
                                keys: {
                                  p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')))),
                                  auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')))),
                                },
                              });
                            }
                          }
                        } catch (err) { console.error('Push subscribe error:', err); }
                      }
                    }
                  } else {
                    if ('Notification' in window) {
                      await Notification.requestPermission();
                    }
                  }
                }}
              />
            </label>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'terms') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal profile-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <button onClick={() => setScreen('view')}>←</button>
            <h3>Условия использования</h3>
            <button onClick={onClose}>✕</button>
          </div>
          <div className="legal-content">
            <h4>1. Общие положения</h4>
            <p>Использование мессенджера Forevo означает ваше согласие с данными условиями. Сервис предоставляется «как есть» без каких-либо гарантий.</p>

            <h4>2. Возрастные ограничения</h4>
            <p>Сервис доступен лицам от 14 лет. Регистрируясь, вы подтверждаете, что вам исполнилось 14 лет и вы имеете право пользоваться сервисом в соответствии с законодательством РФ.</p>

            <h4>3. Регистрация и аккаунт</h4>
            <p>При регистрации вы соглашаетесь указывать достоверную информацию. Запрещается создание фейковых аккаунтов для спама или мошенничества.</p>

            <h4>4. Использование сервиса</h4>
            <p>Запрещается:</p>
            <ul>
              <li>Рассылка спама и нежелательных сообщений</li>
              <li>Распространение вредоносного контента</li>
              <li>Нарушение прав других пользователей</li>
              <li>Попытки взлома или несанкционированного доступа</li>
              <li>Использование ботов без разрешения</li>
              <li>Распространение экстремистских материалов (ст. 282 УК РФ)</li>
              <li>Распространение порнографии с участием несовершеннолетних (ст. 242 УК РФ)</li>
              <li>Нарушение законодательства РФ о противодействии экстремизму (152-ФЗ)</li>
            </ul>

            <h4>5. Контент</h4>
            <p>Вы сохраняете права на контент, который публикуете. Однако, размещая контент в Forevo, вы даёте нам право на его хранение и отображение в рамках сервиса.</p>

            <h4>6. Жалобы</h4>
            <p>При нарушении условий использования вы можете пожаловаться на сообщение через контекстное меню. Администрация рассматривает жалобы и принимает меры.</p>

            <h4>7. Ответственность</h4>
            <p>Администрация Forevo не несёт ответственности за контент, размещённый пользователями. Мы оставляем за собой право удалять контент, нарушающий условия использования.</p>

            <h4>8. Изменения</h4>
            <p>Мы оставляем за собой право изменять данные условия. Продолжая использование сервиса, вы подтверждаете согласие с обновлёнными условиями.</p>

            <p className="legal-date">Последнее обновление: 20 июня 2026 г.</p>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'privacy') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal profile-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <button onClick={() => setScreen('view')}>←</button>
            <h3>Политика конфиденциальности</h3>
            <button onClick={onClose}>✕</button>
          </div>
          <div className="legal-content">
            <h4>1. Какие данные мы собираем</h4>
            <ul>
              <li>Имя пользователя и email при регистрации</li>
              <li>Сообщения, файлы и медиа, которые вы отправляете</li>
              <li>Аватар и информацию профиля</li>
              <li>IP-адрес для обеспечения безопасности</li>
            </ul>

            <h4>2. Как мы используем данные</h4>
            <ul>
              <li>Для предоставления сервиса обмена сообщениями</li>
              <li>Для отправки уведомлений (если вы их включили)</li>
              <li>Для защиты от спама и мошенничества</li>
            </ul>

            <h4>3. Хранение данных</h4>
            <p>Данные хранятся на защищённых серверах. Мы не продаём и не передаём ваши данные третьим лицам.</p>

            <h4>4. Удаление аккаунта</h4>
            <p>Вы можете удалить свой аккаунт в любой момент через настройки профиля. Все ваши данные будут удалены безвозвратно.</p>

            <h4>5. Cookies и отслеживание</h4>
            <p>Forevo использует localStorage для хранения настроек. Мы не используем сторонние трекеры.</p>

            <h4>6. Контакты</h4>
            <p>По вопросам конфиденциальности обращайтесь: <a href="https://t.me/ForevoM">@ForevoM</a></p>

            <p className="legal-date">Последнее обновление: 20 июня 2026 г.</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
