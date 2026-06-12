import { useState, useRef, useEffect } from 'react';

export default function MessageInput({ onSend, onTyping, replyTo, onCancelReply }) {
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const fileRef = useRef(null);
  const mediaRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const typingTimer = useRef(null);

  useEffect(() => () => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    onTyping(false);
  }, []);

  const handleTyping = () => {
    onTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => onTyping(false), 2000);
  };

  const handleSend = async () => {
    if (!text.trim()) return;
    onTyping(false);
    clearTimeout(typingTimer.current);
    try {
      await onSend({ content: text.trim(), replyToId: replyTo?.id });
      setText('');
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
      onCancelReply();
    } catch {}
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const fd = new FormData();
        fd.append('files', blob, 'voice.webm');
        fd.append('type', 'voice');
        await onSend(fd);
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        alert('Доступ к микрофону запрещён. Разрешите доступ в настройках браузера.');
      } else {
        alert('Не удалось получить доступ к микрофону: ' + e.message);
      }
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
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

      <div className="msg-input">
        <button className="icon-btn" onClick={() => fileRef.current?.click()} title="Файл">📎</button>
        <input ref={fileRef} type="file" hidden multiple onChange={e => handleFiles(e.target.files)} />

        <button className="icon-btn" onClick={() => mediaRef.current?.click()} title="Фото">📷</button>
        <input ref={mediaRef} type="file" hidden accept="image/*" onChange={e => handleFiles(e.target.files)} />

        <textarea
          placeholder="Сообщение..."
          value={text}
          rows={1}
          onChange={e => { setText(e.target.value); handleTyping(); }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
        />

        {text.trim() ? (
          <button className="send-btn" onClick={handleSend}>➤</button>
        ) : (
          <button
            className={`send-btn ${recording ? 'recording' : ''}`}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={recording ? stopRecording : undefined}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            title="Удерживайте для записи"
          >
            {recording ? '🔴' : '🎤'}
          </button>
        )}
      </div>
    </div>
  );
}
