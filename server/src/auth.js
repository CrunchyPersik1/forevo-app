import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' && 'forevo-dev-secret-do-not-use-in-production');
if (!JWT_SECRET) { console.error('FATAL: JWT_SECRET env variable is required'); process.exit(1); }

export function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const payload = verifyToken(header.slice(7));
  if (!payload) return res.status(401).json({ error: 'Invalid token' });
  req.userId = payload.userId;
  next();
}
