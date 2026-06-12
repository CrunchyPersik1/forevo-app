import { useEffect } from 'react';

export default function PhotoViewer({ src, alt, onClose }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="photo-viewer-overlay" onClick={onClose}>
      <button className="photo-viewer-close" onClick={onClose}>✕</button>
      <img src={src} alt={alt || ''} className="photo-viewer-img" onClick={e => e.stopPropagation()} />
    </div>
  );
}
