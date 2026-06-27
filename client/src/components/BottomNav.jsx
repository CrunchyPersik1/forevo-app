export default function BottomNav({ activeTab, onTabChange, onSettings }) {
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
        className={`bottom-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={onSettings}
      >
        <span className="bottom-nav-icon">⚙️</span>
        <span className="bottom-nav-label">Настройки</span>
      </button>
    </div>
  );
}
