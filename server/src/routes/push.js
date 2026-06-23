import { Router } from 'express';
import webpush from 'web-push';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@forevo.app',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

router.get('/vapid-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY || null });
});

router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys) return res.status(400).json({ error: 'endpoint and keys required' });

    const existing = await db.get('SELECT id FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
    if (existing) {
      await db.run('UPDATE push_subscriptions SET user_id = $1, keys = $2 WHERE endpoint = $3', [req.userId, JSON.stringify(keys), endpoint]);
    } else {
      await db.run('INSERT INTO push_subscriptions (id, user_id, endpoint, keys) VALUES ($1, $2, $3, $4)',
        [require('crypto').randomUUID(), req.userId, endpoint, JSON.stringify(keys)]);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /push/subscribe error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/subscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await db.run('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.userId]);
    } else {
      await db.run('DELETE FROM push_subscriptions WHERE user_id = $1', [req.userId]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /push/subscribe error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export async function sendPushNotification(userId, title, body, url) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log('[PUSH] VAPID keys not configured');
    return;
  }

  const subscriptions = await db.all('SELECT endpoint, keys FROM push_subscriptions WHERE user_id = $1', [userId]);
  console.log(`[PUSH] Sending to user=${userId}, subscriptions=${subscriptions.length}`);

  for (const sub of subscriptions) {
    try {
      const subscription = {
        endpoint: sub.endpoint,
        keys: JSON.parse(sub.keys),
      };

      await webpush.sendNotification(subscription, JSON.stringify({
        title,
        body,
        url: url || '/',
        icon: '/icon.png',
      }));
      console.log(`[PUSH] Sent successfully to ${sub.endpoint.substring(0, 50)}...`);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await db.run('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
      }
      console.error(`[PUSH] Failed to send to ${sub.endpoint.substring(0, 50)}...:`, err.message);
    }
  }
}

export default router;
