import { verifyToken } from './auth.js';
import { db } from './db.js';
import { isMember } from './routes/chats.js';

const onlineUsers = new Map();

export function setupSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized'));
    const payload = verifyToken(token);
    if (!payload) return next(new Error('Invalid token'));
    socket.userId = payload.userId;
    next();
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;

    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);

    socket.join(`user:${userId}`);

    await db.run('UPDATE users SET last_seen = NULL WHERE id = $1', [userId]);
    io.emit('user:online', { userId, online: true });

    const chats = await db.all('SELECT chat_id FROM chat_members WHERE user_id = $1', [userId]);
    for (const { chat_id } of chats) {
      socket.join(`chat:${chat_id}`);
    }

    socket.on('chat:join', async (chatId) => {
      if (await isMember(chatId, userId)) {
        socket.join(`chat:${chatId}`);
      }
    });

    socket.on('typing:start', async ({ chatId }) => {
      if (!(await isMember(chatId, userId))) return;
      socket.to(`chat:${chatId}`).emit('typing:start', { chatId, userId });
    });

    socket.on('typing:stop', async ({ chatId }) => {
      if (!(await isMember(chatId, userId))) return;
      socket.to(`chat:${chatId}`).emit('typing:stop', { chatId, userId });
    });

    socket.on('disconnect', async () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          const now = Date.now();
          await db.run('UPDATE users SET last_seen = $1 WHERE id = $2', [now, userId]);
          io.emit('user:online', { userId, online: false, lastSeen: now });
        }
      }
    });
  });
}

export function getOnlineUsers() {
  return [...onlineUsers.keys()];
}
