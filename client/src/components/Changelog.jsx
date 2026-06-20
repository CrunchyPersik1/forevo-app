import { useState, useEffect } from 'react';

const CURRENT_VERSION = '1.4.0';

const CHANGES = [
  '🔔 Push-уведомления — теперь приходят даже когда браузер закрыт',
  '📱 PWA — установи Forevo на рабочий стол как приложение',
  '🎨 Новая иконка приложения',
  '💬 Стикеры и эмодзи-панель ввода',
  '📅 Группировка сообщений по датам',
  '🟢 Статус пользователя (в сети / не беспокоить / оффлайн)',
];

export default function Changelog({ onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const lastVersion = localStorage.getItem('forevo-changelog');
    if (lastVersion !== CURRENT_VERSION) {
      setVisible(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem('forevo-changelog', CURRENT_VERSION);
    setVisible(false);
    onClose?.();
  };

  if (!visible) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h3>🎉 Обновление Forevo {CURRENT_VERSION}</h3>
          <button onClick={handleClose}>✕</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>
            Вышло новое обновление! Вот что нового:
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {CHANGES.map((change, i) => (
              <li key={i} style={{ padding: '8px 0', fontSize: 14, borderBottom: i < CHANGES.length - 1 ? '1px solid var(--border)' : 'none' }}>
                {change}
              </li>
            ))}
          </ul>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 16, textAlign: 'center' }}>
            💡 Если аватарка пропала — зайди в профиль и загрузи заново
          </p>
        </div>
        <button className="modal-submit" onClick={handleClose} style={{ margin: '0 20px 16px', width: 'calc(100% - 40px)' }}>
          Понятно!
        </button>
      </div>
    </div>
  );
}
