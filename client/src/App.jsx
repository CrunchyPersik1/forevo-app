import { useState, useEffect, useCallback, useRef } from 'react';
import { api, setUnauthorizedHandler } from './api';
import { connectSocket, disconnectSocket, getSocket } from './socket';
import Auth from './components/Auth';
import ChatList from './components/ChatList';
import ChatWindow from './components/ChatWindow';
import UserSearch from './components/UserSearch';
import CreateGroup from './components/CreateGroup';
import Profile from './components/Profile';
import UserProfile from './components/UserProfile';
import GroupSettings from './components/GroupSettings';
import ForwardModal from './components/ForwardModal';
import Changelog from './components/Changelog';
import BottomNav from './components/BottomNav';
import './App.css';

function applyUserToChats(chats, updatedUser, myId) {
  return chats.map(c => {
    const members = c.members.map(m => m.id === updatedUser.id ? { ...m, ...updatedUser } : m);
    let patch = { members };
    if (c.type === 'direct') {
      const other = members.find(m => m.id !== myId);
      if (other?.id === updatedUser.id) {
        patch = { ...patch, name: updatedUser.displayName, avatar: updatedUser.avatar };
      }
    }
    return { ...c, ...patch };
  });
}

export default function App() {
  const [user, setUser] = useState(null);
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [viewProfileId, setViewProfileId] = useState(null);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem('forevo-theme') || 'dark-purple');
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [notifEnabled, setNotifEnabled] = useState(() => typeof Notification !== 'undefined' && Notification.permission === 'granted');
  const [activeTab, setActiveTab] = useState('chats');
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [showArchive, setShowArchive] = useState(false);

  const archivedIds = useRef(new Set(JSON.parse(localStorage.getItem('forevo-archived') || '[]')));
  const [archivedVersion, setArchivedVersion] = useState(0);
  const saveArchive = () => {
    localStorage.setItem('forevo-archived', JSON.stringify([...archivedIds.current]));
    setArchivedVersion(v => v + 1);
  };

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const getWallpaper = (chatId) => localStorage.getItem(`forevo-wallpaper-${chatId}`) || null;
  const setWallpaper = (chatId, url) => {
    if (url) localStorage.setItem(`forevo-wallpaper-${chatId}`, url);
    else localStorage.removeItem(`forevo-wallpaper-${chatId}`);
    setActiveChat(prev => prev?.id === chatId ? { ...prev, _wallpaper: url } : prev);
  };

  const getChatTheme = (chatId) => {
    try { return JSON.parse(localStorage.getItem(`forevo-theme-${chatId}`)); } catch { return null; }
  };
  const setChatTheme = (chatId, themeObj) => {
    if (themeObj && themeObj.bg) localStorage.setItem(`forevo-theme-${chatId}`, JSON.stringify(themeObj));
    else localStorage.removeItem(`forevo-theme-${chatId}`);
    setActiveChat(prev => prev?.id === chatId ? { ...prev, _chatTheme: themeObj } : prev);
  };

  const chatMessagesRef = useRef(new Map());
  const [displayMessages, setDisplayMessages] = useState([]);
  const activeChatIdRef = useRef(null);

  const activeChatRef = useRef(null);
  activeChatRef.current = activeChat;

  const userRef = useRef(null);
  userRef.current = user;

  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('forevo-theme', theme);
  }, [theme]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker?.register('/sw.js').catch(() => {});
    }
  }, []);

  const requestNotificationPermission = async () => {
    console.log('[NOTIF] Requesting permission, current:', Notification.permission);
    if (!('Notification' in window)) {
      alert('Ваш браузер не поддерживает уведомления. Попробуйте Chrome или Edge.');
      return;
    }
    if (Notification.permission === 'granted') {
      alert('Уведомления уже включены!');
      return;
    }
    if (Notification.permission === 'denied') {
      alert('Уведомления заблокированы. Разрешите их в настройках браузера.');
      return;
    }
    const permission = await Notification.requestPermission();
    console.log('[NOTIF] Permission result:', permission);
    if (permission === 'granted') {
      alert('Уведомления включены!');
    } else {
      alert('Уведомления не были разрешены.');
    }
  };

  const subscribePush = async () => {
    try {
      const reg = await navigator.serviceWorker?.ready;
      if (!reg) return;

      const { publicKey } = await api.getVapidKey();
      if (!publicKey) return;

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      });

      await api.subscribePush({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))),
          auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')))),
        },
      });
    } catch (err) {
      console.error('Push subscribe error:', err);
    }
  };

  const enableNotifications = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setNotifEnabled(true);
        await subscribePush();
        return true;
      }
    }
    return false;
  };

  const disableNotifications = async () => {
    try {
      const reg = await navigator.serviceWorker?.ready;
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await api.unsubscribePush({ endpoint: sub.endpoint });
          await sub.unsubscribe();
        }
      }
    } catch {}
    setNotifEnabled(false);
  };

  const playNotificationSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      osc.type = 'sine';
      gain.gain.value = 0.15;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  };

  const showBrowserNotification = (title, body, url) => {
    console.log('[NOTIF] Attempting notification:', title, body, 'Permission:', Notification.permission);
    if (!('Notification' in window)) {
      console.log('[NOTIF] Notification API not available');
      return;
    }
    if (Notification.permission !== 'granted') {
      console.log('[NOTIF] Permission not granted:', Notification.permission);
      return;
    }
    try {
      new Notification(title, { body, icon: '/icon.png', tag: 'forevo-' + Date.now() });
      console.log('[NOTIF] Notification shown successfully');
    } catch (err) {
      console.error('[NOTIF] Failed to show notification:', err);
    }
  };

  const toggleTheme = () => {
    const themes = ['dark-purple', 'dark-blue', 'dark-green', 'light-purple', 'light-blue', 'light-green'];
    const idx = themes.indexOf(theme);
    setTheme(themes[(idx + 1) % themes.length]);
  };

  const themeIcon = theme.startsWith('dark') ? '🌙' : '☀️';

  const refreshDisplay = useCallback((chatId) => {
    if (activeChatIdRef.current === chatId) {
      setDisplayMessages(chatMessagesRef.current.get(chatId) || []);
    }
  }, []);

  const loadChats = useCallback(async () => {
    const data = await api.getChats();
    setChats(data.map(c => ({ ...c, _myId: userRef.current?.id })));
  }, []);

  const loadMessages = useCallback(async (chatId) => {
    const data = await api.getMessages(chatId);
    chatMessagesRef.current.set(chatId, data);
    refreshDisplay(chatId);
  }, [refreshDisplay]);

  const loadMoreMessages = useCallback(async (chatId, before) => {
    const older = await api.getMessages(chatId, before);
    if (older.length) {
      const existing = chatMessagesRef.current.get(chatId) || [];
      chatMessagesRef.current.set(chatId, [...older, ...existing]);
      refreshDisplay(chatId);
    }
    return older;
  }, [refreshDisplay]);

  const updateUserInState = useCallback((updatedUser) => {
    if (!updatedUser) return;
    const myId = userRef.current?.id;
    setUser(prev => prev?.id === updatedUser.id ? updatedUser : prev);
    setChats(prev => applyUserToChats(prev, updatedUser, myId));
    setActiveChat(prev => {
      if (!prev) return prev;
      const members = prev.members.map(m => m.id === updatedUser.id ? { ...m, ...updatedUser } : m);
      let patch = { members };
      if (prev.type === 'direct') {
        const other = members.find(m => m.id !== myId);
        if (other?.id === updatedUser.id) {
          patch = { ...patch, name: updatedUser.displayName, avatar: updatedUser.avatar };
        }
      }
      return { ...prev, ...patch };
    });
    for (const [chatId, msgs] of chatMessagesRef.current) {
      const updated = msgs.map(m =>
        m.senderId === updatedUser.id
          ? { ...m, senderName: updatedUser.displayName, senderAvatar: updatedUser.avatar, senderNicknameColor: updatedUser.nicknameColor, senderIsModerator: updatedUser.isModerator, senderAvatarEmoji: updatedUser.avatarEmoji }
          : m
      );
      chatMessagesRef.current.set(chatId, updated);
    }
    refreshDisplay(activeChatIdRef.current);
  }, [refreshDisplay]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }

    api.getMe()
      .then(u => { setUser(u); return api.getOnline(); })
      .then(setOnlineUsers)
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadChats();
    const socket = connectSocket();

    const onMessageNew = (msg) => {
      const chatId = msg.chatId;
      const existing = chatMessagesRef.current.get(chatId) || [];
      if (!existing.find(m => m.id === msg.id)) {
        chatMessagesRef.current.set(chatId, [...existing, msg]);
        refreshDisplay(chatId);
      }
      if (msg.senderId !== userRef.current?.id && chatId !== activeChatIdRef.current) {
        playNotificationSound();
        const chatName = chatsRef.current?.find(c => c.id === chatId)?.name || 'Forevo';
        showBrowserNotification(msg.senderName || chatName, msg.content || 'Вложение');
      }
      setChats(prev => {
        const ac = activeChatIdRef.current;
        const updated = prev.map(c => {
          if (c.id !== chatId) return c;
          return {
            ...c,
            lastMessage: msg,
            unreadCount: ac === chatId || msg.senderId === userRef.current?.id
              ? c.unreadCount
              : (c.unreadCount || 0) + 1,
          };
        });
        return updated.sort((a, b) => {
          const at = a.lastMessage?.createdAt || a.createdAt;
          const bt = b.lastMessage?.createdAt || b.createdAt;
          return bt - at;
        });
      });
    };

    const onMessageUpdated = (msg) => {
      const chatId = msg.chatId;
      const existing = chatMessagesRef.current.get(chatId) || [];
      chatMessagesRef.current.set(chatId, existing.map(m => m.id === msg.id ? msg : m));
      refreshDisplay(chatId);
    };

    const onMessageReaction = ({ messageId, chatId, reactions }) => {
      const existing = chatMessagesRef.current.get(chatId) || [];
      chatMessagesRef.current.set(chatId, existing.map(m => m.id === messageId ? { ...m, reactions } : m));
      refreshDisplay(chatId);
    };

    const onMessageRead = () => {
      loadChats();
    };

    const onUserOnline = ({ userId, online, lastSeen }) => {
      setOnlineUsers(prev => {
        if (online) return prev.includes(userId) ? prev : [...prev, userId];
        return prev.filter(id => id !== userId);
      });
      setChats(prev => prev.map(c => ({
        ...c,
        members: c.members.map(m => m.id === userId ? { ...m, lastSeen: lastSeen ?? m.lastSeen } : m),
      })));
    };

    const onUserUpdated = (updatedUser) => updateUserInState(updatedUser);

    const onUserAvatarUpdate = ({ userId, avatar }) => {
      setChats(prev => applyUserToChats(prev, { id: userId, avatar }, userRef.current?.id));
      if (userRef.current?.id === userId) setUser(u => ({ ...u, avatar }));
    };

    const onChatUpdated = (chat) => {
      setChats(prev => prev.map(c => c.id === chat.id ? { ...chat, _myId: userRef.current?.id } : c));
      setActiveChat(prev => prev?.id === chat.id ? { ...chat, _myId: userRef.current?.id } : prev);
    };

    const onChatNew = (chat) => {
      setChats(prev => {
        if (prev.find(c => c.id === chat.id)) return prev;
        return [{ ...chat, _myId: userRef.current?.id }, ...prev];
      });
    };

    const onChatRemoved = ({ chatId }) => {
      setChats(prev => prev.filter(c => c.id !== chatId));
      chatMessagesRef.current.delete(chatId);
      setActiveChat(prev => {
        if (prev?.id === chatId) {
          activeChatIdRef.current = null;
          setDisplayMessages([]);
          return null;
        }
        return prev;
      });
    };

    const onMessagePin = ({ chatId, message }) => {
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, pinnedMessage: message } : c));
      setActiveChat(prev => prev?.id === chatId ? { ...prev, pinnedMessage: message } : prev);
    };

    const onMessageUnpin = ({ chatId }) => {
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, pinnedMessage: null } : c));
      setActiveChat(prev => prev?.id === chatId ? { ...prev, pinnedMessage: null } : prev);
    };

    const onMentionReceived = ({ chatId, messageId, fromUser, content }) => {
      if (Notification.permission === 'granted') {
        new Notification(`${fromUser} упомянул(а) вас`, { body: content, icon: '/favicon.ico' });
      }
    };

    const onTypingStart = ({ chatId, userId }) => {
      if (chatId === activeChatIdRef.current) {
        setTypingUsers(prev => prev.includes(userId) ? prev : [...prev, userId]);
      }
    };

    const onTypingStop = ({ chatId, userId }) => {
      if (chatId === activeChatIdRef.current) {
        setTypingUsers(prev => prev.filter(id => id !== userId));
      }
    };

    socket.on('message:new', onMessageNew);
    socket.on('message:updated', onMessageUpdated);
    socket.on('message:reaction', onMessageReaction);
    socket.on('message:read', onMessageRead);
    socket.on('user:online', onUserOnline);
    socket.on('user:updated', onUserUpdated);
    socket.on('user:avatar_update', onUserAvatarUpdate);
    socket.on('chat:updated', onChatUpdated);
    socket.on('chat:new', onChatNew);
    socket.on('chat:removed', onChatRemoved);
    socket.on('message:pin', onMessagePin);
    socket.on('message:unpin', onMessageUnpin);
    socket.on('mention:received', onMentionReceived);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);

    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('message:updated', onMessageUpdated);
      socket.off('message:reaction', onMessageReaction);
      socket.off('message:read', onMessageRead);
      socket.off('user:online', onUserOnline);
      socket.off('user:updated', onUserUpdated);
      socket.off('user:avatar_update', onUserAvatarUpdate);
      socket.off('chat:updated', onChatUpdated);
      socket.off('chat:new', onChatNew);
      socket.off('chat:removed', onChatRemoved);
      socket.off('message:pin', onMessagePin);
      socket.off('message:unpin', onMessageUnpin);
      socket.off('mention:received', onMentionReceived);
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
      disconnectSocket();
    };
  }, [user, loadChats, updateUserInState, refreshDisplay]);

  useEffect(() => {
    if (activeChat) {
      activeChatIdRef.current = activeChat.id;
      const cached = chatMessagesRef.current.get(activeChat.id);
      if (cached) {
        setDisplayMessages(cached);
      } else {
        setDisplayMessages([]);
        loadMessages(activeChat.id);
      }
      setTypingUsers([]);
      getSocket()?.emit('chat:join', activeChat.id);
      setChats(prev => prev.map(c => c.id === activeChat.id ? { ...c, unreadCount: 0 } : c));
    } else {
      activeChatIdRef.current = null;
      setDisplayMessages([]);
    }
  }, [activeChat?.id, loadMessages]);

  const handleAuth = async (mode, form) => {
    const data = mode === 'login'
      ? await api.login({ login: form.login, password: form.password })
      : await api.register({
          username: form.username,
          email: form.email,
          password: form.password,
          displayName: form.displayName || form.username,
        });
    localStorage.setItem('token', data.token);
    setUser(data.user);
    const online = await api.getOnline();
    setOnlineUsers(online);
  };

  const handleSelectChat = (chat) => {
    setActiveChat(chat);
    setMobileShowChat(true);
  };

  const handleNewChat = async (targetUser) => {
    const chat = await api.createDirect(targetUser.id);
    setChats(prev => {
      const exists = prev.find(c => c.id === chat.id);
      if (exists) return prev;
      return [{ ...chat, _myId: user.id }, ...prev];
    });
    setActiveChat({ ...chat, _myId: user.id });
    setMobileShowChat(true);
    setShowSearch(false);
  };

  const handleCreateGroup = async (name, memberIds) => {
    const chat = await api.createGroup(name, memberIds);
    setChats(prev => [{ ...chat, _myId: user.id }, ...prev]);
    setActiveChat({ ...chat, _myId: user.id });
    setMobileShowChat(true);
  };

  const handleSend = async (data) => {
    if (!activeChat) return;
    try {
      if (data instanceof FormData) {
        await api.sendMessage(activeChat.id, data);
      } else {
        await api.sendMessage(activeChat.id, (() => {
          const fd = new FormData();
          fd.append('content', data.content);
          if (data.replyToId) fd.append('replyToId', data.replyToId);
          return fd;
        })());
      }
    } catch (e) {
      alert(e.message);
    }
  };

  const handleMarkRead = useCallback(async (messageId) => {
    const chatId = activeChatIdRef.current;
    if (!chatId) return;
    try { await api.markRead(chatId, messageId); } catch {}
  }, []);

  const handleClearHistory = async (chatId) => {
    try {
      await api.clearHistory(chatId);
      chatMessagesRef.current.delete(chatId);
      if (activeChatIdRef.current === chatId) setDisplayMessages([]);
      await loadChats();
    } catch {}
  };

  const handleForward = (message) => {
    setForwardingMessage(message);
  };

  const handleForwardToChat = async (targetChat) => {
    if (!forwardingMessage) return;
    try {
      await api.forwardMessage(forwardingMessage.id, targetChat.id);
      setForwardingMessage(null);
    } catch (e) {
      alert(e.message);
    }
  };

  const handlePin = async (message) => {
    if (!activeChat) return;
    const isPinned = activeChat.pinnedMessage?.id === message.id;
    try {
      if (isPinned) {
        await api.unpinMessage(message.id);
      } else {
        await api.pinMessage(message.id);
      }
    } catch (e) {
      alert(e.message);
    }
  };

  const handleProfileSave = async (updated, opts = {}) => {
    setUser(updated);
    updateUserInState(updated);
    await loadChats();
    if (!opts.silent) setShowProfile(false);
  };

  const handleBlockChange = async () => {
    const data = await api.getChats();
    setChats(data.map(c => ({ ...c, _myId: user.id })));
    if (activeChat?.type === 'direct') {
      const still = data.find(c => c.id === activeChat.id);
      if (!still) {
        setActiveChat(null);
        activeChatIdRef.current = null;
        setDisplayMessages([]);
        setMobileShowChat(false);
      }
    }
  };

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    disconnectSocket();
    chatMessagesRef.current.clear();
    setUser(null);
    setChats([]);
    setActiveChat(null);
    activeChatIdRef.current = null;
    setDisplayMessages([]);
    setShowProfile(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(handleLogout);
    return () => setUnauthorizedHandler(null);
  }, [handleLogout]);

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /></div>;
  }

  if (!user) {
    return <Auth onAuth={handleAuth} />;
  }

  return (
    <div className="app">
      <div className={`sidebar ${mobileShowChat ? 'hidden-mobile' : ''}`}>
        <ChatList
          chats={chats}
          activeChat={activeChat}
          onlineUsers={onlineUsers}
          onSelect={handleSelectChat}
          onNewGroup={() => setShowSearch(true)}
          onProfile={() => setShowProfile(true)}
          onRequestNotifications={requestNotificationPermission}
          archivedIds={archivedIds.current}
          onArchive={(ids) => {
            ids.forEach(id => archivedIds.current.add(id));
            saveArchive();
            setChats(prev => prev.map(c => archivedIds.current.has(c.id) ? { ...c, archived: true } : c));
          }}
          onDeleteChats={(ids) => {
            setChats(prev => prev.filter(c => !ids.includes(c.id)));
            ids.forEach(id => chatMessagesRef.current.delete(id));
            if (ids.includes(activeChat?.id)) {
              setActiveChat(null);
              activeChatIdRef.current = null;
              setDisplayMessages([]);
            }
          }}
          onMarkAllRead={() => {
            setChats(prev => prev.map(c => ({ ...c, unreadCount: 0 })));
          }}
          onArchive={(ids) => {
            ids.forEach(id => archivedIds.current.add(id));
            saveArchive();
            setChats(prev => prev.map(c => archivedIds.current.has(c.id) ? { ...c, archived: true } : c));
          }}
          onOpenArchive={() => setShowArchive(true)}
        />
      </div>

      <div className={`main ${!mobileShowChat ? 'hidden-mobile' : ''}`}>
        <ChatWindow
          chat={activeChat}
          user={user}
          messages={displayMessages}
          onlineUsers={onlineUsers}
          typingUsers={typingUsers}
          onSend={handleSend}
          onEdit={(id, content) => api.editMessage(id, content).then(m => {
            const chatId = m.chatId;
            const existing = chatMessagesRef.current.get(chatId) || [];
            chatMessagesRef.current.set(chatId, existing.map(msg => msg.id === m.id ? m : msg));
            refreshDisplay(chatId);
          })}
          onDelete={(id) => api.deleteMessage(id).then(m => {
            const chatId = m.chatId;
            const existing = chatMessagesRef.current.get(chatId) || [];
            chatMessagesRef.current.set(chatId, existing.map(msg => msg.id === m.id ? m : msg));
            refreshDisplay(chatId);
          })}
          onReact={(id, emoji) => api.reactMessage(id, emoji)}
          onForward={handleForward}
          onPin={handlePin}
          wallpaper={getWallpaper(activeChat?.id)}
          onSetWallpaper={(url) => setWallpaper(activeChat?.id, url)}
          chatTheme={getChatTheme(activeChat?.id)}
          onSetTheme={(themeObj) => setChatTheme(activeChat?.id, themeObj)}
          onBack={() => setMobileShowChat(false)}
          onMarkRead={handleMarkRead}
          onOpenProfile={setViewProfileId}
          onOpenGroupSettings={() => setShowGroupSettings(true)}
          onClearHistory={handleClearHistory}
          onLoadMore={loadMoreMessages}
        />
      </div>

      {showSearch && (
        <UserSearch
          onSelect={handleNewChat}
          onClose={() => setShowSearch(false)}
          onlineUsers={onlineUsers}
        />
      )}
      {showGroup && (
        <CreateGroup
          onCreate={handleCreateGroup}
          onClose={() => setShowGroup(false)}
          onlineUsers={onlineUsers}
        />
      )}
      {showProfile && (
        <Profile
          user={user}
          onSave={handleProfileSave}
          onLogout={handleLogout}
          onClose={() => setShowProfile(false)}
          theme={theme}
          onSetTheme={setTheme}
          notifEnabled={notifEnabled}
          onEnableNotifications={enableNotifications}
          onDisableNotifications={disableNotifications}
        />
      )}
      {viewProfileId && (
        <UserProfile
          userId={viewProfileId}
          currentUser={user}
          onlineUsers={onlineUsers}
          chats={chats}
          onClose={() => setViewProfileId(null)}
          onOpenChat={handleSelectChat}
          onBlockChange={handleBlockChange}
        />
      )}
      {showGroupSettings && activeChat?.type === 'group' && (
        <GroupSettings
          chat={activeChat}
          user={user}
          onlineUsers={onlineUsers}
          onClose={() => setShowGroupSettings(false)}
          onUpdate={(updated) => {
            setActiveChat({ ...updated, _myId: user.id });
            setChats(prev => prev.map(c => c.id === updated.id ? { ...updated, _myId: user.id } : c));
          }}
          onLeave={(chatId) => {
            setChats(prev => prev.filter(c => c.id !== chatId));
            chatMessagesRef.current.delete(chatId);
            if (activeChat?.id === chatId) {
              setActiveChat(null);
              activeChatIdRef.current = null;
              setDisplayMessages([]);
            }
          }}
          onDelete={(chatId) => {
            setChats(prev => prev.filter(c => c.id !== chatId));
            chatMessagesRef.current.delete(chatId);
            if (activeChat?.id === chatId) {
              setActiveChat(null);
              activeChatIdRef.current = null;
              setDisplayMessages([]);
            }
          }}
        />
      )}
      {isMobile && activeTab === 'chats' && !mobileShowChat && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            if (tab === 'settings') setShowProfile(true);
          }}
          onSettings={() => setShowProfile(true)}
        />
      )}
      {showArchive && (
        <div className="modal-overlay" onClick={() => setShowArchive(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Архив</h3>
              <button onClick={() => setShowArchive(false)}>✕</button>
            </div>
            <div className="modal-list">
              <div className="modal-empty">
                {chats.filter(c => archivedIds.current.has(c.id)).length === 0
                  ? 'Нет заархивированных чатов'
                  : chats.filter(c => archivedIds.current.has(c.id)).map(chat => (
                    <div key={chat.id} className="modal-item" style={{ cursor: 'pointer' }} onClick={() => {
                      archivedIds.current.delete(chat.id);
                      saveArchive();
                      setChats(prev => prev.map(c => c.id === chat.id ? { ...c } : c));
                      setShowArchive(false);
                    }}>
                      <Avatar user={{ id: chat.id, displayName: chat.name, avatar: chat.avatar }} size={36} />
                      <div>
                        <div className="modal-item-name">{chat.name}</div>
                        <div className="modal-item-sub">Нажмите чтобы разархивировать</div>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
