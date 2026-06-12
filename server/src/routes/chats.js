import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { db, groupAvatarsDir } from '../db.js';
import { authMiddleware } from '../auth.js';
import { isBlocked } from '../utils/blocks.js';
import { isGroupAdmin, isGroupCreator, getGroupAdmins } from '../utils/groups.js';

const router = Router();
router.use(authMiddleware);

const groupAvatarUpload = multer({
  storage: multer.diskStorage({
    destination: groupAvatarsDir,
    filename: (req, _file, cb) => cb(null, `${req.params.id}.webp`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Only JPG, PNG, GIF, WEBP allowed'), ok);
  },
});

async function getClearedAt(chatId, userId) {
  const row = await db.get(
    'SELECT cleared_at FROM chat_members WHERE chat_id = $1 AND user_id = $2',
    [chatId, userId]
  );
  return row?.cleared_at || 0;
}

async function getChatMembers(chatId) {
  const rows = await db.all(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.bio, u.last_seen, u.created_at, cm.role, cm.joined_at
    FROM chat_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.chat_id = $1
    ORDER BY cm.joined_at ASC
  `, [chatId]);
  return rows.map(m => ({
    id: m.id,
    username: m.username,
    displayName: m.display_name,
    avatar: m.avatar,
    bio: m.bio,
    lastSeen: m.last_seen,
    createdAt: m.created_at,
    role: m.role,
    joinedAt: m.joined_at,
  }));
}

async function getLastMessage(chatId, userId) {
  const clearedAt = await getClearedAt(chatId, userId);
  const msg = await db.get(`
    SELECT m.*, u.display_name as sender_name, u.avatar as sender_avatar
    FROM messages m
    LEFT JOIN users u ON u.id = m.sender_id
    WHERE m.chat_id = $1 AND m.deleted_at IS NULL AND m.created_at > $2
    ORDER BY m.created_at DESC LIMIT 1
  `, [chatId, clearedAt]);
  if (!msg) return null;
  return formatMessage(msg);
}

async function getUnreadCount(chatId, userId) {
  const member = await db.get(
    'SELECT last_read_message_id, cleared_at FROM chat_members WHERE chat_id = $1 AND user_id = $2',
    [chatId, userId]
  );

  let lastReadTime = member?.cleared_at || 0;
  if (member?.last_read_message_id) {
    const lastRead = await db.get('SELECT created_at FROM messages WHERE id = $1', [member.last_read_message_id]);
    if (lastRead && lastRead.created_at > lastReadTime) lastReadTime = lastRead.created_at;
  }

  const row = await db.get(`
    SELECT COUNT(*)::int as count FROM messages
    WHERE chat_id = $1 AND sender_id != $2 AND created_at > $3 AND deleted_at IS NULL AND type != 'system'
  `, [chatId, userId, lastReadTime]);

  return row.count;
}

async function formatMessage(row, seen = new Set()) {
  const attachments = await db.all('SELECT * FROM attachments WHERE message_id = $1', [row.id]);
  const reactions = await db.all(
    'SELECT emoji, user_id FROM message_reactions WHERE message_id = $1',
    [row.id]
  );

  const reactionMap = {};
  for (const r of reactions) {
    if (!reactionMap[r.emoji]) reactionMap[r.emoji] = [];
    reactionMap[r.emoji].push(r.user_id);
  }

  let replyTo = null;
  if (row.reply_to_id && !seen.has(row.reply_to_id)) {
    seen.add(row.reply_to_id);
    const reply = await db.get(`
      SELECT m.*, u.display_name as sender_name, u.avatar as sender_avatar FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id WHERE m.id = $1
    `, [row.reply_to_id]);
    if (reply) replyTo = await formatMessage(reply, seen);
  }

  return {
    id: row.id,
    chatId: row.chat_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderAvatar: row.sender_avatar,
    content: row.deleted_at ? null : row.content,
    type: row.type,
    replyToId: row.reply_to_id,
    replyTo,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    attachments: attachments.map(a => ({
      id: a.id,
      filename: a.filename,
      originalName: a.original_name,
      mimeType: a.mime_type,
      size: a.size,
      url: `/uploads/${a.filename}`,
    })),
    reactions: reactionMap,
  };
}

async function formatChat(chat, userId) {
  const members = await getChatMembers(chat.id);
  let name = chat.name;
  let avatar = chat.avatar;

  if (chat.type === 'direct') {
    const other = members.find(m => m.id !== userId);
    if (other) {
      name = other.displayName;
      avatar = other.avatar;
    }
  }

  const admins = chat.type === 'group' ? await getGroupAdmins(chat.id) : [];

  return {
    id: chat.id,
    type: chat.type,
    name,
    avatar,
    groupName: chat.name,
    groupAvatar: chat.avatar,
    createdBy: chat.created_by,
    admins,
    members,
    lastMessage: await getLastMessage(chat.id, userId),
    unreadCount: await getUnreadCount(chat.id, userId),
    createdAt: chat.created_at,
    isAdmin: chat.type === 'group' ? await isGroupAdmin(chat.id, userId) : false,
    isCreator: chat.type === 'group' ? await isGroupCreator(chat.id, userId) : false,
  };
}

async function isMember(chatId, userId) {
  return !!(await db.get('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, userId]));
}

async function shouldHideDirectChat(chat, userId) {
  if (chat.type !== 'direct') return false;
  const members = await getChatMembers(chat.id);
  const other = members.find(m => m.id !== userId);
  return other ? await isBlocked(userId, other.id) : false;
}

async function emitSystemMessage(io, chatId, content) {
  const sysId = uuid();
  const now = Date.now();
  await db.run('INSERT INTO messages (id, chat_id, content, type, created_at) VALUES ($1, $2, $3, $4, $5)',
    [sysId, chatId, content, 'system', now]
  );
  const row = await db.get(`
    SELECT m.*, u.display_name as sender_name, u.avatar as sender_avatar FROM messages m
    LEFT JOIN users u ON u.id = m.sender_id WHERE m.id = $1
  `, [sysId]);
  const message = await formatMessage(row);
  io?.to(`chat:${chatId}`).emit('message:new', message);
  return message;
}

router.get('/', async (req, res) => {
  try {
    const chats = await db.all(`
      SELECT c.* FROM chats c
      JOIN chat_members cm ON cm.chat_id = c.id
      WHERE cm.user_id = $1
      ORDER BY c.created_at DESC
    `, [req.userId]);

    const filtered = [];
    for (const c of chats) {
      if (!(await shouldHideDirectChat(c, req.userId))) {
        filtered.push(await formatChat(c, req.userId));
      }
    }

    filtered.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt || a.createdAt;
      const bTime = b.lastMessage?.createdAt || b.createdAt;
      return bTime - aTime;
    });

    res.json(filtered);
  } catch (err) {
    console.error('GET /chats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/direct', async (req, res) => {
  try {
    const { userId: otherUserId } = req.body;
    if (!otherUserId) return res.status(400).json({ error: 'userId required' });
    if (otherUserId === req.userId) return res.status(400).json({ error: 'Cannot chat with yourself' });

    if (await isBlocked(req.userId, otherUserId)) {
      return res.status(403).json({ error: 'Cannot message this user' });
    }

    const other = await db.get('SELECT id FROM users WHERE id = $1', [otherUserId]);
    if (!other) return res.status(404).json({ error: 'User not found' });

    const existing = await db.get(`
      SELECT c.id FROM chats c
      JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = $1
      JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = $2
      WHERE c.type = 'direct'
    `, [req.userId, otherUserId]);

    if (existing) {
      const chat = await db.get('SELECT * FROM chats WHERE id = $1', [existing.id]);
      return res.json(await formatChat(chat, req.userId));
    }

    const chatId = uuid();
    const now = Date.now();
    await db.run('INSERT INTO chats (id, type, created_by, created_at) VALUES ($1, $2, $3, $4)', [chatId, 'direct', req.userId, now]);
    await db.run('INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4)', [chatId, req.userId, 'member', now]);
    await db.run('INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4)', [chatId, otherUserId, 'member', now]);

    const chat = await db.get('SELECT * FROM chats WHERE id = $1', [chatId]);
    const formatted = await formatChat(chat, req.userId);

    req.app.locals.io?.to(`user:${req.userId}`).emit('chat:new', formatted);
    req.app.locals.io?.to(`user:${otherUserId}`).emit('chat:new', await formatChat(chat, otherUserId));

    res.status(201).json(formatted);
  } catch (err) {
    console.error('POST /chats/direct error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/group', async (req, res) => {
  try {
    const { name, memberIds } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Group name required' });

    const members = [...new Set([req.userId, ...(memberIds || [])])];

    for (const uid of memberIds || []) {
      if (await isBlocked(req.userId, uid) || await isBlocked(uid, req.userId)) {
        return res.status(403).json({ error: 'Cannot add blocked user' });
      }
    }

    const chatId = uuid();
    const now = Date.now();

    await db.run('INSERT INTO chats (id, type, name, created_by, created_at) VALUES ($1, $2, $3, $4, $5)',
      [chatId, 'group', name.trim(), req.userId, now]
    );

    for (const uid of members) {
      await db.run('INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4)',
        [chatId, uid, uid === req.userId ? 'admin' : 'member', now]
      );
    }

    await db.run('INSERT INTO group_admins (chat_id, user_id, created_at) VALUES ($1, $2, $3)',
      [chatId, req.userId, now]
    );

    const groupName = name.trim();
    const chatRow = async () => db.get('SELECT * FROM chats WHERE id = $1', [chatId]);

    for (const uid of members) {
      if (uid === req.userId) continue;
      req.app.locals.io?.to(`user:${uid}`).emit('chat:new', await formatChat(await chatRow(), uid));
      getSocketJoin(uid, chatId, req.app.locals.io);
    }

    await emitSystemMessage(req.app.locals.io, chatId, `Группа "${groupName}" создана`);

    const chat = await db.get('SELECT * FROM chats WHERE id = $1', [chatId]);
    res.status(201).json(await formatChat(chat, req.userId));
  } catch (err) {
    console.error('POST /chats/group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function getSocketJoin(userId, chatId, io) {
  const sockets = io?.sockets?.sockets;
  if (!sockets) return;
  for (const [, socket] of sockets) {
    if (socket.userId === userId) socket.join(`chat:${chatId}`);
  }
}

router.get('/:id', async (req, res) => {
  try {
    const chat = await db.get('SELECT * FROM chats WHERE id = $1', [req.params.id]);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    if (!(await isMember(chat.id, req.userId))) return res.status(403).json({ error: 'Not a member' });
    res.json(await formatChat(chat, req.userId));
  } catch (err) {
    console.error('GET /chats/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await isMember(id, req.userId))) return res.status(403).json({ error: 'Not a member' });

    const clearedAt = await getClearedAt(id, req.userId);
    const before = parseInt(req.query.before) || Date.now() + 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    const messages = await db.all(`
      SELECT m.*, u.display_name as sender_name, u.avatar as sender_avatar
      FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.chat_id = $1 AND m.created_at < $2 AND m.created_at > $3
      ORDER BY m.created_at DESC
      LIMIT $4
    `, [id, before, clearedAt, limit]);

    const formatted = [];
    for (const m of messages.reverse()) {
      formatted.push(await formatMessage(m));
    }
    res.json(formatted);
  } catch (err) {
    console.error('GET /chats/:id/messages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const chat = await db.get('SELECT * FROM chats WHERE id = $1', [id]);
    if (!chat || chat.type !== 'group') return res.status(400).json({ error: 'Not a group chat' });
    if (!(await isGroupAdmin(id, req.userId))) return res.status(403).json({ error: 'Only admins can edit group' });

    if (name?.trim()) {
      await db.run('UPDATE chats SET name = $1 WHERE id = $2', [name.trim(), id]);
      const myUser = await db.get('SELECT display_name FROM users WHERE id = $1', [req.userId]);
      await emitSystemMessage(req.app.locals.io, id, `${myUser.display_name} изменил(а) название группы на "${name.trim()}"`);
    }

    const updated = await db.get('SELECT * FROM chats WHERE id = $1', [id]);
    const payload = await formatChat(updated, req.userId);
    req.app.locals.io?.to(`chat:${id}`).emit('chat:updated', payload);
    res.json(payload);
  } catch (err) {
    console.error('PATCH /chats/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/avatar', (req, res, next) => {
  groupAvatarUpload.single('avatar')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    next();
  });
}, async (req, res) => {
  try {
    const { id } = req.params;
    const chat = await db.get('SELECT * FROM chats WHERE id = $1', [id]);
    if (!chat || chat.type !== 'group') return res.status(400).json({ error: 'Not a group chat' });
    if (!(await isGroupAdmin(id, req.userId))) return res.status(403).json({ error: 'Only admins can edit group' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const now = Date.now();
    const avatarUrl = `/avatars/groups/${id}.webp?v=${now}`;
    await db.run('UPDATE chats SET avatar = $1 WHERE id = $2', [avatarUrl, id]);

    const updated = await db.get('SELECT * FROM chats WHERE id = $1', [id]);
    const payload = await formatChat(updated, req.userId);
    req.app.locals.io?.to(`chat:${id}`).emit('chat:updated', payload);
    res.json(payload);
  } catch (err) {
    console.error('POST /chats/:id/avatar error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/avatar', async (req, res) => {
  try {
    const { id } = req.params;
    const chat = await db.get('SELECT * FROM chats WHERE id = $1', [id]);
    if (!chat || chat.type !== 'group') return res.status(400).json({ error: 'Not a group chat' });
    if (!(await isGroupAdmin(id, req.userId))) return res.status(403).json({ error: 'Only admins can edit group' });

    const filePath = path.join(groupAvatarsDir, `${id}.webp`);
    try { fs.unlinkSync(filePath); } catch {}
    await db.run('UPDATE chats SET avatar = NULL WHERE id = $1', [id]);

    const updated = await db.get('SELECT * FROM chats WHERE id = $1', [id]);
    const payload = await formatChat(updated, req.userId);
    req.app.locals.io?.to(`chat:${id}`).emit('chat:updated', payload);
    res.json(payload);
  } catch (err) {
    console.error('DELETE /chats/:id/avatar error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const chat = await db.get('SELECT * FROM chats WHERE id = $1', [id]);
    if (!chat || chat.type !== 'group') return res.status(400).json({ error: 'Not a group chat' });
    if (!(await isGroupAdmin(id, req.userId))) return res.status(403).json({ error: 'Only admins can add members' });

    const user = await db.get('SELECT display_name FROM users WHERE id = $1', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const exists = await db.get('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [id, userId]);
    if (exists) return res.status(409).json({ error: 'Already a member' });

    const now = Date.now();
    await db.run('INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4)', [id, userId, 'member', now]);

    const myUser = await db.get('SELECT display_name FROM users WHERE id = $1', [req.userId]);
    await emitSystemMessage(req.app.locals.io, id, `${myUser.display_name} добавил(а) ${user.display_name}`);

    getSocketJoin(userId, id, req.app.locals.io);
    req.app.locals.io?.to(`user:${userId}`).emit('chat:new', await formatChat(chat, userId));

    res.json({ ok: true, chat: await formatChat(chat, req.userId) });
  } catch (err) {
    console.error('POST /chats/:id/members error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;

    const chat = await db.get('SELECT * FROM chats WHERE id = $1', [id]);
    if (!chat || chat.type !== 'group') return res.status(400).json({ error: 'Not a group chat' });
    if (!(await isGroupAdmin(id, req.userId))) return res.status(403).json({ error: 'Only admins can remove members' });
    if (userId === req.userId) return res.status(400).json({ error: 'Use leave endpoint to exit group' });
    if (userId === chat.created_by) return res.status(400).json({ error: 'Cannot remove group creator' });

    const user = await db.get('SELECT display_name FROM users WHERE id = $1', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    await db.run('DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2', [id, userId]);
    await db.run('DELETE FROM group_admins WHERE chat_id = $1 AND user_id = $2', [id, userId]);

    const myUser = await db.get('SELECT display_name FROM users WHERE id = $1', [req.userId]);
    await emitSystemMessage(req.app.locals.io, id, `${myUser.display_name} удалил(а) ${user.display_name}`);

    req.app.locals.io?.to(`user:${userId}`).emit('chat:removed', { chatId: id });

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /chats/:id/members/:userId error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/admins', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const chat = await db.get('SELECT * FROM chats WHERE id = $1', [id]);
    if (!chat || chat.type !== 'group') return res.status(400).json({ error: 'Not a group chat' });
    if (!(await isGroupCreator(id, req.userId))) return res.status(403).json({ error: 'Only creator can assign admins' });

    if (!(await isMember(id, userId))) return res.status(400).json({ error: 'User is not a member' });

    const exists = await db.get('SELECT 1 FROM group_admins WHERE chat_id = $1 AND user_id = $2', [id, userId]);
    if (!exists) {
      await db.run('INSERT INTO group_admins (chat_id, user_id, created_at) VALUES ($1, $2, $3)', [id, userId, Date.now()]);
      const user = await db.get('SELECT display_name FROM users WHERE id = $1', [userId]);
      await emitSystemMessage(req.app.locals.io, id, `${user.display_name} назначен(а) администратором`);
    }

    res.json({ ok: true, chat: await formatChat(chat, req.userId) });
  } catch (err) {
    console.error('POST /chats/:id/admins error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/leave', async (req, res) => {
  try {
    const { id } = req.params;
    const chat = await db.get('SELECT * FROM chats WHERE id = $1', [id]);
    if (!chat || chat.type !== 'group') return res.status(400).json({ error: 'Not a group chat' });
    if (!(await isMember(id, req.userId))) return res.status(403).json({ error: 'Not a member' });

    const myUser = await db.get('SELECT display_name FROM users WHERE id = $1', [req.userId]);

    if (chat.created_by === req.userId) {
      const otherMembers = await db.all(
        'SELECT user_id FROM chat_members WHERE chat_id = $1 AND user_id != $2',
        [id, req.userId]
      );

      if (otherMembers.length > 0) {
        const nextAdmin = otherMembers[0];
        await db.run('UPDATE chats SET created_by = $1 WHERE id = $2', [nextAdmin.user_id, id]);
        await db.run('INSERT INTO group_admins (chat_id, user_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [id, nextAdmin.user_id, Date.now()]
        );
        const nextUser = await db.get('SELECT display_name FROM users WHERE id = $1', [nextAdmin.user_id]);
        await emitSystemMessage(req.app.locals.io, id, `${nextUser.display_name} назначен(а) новым создателем группы`);
      } else {
        await db.run('DELETE FROM chat_members WHERE chat_id = $1', [id]);
        await db.run('DELETE FROM group_admins WHERE chat_id = $1', [id]);
        await db.run('DELETE FROM chats WHERE id = $1', [id]);
        const avatarPath = path.join(groupAvatarsDir, `${id}.webp`);
        try { fs.unlinkSync(avatarPath); } catch {}
      }
    }

    await db.run('DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2', [id, req.userId]);
    await db.run('DELETE FROM group_admins WHERE chat_id = $1 AND user_id = $2', [id, req.userId]);

    await emitSystemMessage(req.app.locals.io, id, `${myUser.display_name} вышел(а) из группы`);
    req.app.locals.io?.to(`user:${req.userId}`).emit('chat:removed', { chatId: id });

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /chats/:id/leave error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const chat = await db.get('SELECT * FROM chats WHERE id = $1', [id]);
    if (!chat || chat.type !== 'group') return res.status(400).json({ error: 'Not a group chat' });
    if (!(await isGroupAdmin(id, req.userId))) return res.status(403).json({ error: 'Only admins can delete group' });

    const members = await db.all('SELECT user_id FROM chat_members WHERE chat_id = $1', [id]);

    await db.run('DELETE FROM chats WHERE id = $1', [id]);

    const avatarPath = path.join(groupAvatarsDir, `${id}.webp`);
    try { fs.unlinkSync(avatarPath); } catch {}

    for (const { user_id } of members) {
      req.app.locals.io?.to(`user:${user_id}`).emit('chat:removed', { chatId: id });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /chats/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await isMember(id, req.userId))) return res.status(403).json({ error: 'Not a member' });

    const now = Date.now();
    await db.run('UPDATE chat_members SET cleared_at = $1, last_read_message_id = NULL WHERE chat_id = $2 AND user_id = $3',
      [now, id, req.userId]
    );

    res.json({ ok: true, clearedAt: now });
  } catch (err) {
    console.error('DELETE /chats/:id/history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { formatMessage, formatChat, isMember, getChatMembers };
export default router;
