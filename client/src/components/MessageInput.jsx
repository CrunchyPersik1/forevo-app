import { useState, useRef, useEffect } from 'react';

const EMOJI_CATEGORIES = {
  'Частые': ['😀', '😂', '😍', '🥰', '😎', '🤔', '👍', '❤️', '🔥', '✨', '🎉', '💪', '🙏', '😭', '🥳', '😇'],
  'Животные': ['🐶', '🐱', '🐻', '🦊', '🐸', '🐵', '🦁', '🐼', '🐨', '🐰', '🦄', '🐝', '🦋', '🐙', '🦈', '🐬'],
  'Еда': ['🍕', '🍔', '🍟', '🌮', '🍣', '🍰', '🍩', '🍪', '🍫', '☕', '🥤', '🍺', '🍷', '🍎', '🍕', '🥑'],
  'Объекты': ['💎', '🎮', '🎵', '📱', '💻', '📸', '🎬', '📚', '✈️', '🚀', '🏠', '🔑', '💡', '⏰', '💰', '🎁'],
  'Природа': ['🌸', '🌺', '🌻', '🌹', '🌴', '🌈', '⭐', '🌙', '☀️', '🔥', '❄️', '🌊', '🍀', '🍁', '🌊', '⚡'],
  'Жесты': ['👋', '🤙', '✌️', '🤝', '👏', '🙌', '💪', '🫶', '🤌', '🫡', '💅', '👋', '🫰', '🤟', '🤙', '✊'],
};

const STICKERS = [
  '🥴', '🤡', '💀', '👻', '🎃', '😈', '👹', '👺',
  '🤖', '👽', '🧠', '💜', '🖤', '🤍', '💔', '❣️',
  '💘', '💝', '💖', '💗', '💞', '💕', '💓', '💟',
  '🏳️\u200d🌈', '🏴\u200d☠️', '🇺🇳', '☮️', '☯️', '✡️', '☪️', '🕉️',
];

