import { useState } from 'react';
import { getInitials, avatarColor } from '../utils';

export default function Avatar({ user, size = 40, online, onClick, lazy = true }) {
  const name = user?.displayName || user?.name || user?.groupName || '?';
  const color = avatarColor(user?.id || name);
  const isGroup = user?.isGroup;
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const showImage = user?.avatar && !error;
  const initials = isGroup ? (name[0] || '?').toUpperCase() : getInitials(name);

  const inner = showImage ? (
    <>
      {!loaded && <div className="avatar-skeleton" style={{ width: size, height: size }} />}
      <img
        src={user.avatar}
        alt=""
        className={`avatar-img ${loaded ? 'loaded' : ''}`}
        style={{ width: size, height: size }}
        loading={lazy ? 'lazy' : 'eager'}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </>
  ) : (
    <div className="avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>
      {initials}
    </div>
  );

  return (
    <div
      className={`avatar-wrap ${onClick ? 'clickable' : ''}`}
      style={{ width: size, height: size }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      {inner}
      {online !== undefined && (
        <span className={`avatar-status ${online ? 'online' : ''}`} />
      )}
    </div>
  );
}
