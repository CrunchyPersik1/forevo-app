import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { db, avatarsDir } from '../db.js';
import { authMiddleware } from '../auth.js';
import {
  publicUser,
  validateUsername,
  sanitizeBio,
  emitUserUpdated,
  USERNAME_CHANGE_COOLDOWN,
} from '../utils/user.js';
import { getBlockStatus } from '../utils/blocks.js';
import { verifyToken } from '../auth.js';
import { getOnlineUsers } from '../socket.js';

const router = Router();

function getOptionalUserId(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const payload = verifyToken(header.slice(7));
  return payload?.userId ?? null;
}

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: avatarsDir,
    filename: (req, _file, cb) => cb(null, `${req.userId}.webp`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Only JPG, PNG, GIF, WEBP allowed'), ok);
  },
});

router.get('/check-username', async (req, res) => {
  const username = (req.query.username || '').toLowerCase().trim();
  const err = validateUsername(username);
  if (err) return res.json({ available: false, error: err });

  const userId = getOptionalUserId(req) || '';
  const existing = await db.get('SELECT id FROM users WHERE username = $1 AND id != $2', [username, userId]);
  res.json({ available: !existing, username });
});

router.use(authMiddleware);

router.get('/me', async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = $1', [req.userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(publicUser(user));
});

router.put('/profile', async (req, res) => {
  const { displayName, bio } = req.body;
  const user = await db.get('SELECT * FROM users WHERE id = $1', [req.userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const cleanBio = bio !== undefined ? sanitizeBio(bio) : user.bio;
  const name = displayName !== undefined ? String(displayName).trim().slice(0, 50) || user.display_name : user.display_name;

  await db.run('UPDATE users SET display_name = $1, bio = $2 WHERE id = $3', [name, cleanBio, req.userId]);

  const updated = await db.get('SELECT * FROM users WHERE id = $1', [req.userId]);
  emitUserUpdated(req.app.locals.io, updated);
  res.json(publicUser(updated));
});

router.patch('/me', async (req, res) => {
  const { displayName, bio } = req.body;
  const user = await db.get('SELECT * FROM users WHERE id = $1', [req.userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const cleanBio = bio !== undefined ? sanitizeBio(bio) : user.bio;
  const name = displayName !== undefined ? String(displayName).trim().slice(0, 50) || user.display_name : user.display_name;

  await db.run('UPDATE users SET display_name = $1, bio = $2 WHERE id = $3', [name, cleanBio, req.userId]);

  const updated = await db.get('SELECT * FROM users WHERE id = $1', [req.userId]);
  emitUserUpdated(req.app.locals.io, updated);
  res.json(publicUser(updated));
});

router.patch('/me/username', async (req, res) => {
  const { username } = req.body;
  const user = await db.get('SELECT * FROM users WHERE id = $1', [req.userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const u = (username || '').toLowerCase().trim();
  const err = validateUsername(u);
  if (err) return res.status(400).json({ error: err });

  if (u === user.username) return res.json(publicUser(user));

  if (user.username_updated_at) {
    const elapsed = Date.now() - user.username_updated_at;
    if (elapsed < USERNAME_CHANGE_COOLDOWN) {
      const daysLeft = Math.ceil((USERNAME_CHANGE_COOLDOWN - elapsed) / (24 * 60 * 60 * 1000));
      return res.status(429).json({ error: `Username can be changed again in ${daysLeft} days` });
    }
  }

  const taken = await db.get('SELECT id FROM users WHERE username = $1 AND id != $2', [u, req.userId]);
  if (taken) return res.status(409).json({ error: 'Username already taken' });

  const now = Date.now();
  await db.run('UPDATE users SET username = $1, username_updated_at = $2 WHERE id = $3', [u, now, req.userId]);

  const updated = await db.get('SELECT * FROM users WHERE id = $1', [req.userId]);
  emitUserUpdated(req.app.locals.io, updated);
  res.json(publicUser(updated));
});

router.post('/me/avatar', (req, res, next) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const now = Date.now();
  const avatarUrl = `/avatars/${req.userId}.webp?v=${now}`;
  await db.run('UPDATE users SET avatar = $1, last_avatar_update = $2 WHERE id = $3', [avatarUrl, now, req.userId]);

  const updated = await db.get('SELECT * FROM users WHERE id = $1', [req.userId]);
  req.app.locals.io?.emit('user:avatar_update', { userId: req.userId, avatar: avatarUrl });
  emitUserUpdated(req.app.locals.io, updated);
  res.json(publicUser(updated));
});

router.delete('/me/avatar', async (req, res) => {
  const filePath = path.join(avatarsDir, `${req.userId}.webp`);
  try { fs.unlinkSync(filePath); } catch {}

  await db.run('UPDATE users SET avatar = NULL, last_avatar_update = $1 WHERE id = $2', [Date.now(), req.userId]);

  const updated = await db.get('SELECT * FROM users WHERE id = $1', [req.userId]);
  req.app.locals.io?.emit('user:avatar_update', { userId: req.userId, avatar: null });
  emitUserUpdated(req.app.locals.io, updated);
  res.json(publicUser(updated));
});

router.patch('/me/notifications', async (req, res) => {
  const { emailNotifications } = req.body;
  await db.run('UPDATE users SET email_notifications = $1 WHERE id = $2', [!!emailNotifications, req.userId]);
  const updated = await db.get('SELECT * FROM users WHERE id = $1', [req.userId]);
  res.json(publicUser(updated));
});

router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q) return res.json([]);
  const escaped = q.replace(/[%_]/g, m => '\\' + m);

  const users = await db.all(`
    SELECT u.* FROM users u
    WHERE u.id != $1
      AND (u.username ILIKE $2 OR u.display_name ILIKE $2)
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks b
        WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
           OR (b.blocker_id = u.id AND b.blocked_id = $1)
      )
    LIMIT 20
  `, [req.userId, `%${escaped}%`]);

  res.json(users.map(u => publicUser(u)));
});

router.get('/:id', async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = $1', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const block = await getBlockStatus(req.userId, user.id);
  const online = getOnlineUsers().includes(user.id);

  res.json(publicUser(user, {
    online,
    ...block,
  }));
});

router.post('/:id/block', async (req, res) => {
  const targetId = req.params.id;
  if (targetId === req.userId) return res.status(400).json({ error: 'Cannot block yourself' });

  const target = await db.get('SELECT id FROM users WHERE id = $1', [targetId]);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const exists = await db.get(
    'SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2',
    [req.userId, targetId]
  );

  if (!exists) {
    await db.run('INSERT INTO user_blocks (blocker_id, blocked_id, created_at) VALUES ($1, $2, $3)',
      [req.userId, targetId, Date.now()]
    );
  }

  res.json({ ok: true, iBlocked: true });
});

router.delete('/:id/block', async (req, res) => {
  await db.run('DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2',
    [req.userId, req.params.id]
  );
  res.json({ ok: true, iBlocked: false });
});

export default router;
