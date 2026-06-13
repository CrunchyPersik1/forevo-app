import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { v4 as uuid } from 'uuid';

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
  async query(text, params) {
    return pool.query(text, params);
  },
  async get(text, params) {
    const { rows } = await pool.query(text, params);
    return rows[0] || null;
  },
  async all(text, params) {
    const { rows } = await pool.query(text, params);
    return rows;
  },
  async run(text, params) {
    const { rowCount } = await pool.query(text, params);
    return { changes: rowCount };
  },
};

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar TEXT,
      bio TEXT DEFAULT '',
      last_seen BIGINT,
      created_at BIGINT NOT NULL,
      username_updated_at BIGINT,
      last_avatar_update BIGINT,
      email_notifications BOOLEAN DEFAULT true,
      nickname_color TEXT DEFAULT NULL,
      is_moderator BOOLEAN DEFAULT false,
      avatar_emoji TEXT DEFAULT NULL,
      user_status TEXT DEFAULT 'online',
      foreiki INTEGER DEFAULT 0,
      profile_gradient TEXT DEFAULT NULL,
      profile_sound INTEGER DEFAULT 0,
      badges TEXT[] DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('direct', 'group')),
      name TEXT,
      avatar TEXT,
      created_by TEXT REFERENCES users(id),
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_members (
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'member' CHECK(role IN ('admin', 'member')),
      joined_at BIGINT NOT NULL,
      last_read_message_id TEXT,
      cleared_at BIGINT,
      PRIMARY KEY (chat_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      sender_id TEXT REFERENCES users(id),
      content TEXT,
      type TEXT NOT NULL DEFAULT 'text' CHECK(type IN ('text', 'image', 'file', 'voice', 'system')),
      reply_to_id TEXT REFERENCES messages(id),
      forwarded_from_chat_id TEXT REFERENCES chats(id),
      mentions TEXT[] DEFAULT '{}',
      edited_at BIGINT,
      deleted_at BIGINT,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS message_reactions (
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (message_id, user_id, emoji)
    );

    CREATE TABLE IF NOT EXISTS user_blocks (
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (blocker_id, blocked_id)
    );

    CREATE TABLE IF NOT EXISTS group_admins (
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (chat_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS pinned_messages (
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      pinned_by TEXT REFERENCES users(id),
      pinned_at BIGINT NOT NULL,
      PRIMARY KEY (chat_id, message_id)
    );

    CREATE TABLE IF NOT EXISTS nft_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'nft',
      rarity TEXT NOT NULL DEFAULT 'common' CHECK(rarity IN ('common', 'rare', 'epic', 'legendary')),
      price INTEGER NOT NULL DEFAULT 10,
      description TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS user_nfts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nft_id TEXT NOT NULL REFERENCES nft_items(id),
      acquired_at BIGINT NOT NULL,
      gift_message TEXT DEFAULT NULL,
      UNIQUE(user_id, nft_id)
    );

    CREATE TABLE IF NOT EXISTS profile_themes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      css_effect TEXT NOT NULL,
      price INTEGER NOT NULL DEFAULT 50,
      preview TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS user_themes (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      theme_id TEXT NOT NULL REFERENCES profile_themes(id),
      purchased_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, theme_id)
    );
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');

  const userCols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`);
  const userColNames = userCols.rows.map(r => r.column_name);
  if (!userColNames.includes('email_notifications')) {
    await pool.query('ALTER TABLE users ADD COLUMN email_notifications BOOLEAN DEFAULT true');
  }
  if (!userColNames.includes('nickname_color')) {
    await pool.query('ALTER TABLE users ADD COLUMN nickname_color TEXT DEFAULT NULL');
  }
  if (!userColNames.includes('is_moderator')) {
    await pool.query('ALTER TABLE users ADD COLUMN is_moderator BOOLEAN DEFAULT false');
  }
  if (!userColNames.includes('avatar_emoji')) {
    await pool.query('ALTER TABLE users ADD COLUMN avatar_emoji TEXT DEFAULT NULL');
  }
  if (!userColNames.includes('user_status')) {
    await pool.query("ALTER TABLE users ADD COLUMN user_status TEXT DEFAULT 'online'");
  }
  if (!userColNames.includes('foreiki')) {
    await pool.query('ALTER TABLE users ADD COLUMN foreiki INTEGER DEFAULT 0');
  }
  if (!userColNames.includes('profile_gradient')) {
    await pool.query('ALTER TABLE users ADD COLUMN profile_gradient TEXT DEFAULT NULL');
  }
  if (!userColNames.includes('profile_sound')) {
    await pool.query('ALTER TABLE users ADD COLUMN profile_sound INTEGER DEFAULT 0');
  }
  if (!userColNames.includes('badges')) {
    await pool.query(`ALTER TABLE users ADD COLUMN badges TEXT[] DEFAULT '{}'`);
  }

  const themeCols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'profile_themes'`);
  const themeColNames = themeCols.rows.map(r => r.column_name);
  if (!themeColNames.includes('description')) {
    await pool.query("ALTER TABLE profile_themes ADD COLUMN description TEXT DEFAULT ''");
  }

  const msgCols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'messages'`);
  const msgColNames = msgCols.rows.map(r => r.column_name);
  if (!msgColNames.includes('forwarded_from_chat_id')) {
    await pool.query('ALTER TABLE messages ADD COLUMN forwarded_from_chat_id TEXT REFERENCES chats(id)');
  }
  if (!msgColNames.includes('mentions')) {
    await pool.query(`ALTER TABLE messages ADD COLUMN mentions TEXT[] DEFAULT '{}'`);
  }

  console.log('[DB] PostgreSQL tables initialized');

  const crunchy = await db.get('SELECT id FROM users WHERE username = $1', ['crunchypersik']);
  if (crunchy) {
    await db.run('UPDATE users SET is_moderator = true, foreiki = 1000 WHERE id = $1', [crunchy.id]);
    const crunchyNfts = await db.get('SELECT COUNT(*)::int as count FROM user_nfts WHERE user_id = $1', [crunchy.id]);
    if (crunchyNfts && crunchyNfts.count === 0) {
      const starterNfts = [
        'nft-diamond', 'nft-fire', 'nft-star', 'nft-crown', 'nft-rocket', 'nft-dragon',
        'nft-unicorn', 'nft-galaxy', 'nft-phoenix', 'nft-moon', 'nft-sun', 'nft-bolt',
        'nft-snow', 'nft-rainbow', 'nft-heart',
        'nft-diamond', 'nft-fire', 'nft-star', 'nft-crown', 'nft-rocket', 'nft-dragon',
        'nft-unicorn', 'nft-galaxy', 'nft-phoenix', 'nft-moon', 'nft-sun', 'nft-bolt',
        'nft-snow', 'nft-rainbow', 'nft-heart',
        'nft-diamond', 'nft-fire', 'nft-star', 'nft-crown', 'nft-rocket', 'nft-dragon',
        'nft-unicorn', 'nft-galaxy', 'nft-phoenix', 'nft-moon', 'nft-sun', 'nft-bolt',
        'nft-snow', 'nft-rainbow', 'nft-heart',
        'nft-diamond', 'nft-fire', 'nft-star', 'nft-crown', 'nft-rocket', 'nft-dragon',
        'nft-unicorn', 'nft-galaxy',
      ];
      for (const nftId of starterNfts) {
        await db.run('INSERT INTO user_nfts (id, user_id, nft_id, acquired_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [uuid(), crunchy.id, nftId, Date.now()]);
      }
    }
  }

  const nftCount = await db.get('SELECT COUNT(*)::int as count FROM nft_items');
  if (nftCount && nftCount.count === 0) {
    const nfts = [
      ['nft-aurora', '🌌', 'Аврора', 'nft', 'common', 15, 'Северное сияние'],
      ['nft-ember', '🔮', 'Пламя Души', 'nft', 'common', 15, 'Тёплый свет внутри'],
      ['nft-cipher', '🔐', 'Шифр', 'nft', 'common', 15, 'Закодированная тайна'],
      ['nft-void', '🕳️', 'Бездна', 'nft', 'common', 20, 'Тьма на краю мироздания'],
      ['nft-echo', '💫', 'Эхо', 'nft', 'rare', 35, 'Отзвук далёкой галактики'],
      ['nft-prism', '🔷', 'Призма', 'nft', 'rare', 40, 'Рассеивает свет на спектр'],
      ['nft-nova', '💥', 'Нова', 'nft', 'rare', 45, 'Взрыв новой звезды'],
      ['nft-spectrum', '🌈', 'Спектр', 'nft', 'rare', 40, 'Полная палитра вселенной'],
      ['nft-eclipse', '🌑', 'Затмение', 'nft', 'epic', 75, 'Луна закрыла солнце'],
      ['nft-phantom', '👻', 'Фантом', 'nft', 'epic', 80, 'Призрак прошлого века'],
      ['nft-zenith', '⛰️', 'Зенит', 'nft', 'epic', 85, 'Вершина мироздания'],
      ['nft-singularity', '🕳️', 'Сингулярность', 'nft', 'legendary', 150, 'Точка без возврата'],
      ['nft-leviathan', '🐉', 'Левиафан', 'nft', 'legendary', 180, 'Древний морской владыка'],
      ['nft-chronos', '⏳', 'Хронос', 'nft', 'legendary', 200, 'Повелитель времени'],
      ['nft-omega', '🔴', 'Омега', 'nft', 'legendary', 250, 'Последняя точка пути'],
    ];
    for (const [id, emoji, name, cat, rarity, price, desc] of nfts) {
      await db.run('INSERT INTO nft_items (id, name, emoji, category, rarity, price, description) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, name, emoji, cat, rarity, price, desc]);
    }
  }

  const themeCount = await db.get('SELECT COUNT(*)::int as count FROM profile_themes');
  if (themeCount && themeCount.count === 0) {
    const themes = [
      ['theme-cyberpunk', 'Киберпанк', 'cyberpunk', 50, 'Неон + дождь'],
      ['theme-vintage', 'Винтаж', 'vintage', 50, 'Плёнка + шум'],
      ['theme-nature', 'Природа', 'nature', 50, 'Падающие листья'],
      ['theme-space', 'Космос', 'space', 75, 'Падающие звёзды'],
      ['theme-night', 'Ночная трава', 'nightgrass', 75, 'Луна + роса'],
      ['theme-fire', 'Огонь', 'fireprofile', 75, 'Пламя снизу'],
      ['theme-ocean', 'Океан', 'ocean', 60, 'Волны + пузырьки'],
      ['theme-sakura', 'Сакура', 'sakura', 60, 'Падающие лепестки'],
    ];
    for (const [id, name, css, price, desc] of themes) {
      await db.run('INSERT INTO profile_themes (id, name, css_effect, price, description) VALUES ($1,$2,$3,$4,$5)', [id, name, css, price, desc]);
    }
  }
}

export { db, pool, uploadsDir, avatarsDir, groupAvatarsDir, initDB };
