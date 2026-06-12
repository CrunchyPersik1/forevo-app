export const USERNAME_REGEX = /^[a-z0-9._]{3,20}$/;

export function validateUsername(username) {
  if (!username) return 'Введите имя пользователя';
  const u = username.toLowerCase().trim();
  if (!USERNAME_REGEX.test(u)) {
    return '3–20 символов: латиница, цифры, точка, _';
  }
  return null;
}

export function formatRegistrationDate(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

export function formatTime(ts) {
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function formatLastSeen(ts) {
  if (!ts) return 'в сети';
  const numericTs = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  if (isNaN(numericTs)) return 'в сети';
  const diff = Date.now() - numericTs;
  if (diff < 60000) return 'был(а) только что';
  if (diff < 3600000) return `был(а) ${Math.floor(diff / 60000)} мин. назад`;
  if (diff < 86400000) return `был(а) ${Math.floor(diff / 3600000)} ч. назад`;
  return `был(а) ${formatTime(ts)}`;
}

export function getInitials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const AVATAR_COLORS = ['#6c5ce7', '#00d68f', '#ff6b6b', '#fdcb6e', '#74b9ff', '#e17055', '#a29bfe', '#55efc4'];

export function avatarColor(id) {
  let hash = 0;
  for (let i = 0; i < (id || '').length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
