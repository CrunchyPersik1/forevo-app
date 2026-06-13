const token = () => localStorage.getItem('token');

let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

async function request(path, options = {}) {
  const headers = { ...options.headers };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('token');
    if (onUnauthorized) onUnauthorized();
    throw new Error('Сессия истекла. Войдите заново.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  getMe: () => request('/users/me'),
  updateProfile: (body) => request('/users/profile', { method: 'PUT', body: JSON.stringify(body) }),
  updateMe: (body) => request('/users/me', { method: 'PATCH', body: JSON.stringify(body) }),
  checkUsername: (username) => request(`/users/check-username?username=${encodeURIComponent(username)}`),
  changeUsername: (username) => request('/users/me/username', { method: 'PATCH', body: JSON.stringify({ username }) }),
  uploadAvatar: (file) => {
    const fd = new FormData();
    fd.append('avatar', file);
    return request('/users/me/avatar', { method: 'POST', body: fd });
  },
  deleteAvatar: () => request('/users/me/avatar', { method: 'DELETE' }),
  searchUsers: (q) => request(`/users/search?q=${encodeURIComponent(q)}`),
  getUser: (id) => request(`/users/${id}`),
  blockUser: (id) => request(`/users/${id}/block`, { method: 'POST' }),
  unblockUser: (id) => request(`/users/${id}/block`, { method: 'DELETE' }),
  getChats: () => request('/chats'),
  getChat: (id) => request(`/chats/${id}`),
  createDirect: (userId) => request('/chats/direct', { method: 'POST', body: JSON.stringify({ userId }) }),
  createGroup: (name, memberIds) => request('/chats/group', { method: 'POST', body: JSON.stringify({ name, memberIds }) }),
  updateGroup: (id, body) => request(`/chats/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  uploadGroupAvatar: (id, file) => {
    const fd = new FormData();
    fd.append('avatar', file);
    return request(`/chats/${id}/avatar`, { method: 'POST', body: fd });
  },
  deleteGroupAvatar: (id) => request(`/chats/${id}/avatar`, { method: 'DELETE' }),
  getMessages: (chatId, before) => request(`/chats/${chatId}/messages${before ? `?before=${before}` : ''}`),
  sendMessage: (chatId, formData) => request(`/messages/${chatId}`, { method: 'POST', body: formData }),
  editMessage: (id, content) => request(`/messages/${id}`, { method: 'PATCH', body: JSON.stringify({ content }) }),
  deleteMessage: (id) => request(`/messages/${id}`, { method: 'DELETE' }),
  reactMessage: (id, emoji) => request(`/messages/${id}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) }),
  markRead: (chatId, messageId) => request(`/messages/read/${chatId}`, { method: 'POST', body: JSON.stringify({ messageId }) }),
  getOnline: () => request('/online'),
  addMember: (chatId, userId) => request(`/chats/${chatId}/members`, { method: 'POST', body: JSON.stringify({ userId }) }),
  removeMember: (chatId, userId) => request(`/chats/${chatId}/members/${userId}`, { method: 'DELETE' }),
  assignAdmin: (chatId, userId) => request(`/chats/${chatId}/admins`, { method: 'POST', body: JSON.stringify({ userId }) }),
  leaveGroup: (chatId) => request(`/chats/${chatId}/leave`, { method: 'POST' }),
  deleteGroup: (chatId) => request(`/chats/${chatId}`, { method: 'DELETE' }),
  clearHistory: (chatId) => request(`/chats/${chatId}/history`, { method: 'DELETE' }),
  forwardMessage: (messageId, chatId) => request(`/messages/${messageId}/forward`, { method: 'POST', body: JSON.stringify({ chatId }) }),
  pinMessage: (messageId) => request(`/messages/${messageId}/pin`, { method: 'POST' }),
  unpinMessage: (messageId) => request(`/messages/${messageId}/pin`, { method: 'DELETE' }),
  updateNotifications: (emailNotifications) => request('/users/me/notifications', { method: 'PATCH', body: JSON.stringify({ emailNotifications }) }),
  updateNicknameColor: (color) => request('/users/me/nickname-color', { method: 'PATCH', body: JSON.stringify({ color }) }),
  updateAvatarEmoji: (emoji) => request('/users/me/avatar-emoji', { method: 'PATCH', body: JSON.stringify({ emoji }) }),
  updateStatus: (status) => request('/users/me/status', { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateGradient: (gradient) => request('/users/me/gradient', { method: 'PATCH', body: JSON.stringify({ gradient }) }),
  updateSound: (sound) => request('/users/me/sound', { method: 'PATCH', body: JSON.stringify({ sound }) }),
  getMarketNfts: () => request('/market/nfts'),
  getMarketThemes: () => request('/market/themes'),
  buyNft: (id) => request(`/market/nfts/${id}/buy`, { method: 'POST' }),
  buyTheme: (id) => request(`/market/themes/${id}/buy`, { method: 'POST' }),
  getMyNfts: () => request('/market/my-nfts'),
  getMyThemes: () => request('/market/my-themes'),
  getMarketBalance: () => request('/market/balance'),
  giftNft: (toUserId, nftId, message) => request('/market/gift', { method: 'POST', body: JSON.stringify({ toUserId, nftId, message }) }),
};
