import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const uploadsDir = path.join(dataDir, 'uploads');
const avatarsDir = path.join(uploadsDir, 'avatars');
const groupAvatarsDir = path.join(uploadsDir, 'groups');

for (const dir of [dataDir, uploadsDir, avatarsDir, groupAvatarsDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const db = {
  async query(text, params) { return pool.query(text, params); },
  async get(text, params) { const { rows } = await pool.query(text, params); return rows[0] || null; },
  async all(text, params) { const { rows } = await pool.query(text, params); return rows; },
  async run(text, params) { const { rowCount } = await pool.query(text, params); return { changes: rowCount }; },
};

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, display_name TEXT NOT NULL, avatar TEXT, bio TEXT DEFAULT '',
      last_seen BIGINT, created_at BIGINT NOT NULL, username_updated_at BIGINT,
      last_avatar_update BIGINT, email_notifications BOOLEAN DEFAULT true,
      nickname_color TEXT DEFAULT NULL, is_moderator BOOLEAN DEFAULT false,
      avatar_emoji TEXT DEFAULT NULL, user_status TEXT DEFAULT 'online',
      profile_emojis TEXT[] DEFAULT '{✨,💫,⭐,🌟,💖,💜,🔮,💎}',
      verified BOOLEAN DEFAULT false, bubble_radius TEXT DEFAULT '16px',
      chat_size TEXT DEFAULT '46px', profile_gradient TEXT DEFAULT NULL,
      profile_sound INTEGER DEFAULT 0, badges TEXT[] DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK(type IN ('direct', 'group')),
      name TEXT, avatar TEXT, created_by TEXT REFERENCES users(id), created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_members (
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'member' CHECK(role IN ('admin', 'member')),
      joined_at BIGINT NOT NULL, last_read_message_id TEXT, cleared_at BIGINT,
      PRIMARY KEY (chat_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      sender_id TEXT REFERENCES users(id), content TEXT,
      type TEXT NOT NULL DEFAULT 'text' CHECK(type IN ('text', 'image', 'file', 'voice', 'video', 'system')),
      reply_to_id TEXT REFERENCES messages(id), forwarded_from_chat_id TEXT REFERENCES chats(id),
      mentions TEXT[] DEFAULT '{}', edited_at BIGINT, deleted_at BIGINT, created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      filename TEXT NOT NULL, original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS message_reactions (
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL, created_at BIGINT NOT NULL,
      PRIMARY KEY (message_id, user_id, emoji)
    );
    CREATE TABLE IF NOT EXISTS user_blocks (
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at BIGINT NOT NULL, PRIMARY KEY (blocker_id, blocked_id)
    );
    CREATE TABLE IF NOT EXISTS group_admins (
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at BIGINT NOT NULL, PRIMARY KEY (chat_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS pinned_messages (
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      pinned_by TEXT REFERENCES users(id), pinned_at BIGINT NOT NULL,
      PRIMARY KEY (chat_id, message_id)
    );
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE, keys TEXT NOT NULL,
      created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
    );
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL REFERENCES users(id),
      message_id TEXT REFERENCES messages(id), reason TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'dismissed')),
      created_at BIGINT NOT NULL
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
  const userCols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`);
  const uc = userCols.rows.map(r => r.column_name);
  const addCol = async (c, t) => { if (!uc.includes(c)) await pool.query(`ALTER TABLE users ADD COLUMN ${c} ${t}`); };
  await addCol('email_notifications', 'BOOLEAN DEFAULT true');
  await addCol('nickname_color', 'TEXT DEFAULT NULL');
  await addCol('is_moderator', 'BOOLEAN DEFAULT false');
  await addCol('avatar_emoji', 'TEXT DEFAULT NULL');
  await addCol('user_status', "TEXT DEFAULT 'online'");
  await addCol('profile_emojis', "TEXT[] DEFAULT '{✨,💫,⭐,🌟,💖,💜,🔮,💎}'");
  await addCol('verified', 'BOOLEAN DEFAULT false');
  await addCol('bubble_radius', "TEXT DEFAULT '16px'");
  await addCol('chat_size', "TEXT DEFAULT '46px'");
  await addCol('profile_gradient', 'TEXT DEFAULT NULL');
  await addCol('profile_sound', 'INTEGER DEFAULT 0');
  await addCol('badges', "TEXT[] DEFAULT '{}'");
  const crunchy = await db.get('SELECT id FROM users WHERE username = $1', ['crunchypersik']);
  if (crunchy) await db.run('UPDATE users SET is_moderator = true, verified = true WHERE id = $1', [crunchy.id]);
  console.log('[DB] PostgreSQL tables initialized');
}
export { db, pool, uploadsDir, avatarsDir, groupAvatarsDir, initDB };
