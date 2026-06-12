import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import { signToken } from '../auth.js';
import { publicUser, validateUsername } from '../utils/user.js';

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password required' });
    }

    const u = username.toLowerCase().trim();
    const usernameErr = validateUsername(u);
    if (usernameErr) return res.status(400).json({ error: usernameErr });

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await db.get('SELECT id FROM users WHERE username = $1 OR email = $2', [u, email.toLowerCase()]);
    if (existing) return res.status(409).json({ error: 'Username or email already taken' });

    const id = uuid();
    const now = Date.now();
    const hash = bcrypt.hashSync(password, 10);

    await db.run(
      'INSERT INTO users (id, username, email, password_hash, display_name, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, u, email.toLowerCase(), hash, displayName || u, now]
    );

    const user = await db.get('SELECT * FROM users WHERE id = $1', [id]);
    const token = signToken(id);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) {
      return res.status(400).json({ error: 'Login and password required' });
    }

    const user = await db.get(
      'SELECT * FROM users WHERE username = $1 OR email = $1',
      [login.toLowerCase()]
    );

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user.id);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
