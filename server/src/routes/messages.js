import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { uploadsDir, db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { isMember, formatMessage, getChatMembers } from './chats.js';
import { isBlocked } from '../utils/blocks.js';

const router = Router();
router.use(authMiddleware);

const ALLOWED_UPLOAD_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'audio/webm', 'audio/ogg', 'audio/mpeg',
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
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ALLOWED_UPLOAD_TYPES.includes(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/');
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

    const msgId = uuid();
    const now = Date.now();

    await db.run(`
      INSERT INTO messages (id, chat_id, sender_id, content, type, reply_to_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [msgId, chatId, req.userId, content?.trim() || null, msgType, replyToId || null, now]);

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

function guessType(mime) {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'voice';
  return 'file';
}

export default router;
