import { db } from '../db.js';

export async function isGroupCreator(chatId, userId) {
  const chat = await db.get('SELECT created_by FROM chats WHERE id = $1', [chatId]);
  return chat?.created_by === userId;
}

export async function isGroupAdmin(chatId, userId) {
  if (await isGroupCreator(chatId, userId)) return true;
  const row = await db.get(
    'SELECT 1 FROM group_admins WHERE chat_id = $1 AND user_id = $2',
    [chatId, userId]
  );
  return !!row;
}

export async function getGroupAdmins(chatId) {
  const chat = await db.get('SELECT created_by FROM chats WHERE id = $1', [chatId]);
  const admins = await db.all('SELECT user_id FROM group_admins WHERE chat_id = $1', [chatId]);
  const ids = new Set(admins.map(a => a.user_id));
  if (chat?.created_by) ids.add(chat.created_by);
  return [...ids];
}