export default function MessageInput({ onSend, onTyping, replyTo, onCancelReply, members, chatId }) {
  const [text, setText] = useState(() => {
    if (chatId) return localStorage.getItem(`forevo-draft-${chatId}`) || '';
    return '';
  });
  const [recording, setRecording] = useState(false);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState('Частые');
  const fileRef = useRef(null);
  const mediaRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const typingTimer = useRef(null);
  const textareaRef = useRef(null);
  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;
  const recordingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      onTyping(false);
    };
  }, []);

  useEffect(() => {
    setText(localStorage.getItem(`forevo-draft-${chatId}`) || '');
  }, [chatId]);

  useEffect(() => {
    if (text) {
      localStorage.setItem(`forevo-draft-${chatIdRef.current}`, text);
    } else if (chatIdRef.current) {
      localStorage.removeItem(`forevo-draft-${chatIdRef.current}`);
    }
  }, [text]);

  const handleTyping = () => {
    onTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => onTyping(false), 2000);
  };

  const mentionResults = mentionQuery !== null && members?.length
    ? members.filter(m => m.username.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5)
    : [];

  const insertMention = (username) => {
    const before = text.slice(0, text.lastIndexOf('@'));
    setText(before + '@' + username + ' ');
    setMentionQuery(null);
    setMentionIndex(0);
    textareaRef.current?.focus();
  };

  const insertEmoji = (emoji) => {
    setText(prev => prev + emoji);
    textareaRef.current?.focus();
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);
    handleTyping();

    const cursorPos = e.target.selectionStart;
    const textBefore = val.slice(0, cursorPos);
    const atMatch = textBefore.match(/@(\w*)$/);
    if (atMatch && members?.length) {
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const handleSend = async () => {
    if (!text.trim()) return;
    onTyping(false);
    clearTimeout(typingTimer.current);
    try {
      await onSend({ content: text.trim(), replyToId: replyTo?.id });
      setText('');
      localStorage.removeItem(`forevo-draft-${chatIdRef.current}`);
      setMentionQuery(null);
      onCancelReply();
    } catch {}
  };

  const handleFiles = async (files) => {
    if (!files?.length) return;
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('files', file);
        if (text.trim()) fd.append('content', text.trim());
        if (replyTo) fd.append('replyToId', replyTo.id);
        await onSend(fd);
      }
      setText('');
      setMentionQuery(null);
      onCancelReply();
    } catch {}
  };

  const startRecording = async () => {
    if (recordingRef.current) return;
    recordingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        if (chunksRef.current.length === 0) {
          stream.getTracks().forEach(t => t.stop());
          streamRef.current = null;
          recordingRef.current = false;
          return;
        }
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size < 1000) {
          stream.getTracks().forEach(t => t.stop());
          streamRef.current = null;
          recordingRef.current = false;
          return;
        }
        const fd = new FormData();
        fd.append('files', blob, 'voice.webm');
        fd.append('type', 'voice');
        await onSend(fd);
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        recordingRef.current = false;
      };
      recorderRef.current = recorder;
      recorder.start(1000);
      setRecording(true);
    } catch (e) {
      recordingRef.current = false;
      if (e.name === 'NotAllowedError') {
        alert('Доступ к микрофону запрещён.');
      } else {
        alert('Ошибка микрофона: ' + e.message);
      }
    }
  };

  const stopRecording = () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  const handleKeyDown = (e) => {
    if (mentionResults.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % mentionResults.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + mentionResults.length) % mentionResults.length); return; }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); insertMention(mentionResults[mentionIndex].username); return; }
      if (e.key === 'Escape') { setMentionQuery(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="msg-input-area">
      {replyTo && (
        <div className="msg-input-reply">
          <div>
            <small>Ответ для {replyTo.senderName}</small>
            <p>{replyTo.content || '📎 Вложение'}</p>
          </div>
          <button onClick={onCancelReply}>✕</button>
        </div>
      )}

      {mentionResults.length > 0 && (
        <div className="mention-dropdown">
          {mentionResults.map((m, i) => (
            <button key={m.id} className={`mention-item ${i === mentionIndex ? 'active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); insertMention(m.username); }}>
              <span className="mention-name">{m.displayName}</span>
              <span className="mention-username">@{m.username}</span>
            </button>
          ))}
        </div>
      )}

      {showEmoji && (
        <div className="emoji-panel">
          <div className="emoji-panel-tabs">
            {Object.keys(EMOJI_CATEGORIES).map(cat => (
              <button key={cat} className={`emoji-tab ${emojiCategory === cat ? 'active' : ''}`}
                onClick={() => setEmojiCategory(cat)}>
                {EMOJI_CATEGORIES[cat][0]}
              </button>
            ))}
            <button className={`emoji-tab ${emojiCategory === 'stickers' ? 'active' : ''}`}
              onClick={() => setEmojiCategory('stickers')}>
              🎭
            </button>
          </div>
          <div className="emoji-panel-grid">
            {(emojiCategory === 'stickers' ? STICKERS : EMOJI_CATEGORIES[emojiCategory] || []).map((emoji, i) => (
              <button key={i} className="emoji-panel-item" onClick={() => insertEmoji(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="msg-input">
        <button className="icon-btn" onClick={() => fileRef.current?.click()} title="Файл">📎</button>
        <input ref={fileRef} type="file" hidden multiple onChange={e => handleFiles(e.target.files)} />

        <button className="icon-btn" onClick={() => mediaRef.current?.click()} title="Фото">📷</button>
        <input ref={mediaRef} type="file" hidden accept="image/*" onChange={e => handleFiles(e.target.files)} />

        <textarea
          ref={textareaRef}
          placeholder="Сообщение..."
          value={text}
          rows={1}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />

        <button className="icon-btn" onClick={() => setShowEmoji(!showEmoji)} title="Эмодзи">
          {showEmoji ? '✕' : '😊'}
        </button>

        {text.trim() ? (
          <button className="send-btn" onClick={handleSend}>➤</button>
        ) : (
          <button
            className={`send-btn ${recording ? 'recording' : ''}`}
            onClick={recording ? stopRecording : startRecording}
            title={recording ? 'Остановить запись' : 'Нажмите для записи голосового'}
          >
            {recording ? '🔴' : '🎤'}
          </button>
        )}
      </div>
    </div>
  );
}
