import Avatar from './Avatar';

export default function BottomNav({ activeTab, onTabChange, onNewChat, onProfile }) {
  return (
    <div className="bottom-nav">
      <button
        className={`bottom-nav-item ${activeTab === 'chats' ? 'active' : ''}`}
        onClick={() => onTabChange('chats')}
      >
        <span className="bottom-nav-icon">💬</span>
        <span className="bottom-nav-label">Чаты</span>
      </button>
      <button
        className="bottom-nav-item"
        onClick={onNewChat}
      >
        <span className="bottom-nav-icon">✏️</span>
        <span className="bottom-nav-label">Новый</span>
      </button>
      <button
        className={`bottom-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
        onClick={onProfile}
      >
        <span className="bottom-nav-icon">👤</span>
        <span className="bottom-nav-label">Профиль</span>
      </button>
    </div>
  );
}
