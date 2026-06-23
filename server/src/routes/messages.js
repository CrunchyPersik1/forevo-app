import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { uploadsDir, db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { isMember, formatMessage, getChatMembers } from './chats.js';
import { isBlocked } from '../utils/blocks.js';
import { sendMentionEmail } from '../services/notifications.js';
import { sendPushNotification } from './push.js';

const router = Router();
router.use(authMiddleware);

const ALLOWED_UPLOAD_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
  'application/pdf', 'application/zip', 'text/plain',
];

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ALLOWED_UPLOAD_TYPES.includes(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/');
    cb(ok ? null : new Error('File type not allowed'), ok);
  },
});

router.post('/:chatId', upload.array('files', 10), async (req, res) => {
  try {
    const { chatId } = req.params;
    const { content, type, replyToId } = req.body || {};

    if (!(await isMember(chatId, req.userId))) return res.status(403).json({ error: 'Not a member' });

    const chat = await db.get('SELECT type FROM chats WHERE id = $1', [chatId]);
    if (chat?.type === 'direct') {
      const members = await getChatMembers(chatId);
      const other = members.find(m => m.id !== req.userId);
      if (other && await isBlocked(req.userId, other.id)) {
        return res.status(403).json({ error: 'Cannot message this user' });
      }
    }

    const msgType = type || (req.files?.length ? guessType(req.files[0].mimetype) : 'text');
    if (msgType === 'text' && !content?.trim() && !req.files?.length) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    const mentionUsernames = [];
    if (content && chat?.type === 'group') {
      const members = await getChatMembers(chatId);
      const regex = /@(\w+)/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const member = members.find(m => m.username === match[1]);
        if (member) mentionUsernames.push(member.id);
      }
    }

    const msgId = uuid();
    const now = Date.now();

    await db.run(`
      INSERT INTO messages (id, chat_id, sender_id, content, type, reply_to_id, mentions, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [msgId, chatId, req.userId, content?.trim() || null, msgType, replyToId || null, mentionUsernames, now]);

    if (req.files?.length) {
      for (const f of req.files) {
        await db.run(
          'INSERT INTO attachments (id, message_id, filename, original_name, mime_type, size) VALUES ($1, $2, $3, $4, $5, $6)',
          [uuid(), msgId, f.filename, f.originalname, f.mimetype, f.size]
        );
      }
    }

    const row = await db.get(`
      SELECT m.*, u.display_name as sender_name, u.avatar as sender_avatar FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id WHERE m.id = $1
    `, [msgId]);

    const message = await formatMessage(row);
    req.app.locals.io?.to(`chat:${chatId}`).emit('message:new', message);

    for (const uid of mentionUsernames) {
      if (uid !== req.userId) {
        const mentioned = await db.get('SELECT display_name FROM users WHERE id = $1', [uid]);
        req.app.locals.io?.to(`user:${uid}`).emit('mention:received', {
          chatId,
          messageId: msgId,
          fromUser: message.senderName,
          content: content?.trim().slice(0, 100),
        });
        const lastSeen = await db.get('SELECT last_seen FROM users WHERE id = $1', [uid]);
        if (lastSeen && lastSeen.last_seen && (Date.now() - lastSeen.last_seen > 5 * 60 * 1000)) {
          const chatName = chat?.type === 'group' ? (await db.get('SELECT name FROM chats WHERE id = $1', [chatId]))?.name : message.senderName;
          sendMentionEmail(uid, message.senderName, chatName, content?.trim().slice(0, 200));
        }
      }
    }

    if (chat?.type === 'direct' && !mentionUsernames.length) {
      const members = await getChatMembers(chatId);
      const other = members.find(m => m.id !== req.userId);
      if (other) {
        const otherUser = await db.get('SELECT last_seen FROM users WHERE id = $1', [other.id]);
        if (otherUser?.last_seen && (Date.now() - otherUser.last_seen > 5 * 60 * 1000)) {
          const { sendOfflineMessageEmail } = await import('../services/notifications.js');
          sendOfflineMessageEmail(other.id, message.senderName, message.senderName, content?.trim().slice(0, 200));
        }
      }
    }

    const chatMembers = await getChatMembers(chatId);
    const recipients = chatMembers.filter(m => m.id !== req.userId);
    const chatTitle = chat?.type === 'group' ? (await db.get('SELECT name FROM chats WHERE id = $1', [chatId]))?.name : message.senderName;
    for (const member of recipients) {
      sendPushNotification(member.id, message.senderName || chatTitle, content?.trim().slice(0, 100) || 'Вложение', '/');
    }

    res.status(201).json(message);
  } catch (err) {
    console.error('POST /messages/:chatId error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { content } = req.body;
    const msg = await db.get('SELECT * FROM messages WHERE id = $1', [req.params.id]);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.sender_id !== req.userId) return res.status(403).json({ error: 'Not your message' });
    if (msg.type !== 'text') return res.status(400).json({ error: 'Can only edit text messages' });
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Content required' });
    }

    const now = Date.now();
    await db.run('UPDATE messages SET content = $1, edited_at = $2 WHERE id = $3', [content.trim(), now, msg.id]);

    const row = await db.get(`
      SELECT m.*, u.display_name as sender_name, u.avatar as sender_avatar FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id WHERE m.id = $1
    `, [msg.id]);

    const message = await formatMessage(row);
    req.app.locals.io?.to(`chat:${msg.chat_id}`).emit('message:updated', message);
    res.json(message);
  } catch (err) {
    console.error('PATCH /messages/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const msg = await db.get('SELECT * FROM messages WHERE id = $1', [req.params.id]);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.sender_id !== req.userId) return res.status(403).json({ error: 'Not your message' });

    const now = Date.now();
    await db.run('UPDATE messages SET deleted_at = $1, content = NULL WHERE id = $2', [now, msg.id]);

    const attachments = await db.all('SELECT filename FROM attachments WHERE message_id = $1', [msg.id]);
    for (const att of attachments) {
      const filePath = path.join(uploadsDir, att.filename);
      try { fs.unlinkSync(filePath); } catch {}
    }
    await db.run('DELETE FROM attachments WHERE message_id = $1', [msg.id]);

    const row = await db.get(`
      SELECT m.*, u.display_name as sender_name, u.avatar as sender_avatar FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id WHERE m.id = $1
    `, [msg.id]);

    const message = await formatMessage(row);
    req.app.locals.io?.to(`chat:${msg.chat_id}`).emit('message:updated', message);
    res.json(message);
  } catch (err) {
    console.error('DELETE /messages/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/reactions', async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'emoji required' });

    const msg = await db.get('SELECT * FROM messages WHERE id = $1', [req.params.id]);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (!(await isMember(msg.chat_id, req.userId))) return res.status(403).json({ error: 'Not a member' });

    const existing = await db.get(
      'SELECT 1 FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
      [msg.id, req.userId, emoji]
    );

    if (existing) {
      await db.run('DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
        [msg.id, req.userId, emoji]
      );
    } else {
      await db.run('INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES ($1, $2, $3, $4)',
        [msg.id, req.userId, emoji, Date.now()]
      );
    }

    const reactions = await db.all('SELECT emoji, user_id FROM message_reactions WHERE message_id = $1', [msg.id]);
    const reactionMap = {};
    for (const r of reactions) {
      if (!reactionMap[r.emoji]) reactionMap[r.emoji] = [];
      reactionMap[r.emoji].push(r.user_id);
    }

    const payload = { messageId: msg.id, chatId: msg.chat_id, reactions: reactionMap };
    req.app.locals.io?.to(`chat:${msg.chat_id}`).emit('message:reaction', payload);
    res.json(payload);
  } catch (err) {
    console.error('POST /messages/:id/reactions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/read/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { messageId } = req.body;

    if (!(await isMember(chatId, req.userId))) return res.status(403).json({ error: 'Not a member' });

    if (messageId) {
      const msgCheck = await db.get('SELECT chat_id FROM messages WHERE id = $1', [messageId]);
      if (!msgCheck || msgCheck.chat_id !== chatId) {
        return res.status(400).json({ error: 'Invalid messageId for this chat' });
      }
    }

    await db.run(
      'UPDATE chat_members SET last_read_message_id = $1 WHERE chat_id = $2 AND user_id = $3',
      [messageId, chatId, req.userId]
    );

    req.app.locals.io?.to(`chat:${chatId}`).emit('message:read', {
      chatId,
      userId: req.userId,
      messageId,
      readAt: Date.now(),
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /messages/read/:chatId error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/forward', async (req, res) => {
  try {
    const { chatId: targetChatId } = req.body;
    if (!targetChatId) return res.status(400).json({ error: 'chatId required' });

    const original = await db.get('SELECT * FROM messages WHERE id = $1', [req.params.id]);
    if (!original) return res.status(404).json({ error: 'Message not found' });
    if (!(await isMember(targetChatId, req.userId))) return res.status(403).json({ error: 'Not a member of target chat' });

    const msgId = uuid();
    const now = Date.now();

    await db.run(`
      INSERT INTO messages (id, chat_id, sender_id, content, type, forwarded_from_chat_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [msgId, targetChatId, req.userId, original.content, original.type, original.chat_id, now]);

    if (original.type !== 'text') {
      const attachments = await db.all('SELECT * FROM attachments WHERE message_id = $1', [original.id]);
      for (const a of attachments) {
        await db.run(
          'INSERT INTO attachments (id, message_id, filename, original_name, mime_type, size) VALUES ($1, $2, $3, $4, $5, $6)',
          [uuid(), msgId, a.filename, a.original_name, a.mime_type, a.size]
        );
      }
    }

    const row = await db.get(`
      SELECT m.*, u.display_name as sender_name, u.avatar as sender_avatar FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id WHERE m.id = $1
    `, [msgId]);

    const message = await formatMessage(row);
    req.app.locals.io?.to(`chat:${targetChatId}`).emit('message:new', message);
    res.status(201).json(message);
  } catch (err) {
    console.error('POST /messages/:id/forward error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/pin', async (req, res) => {
  try {
    const msg = await db.get('SELECT * FROM messages WHERE id = $1', [req.params.id]);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (!(await isMember(msg.chat_id, req.userId))) return res.status(403).json({ error: 'Not a member' });

    const exists = await db.get(
      'SELECT 1 FROM pinned_messages WHERE chat_id = $1 AND message_id = $2',
      [msg.chat_id, msg.id]
    );
    if (exists) return res.status(409).json({ error: 'Already pinned' });

    await db.run(
      'INSERT INTO pinned_messages (chat_id, message_id, pinned_by, pinned_at) VALUES ($1, $2, $3, $4)',
      [msg.chat_id, msg.id, req.userId, Date.now()]
    );

    const row = await db.get(`
      SELECT m.*, u.display_name as sender_name, u.avatar as sender_avatar FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id WHERE m.id = $1
    `, [msg.id]);
    const pinnedMsg = await formatMessage(row);

    req.app.locals.io?.to(`chat:${msg.chat_id}`).emit('message:pin', { chatId: msg.chat_id, message: pinnedMsg });
    res.json({ ok: true, message: pinnedMsg });
  } catch (err) {
    console.error('POST /messages/:id/pin error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/pin', async (req, res) => {
  try {
    const msg = await db.get('SELECT * FROM messages WHERE id = $1', [req.params.id]);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (!(await isMember(msg.chat_id, req.userId))) return res.status(403).json({ error: 'Not a member' });

    await db.run('DELETE FROM pinned_messages WHERE chat_id = $1 AND message_id = $2', [msg.chat_id, msg.id]);

    req.app.locals.io?.to(`chat:${msg.chat_id}`).emit('message:unpin', { chatId: msg.chat_id, messageId: msg.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /messages/:id/pin error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/report', async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'Reason required' });

    const msg = await db.get('SELECT * FROM messages WHERE id = $1', [req.params.id]);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (!(await isMember(msg.chat_id, req.userId))) return res.status(403).json({ error: 'Not a member' });

    const existing = await db.get(
      'SELECT id FROM reports WHERE reporter_id = $1 AND message_id = $2',
      [req.userId, msg.id]
    );
    if (existing) return res.status(409).json({ error: 'Already reported' });

    await db.run(
      'INSERT INTO reports (id, reporter_id, message_id, reason, created_at) VALUES ($1, $2, $3, $4, $5)',
      [require('crypto').randomUUID(), req.userId, msg.id, reason.trim(), Date.now()]
    );

    console.log(`[REPORT] User ${req.userId} reported message ${msg.id}: ${reason.trim()}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /messages/:id/report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function guessType(mime) {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'voice';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

export default router;
