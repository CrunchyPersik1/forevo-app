import { useState } from 'react';
import { validateUsername } from '../utils';

export default function Auth({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ login: '', email: '', username: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (mode === 'register') {
      const uErr = validateUsername(form.username);
      if (uErr) { setError(uErr); return; }
      if (!agreed) { setError('Необходимо принять условия использования'); return; }
    }
    setLoading(true);
    try {
      await onAuth(mode, form);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-icon">💬</span>
          <h1>Forevo</h1>
          <p>Быстрый и красивый мессенджер</p>
        </div>

        <div className="auth-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Вход</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Регистрация</button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'login' ? (
            <input placeholder="Логин или email" value={form.login} onChange={set('login')} required autoFocus />
          ) : (
            <>
              <input
                placeholder="Имя пользователя (латиница, 3–20)"
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value.toLowerCase() })}
                required
                autoFocus
                pattern="[a-z0-9._]{3,20}"
              />
              <input placeholder="Email" type="email" value={form.email} onChange={set('email')} required />
              <input placeholder="Отображаемое имя" value={form.displayName} onChange={set('displayName')} />
              <label className="auth-checkbox">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                />
                <span>Мне исполнилось 14 лет и я принимаю <button type="button" className="auth-link" onClick={() => {}}>Условия использования</button></span>
              </label>
            </>
          )}
          <input placeholder="Пароль" type="password" value={form.password} onChange={set('password')} required minLength={8} />
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Загрузка...' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>
        </form>
      </div>
    </div>
  );
}
