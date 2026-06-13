import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { publicUser } from '../utils/user.js';

const router = Router();
router.use(authMiddleware);

router.get('/nfts', async (req, res) => {
  try {
    const items = await db.all('SELECT * FROM nft_items ORDER BY price ASC');
    const owned = await db.all('SELECT nft_id FROM user_nfts WHERE user_id = $1', [req.userId]);
    const ownedSet = new Set(owned.map(o => o.nft_id));
    const result = items.map(item => ({
      ...item,
      owned: ownedSet.has(item.id),
    }));
    res.json(result);
  } catch (err) {
    console.error('GET /market/nfts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/themes', async (req, res) => {
  try {
    const items = await db.all('SELECT * FROM profile_themes ORDER BY price ASC');
    const owned = await db.all('SELECT theme_id FROM user_themes WHERE user_id = $1', [req.userId]);
    const ownedSet = new Set(owned.map(o => o.theme_id));
    const result = items.map(item => ({
      ...item,
      owned: ownedSet.has(item.id),
    }));
    res.json(result);
  } catch (err) {
    console.error('GET /market/themes error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/nfts/:id/buy', async (req, res) => {
  try {
    const item = await db.get('SELECT * FROM nft_items WHERE id = $1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'NFT not found' });

    const alreadyOwned = await db.get('SELECT 1 FROM user_nfts WHERE user_id = $1 AND nft_id = $2', [req.userId, item.id]);
    if (alreadyOwned) return res.status(409).json({ error: 'Already owned' });

    const user = await db.get('SELECT foreiki FROM users WHERE id = $1', [req.userId]);
    if (user.foreiki < item.price) return res.status(400).json({ error: 'Not enough Foreiki' });

    await db.run('UPDATE users SET foreiki = foreiki - $1 WHERE id = $2', [item.price, req.userId]);
    await db.run('INSERT INTO user_nfts (id, user_id, nft_id, acquired_at) VALUES ($1, $2, $3, $4)', [uuid(), req.userId, item.id, Date.now()]);

    const updated = await db.get('SELECT * FROM users WHERE id = $1', [req.userId]);
    res.json({ ok: true, nft: item, user: publicUser(updated) });
  } catch (err) {
    console.error('POST /market/nfts/:id/buy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/themes/:id/buy', async (req, res) => {
  try {
    const item = await db.get('SELECT * FROM profile_themes WHERE id = $1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Theme not found' });

    const alreadyOwned = await db.get('SELECT 1 FROM user_themes WHERE user_id = $1 AND theme_id = $2', [req.userId, item.id]);
    if (alreadyOwned) return res.status(409).json({ error: 'Already owned' });

    const user = await db.get('SELECT foreiki FROM users WHERE id = $1', [req.userId]);
    if (user.foreiki < item.price) return res.status(400).json({ error: 'Not enough Foreiki' });

    await db.run('UPDATE users SET foreiki = foreiki - $1 WHERE id = $2', [item.price, req.userId]);
    await db.run('INSERT INTO user_themes (user_id, theme_id, purchased_at) VALUES ($1, $2, $3)', [req.userId, item.id, Date.now()]);

    const updated = await db.get('SELECT * FROM users WHERE id = $1', [req.userId]);
    res.json({ ok: true, theme: item, user: publicUser(updated) });
  } catch (err) {
    console.error('POST /market/themes/:id/buy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/my-nfts', async (req, res) => {
  try {
    const items = await db.all(`
      SELECT un.*, ni.name, ni.emoji, ni.rarity, ni.description
      FROM user_nfts un
      JOIN nft_items ni ON ni.id = un.nft_id
      WHERE un.user_id = $1
      ORDER BY un.acquired_at DESC
    `, [req.userId]);
    res.json(items);
  } catch (err) {
    console.error('GET /market/my-nfts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/my-themes', async (req, res) => {
  try {
    const items = await db.all(`
      SELECT ut.*, pt.name, pt.css_effect, pt.description
      FROM user_themes ut
      JOIN profile_themes pt ON pt.id = ut.theme_id
      WHERE ut.user_id = $1
    `, [req.userId]);
    res.json(items);
  } catch (err) {
    console.error('GET /market/my-themes error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/balance', async (req, res) => {
  try {
    const user = await db.get('SELECT foreiki FROM users WHERE id = $1', [req.userId]);
    res.json({ foreiki: user.foreiki });
  } catch (err) {
    console.error('GET /market/balance error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/gift', async (req, res) => {
  try {
    const { toUserId, nftId, message } = req.body;
    if (!toUserId || !nftId) return res.status(400).json({ error: 'toUserId and nftId required' });

    const user = await db.get('SELECT is_moderator FROM users WHERE id = $1', [req.userId]);
    if (!user || !user.is_moderator) return res.status(403).json({ error: 'Only moderators can gift NFTs' });

    const nft = await db.get('SELECT * FROM nft_items WHERE id = $1', [nftId]);
    if (!nft) return res.status(404).json({ error: 'NFT not found' });

    const owned = await db.get('SELECT 1 FROM user_nfts WHERE user_id = $1 AND nft_id = $2', [req.userId, nftId]);
    if (!owned) return res.status(403).json({ error: 'You don\'t own this NFT' });

    const alreadyHas = await db.get('SELECT 1 FROM user_nfts WHERE user_id = $1 AND nft_id = $2', [toUserId, nftId]);
    if (alreadyHas) return res.status(409).json({ error: 'User already has this NFT' });

    await db.run('DELETE FROM user_nfts WHERE user_id = $1 AND nft_id = $2', [req.userId, nftId]);
    await db.run('INSERT INTO user_nfts (id, user_id, nft_id, acquired_at, gift_message) VALUES ($1, $2, $3, $4, $5)',
      [uuid(), toUserId, nftId, Date.now(), message || null]);

    res.json({ ok: true, nft });
  } catch (err) {
    console.error('POST /market/gift error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
