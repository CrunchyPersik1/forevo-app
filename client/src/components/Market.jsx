import { useState, useEffect } from 'react';
import { api } from '../api';

const RARITY_COLORS = {
  common: '#8b949e',
  rare: '#2196f3',
  epic: '#9c27b0',
  legendary: '#ff9800',
};

const RARITY_LABELS = {
  common: 'Обычный',
  rare: 'Редкий',
  epic: 'Эпический',
  legendary: 'Легендарный',
};

export default function Market({ user, onClose, onUpdate }) {
  const [tab, setTab] = useState('nfts');
  const [nfts, setNfts] = useState([]);
  const [themes, setThemes] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [nftsData, themesData, balanceData] = await Promise.all([
        api.getMarketNfts(),
        api.getMarketThemes(),
        api.getMarketBalance(),
      ]);
      setNfts(nftsData);
      setThemes(themesData);
      setBalance(balanceData.foreiki);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBuy = async (type, id) => {
    setBuying(id);
    try {
      if (type === 'nft') {
        const result = await api.buyNft(id);
        setBalance(result.user.foreiki);
        setNfts(prev => prev.map(n => n.id === id ? { ...n, owned: true } : n));
      } else {
        const result = await api.buyTheme(id);
        setBalance(result.user.foreiki);
        setThemes(prev => prev.map(t => t.id === id ? { ...t, owned: true } : t));
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setBuying(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal market-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🏪 Рынок</h3>
          <div className="market-balance">
            <span className="coin-icon">🪙</span>
            <span>{balance} Фориков</span>
          </div>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="market-tabs">
          <button className={`market-tab ${tab === 'nfts' ? 'active' : ''}`} onClick={() => setTab('nfts')}>🎁 NFT</button>
          <button className={`market-tab ${tab === 'themes' ? 'active' : ''}`} onClick={() => setTab('themes')}>🎨 Темы</button>
        </div>

        <div className="market-grid">
          {loading ? (
            <div className="modal-empty">Загрузка...</div>
          ) : tab === 'nfts' ? (
            nfts.map(nft => (
              <div key={nft.id} className="market-card">
                <div className="market-card-emoji">{nft.emoji}</div>
                <div className="market-card-name">{nft.name}</div>
                <div className={`market-card-rarity`} style={{ color: RARITY_COLORS[nft.rarity] }}>
                  {RARITY_LABELS[nft.rarity]}
                </div>
                <div className="market-card-desc">{nft.description}</div>
                {nft.owned ? (
                  <div className="market-card-owned">✓ Куплено</div>
                ) : (
                  <button
                    className="market-card-buy"
                    disabled={buying === nft.id || balance < nft.price}
                    onClick={() => handleBuy('nft', nft.id)}
                  >
                    {buying === nft.id ? '...' : `${nft.price} 🪙`}
                  </button>
                )}
              </div>
            ))
          ) : (
            themes.map(theme => (
              <div key={theme.id} className="market-card">
                <div className="market-card-theme-preview" data-theme={theme.css_effect} />
                <div className="market-card-name">{theme.name}</div>
                <div className="market-card-desc">{theme.description}</div>
                {theme.owned ? (
                  <div className="market-card-owned">✓ Куплено</div>
                ) : (
                  <button
                    className="market-card-buy"
                    disabled={buying === theme.id || balance < theme.price}
                    onClick={() => handleBuy('theme', theme.id)}
                  >
                    {buying === theme.id ? '...' : `${theme.price} 🪙`}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
