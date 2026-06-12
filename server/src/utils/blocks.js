import { db } from '../db.js';

export async function isBlocked(userIdA, userIdB) {
  if (!userIdA || !userIdB) return false;
  const row = await db.get(`
    SELECT 1 FROM user_blocks
    WHERE (blocker_id = $1 AND blocked_id = $2)
       OR (blocker_id = $2 AND blocked_id = $1)
  `, [userIdA, userIdB]);
  return !!row;
}

export async function isBlockedBy(blockerId, blockedId) {
  return !!(await db.get(
    'SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2',
    [blockerId, blockedId]
  ));
}

export async function getBlockStatus(viewerId, targetId) {
  const iBlocked = !!(await db.get(
    'SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2',
    [viewerId, targetId]
  ));
  const blockedMe = !!(await db.get(
    'SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2',
    [targetId, viewerId]
  ));
  return { iBlocked, blockedMe, isBlocked: iBlocked || blockedMe };
}
