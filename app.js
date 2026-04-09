// ═══════════════════════════════════════════
//            TxtBridge - app.js
// ═══════════════════════════════════════════

const API = '';  // Same-origin

// ─── STATE ─────────────────────────────────
let state = {
  uid: null,
  currentChat: null,
  conversations: [],
  messages: {},
  theme: 'dark',
  sseSource: null,
  pollInterval: null,
};

// ─── STORAGE ───────────────────────────────
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch(_){} }
function load(key, def = null) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch(_){ return def; } }

// ─── TOAST ─────────────────────────────────
let toastTimer;
function showToast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ─── THEME ─────────────────────────────────
function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  save('theme', theme);
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  });
}

function toggleTheme() {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
}

// ─── SCREENS ───────────────────────────────
const screens = ['welcome-screen', 'create-screen', 'login-screen', 'main-screen', 'chat-screen'];

function showScreen(id, direction = 'right') {
  screens.forEach(sid => {
    const el = document.getElementById(sid);
    if (sid === id) {
      el.classList.remove('hidden', 'slide-left');
    } else {
      el.classList.add('hidden');
      el.classList.remove('slide-left');
    }
  });
}

function goBack(targetScreen) {
  const current = screens.find(s => !document.getElementById(s).classList.contains('hidden') && !document.getElementById(s).classList.contains('slide-left'));
  if (current) {
    document.getElementById(current).classList.add('hidden');
  }
  showScreen(targetScreen);
}

// ─── AVATAR ────────────────────────────────
function avatarLetter(uid) {
  if (!uid) return '?';
  return uid[0] || '?';
}

// ─── TIME FORMAT ───────────────────────────
function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
         d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateDivider(iso) {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

// ─── API CALLS ─────────────────────────────
async function apiPost(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiGet(path) {
  const res = await fetch(API + path);
  return res.json();
}

// ─── AUTH ──────────────────────────────────
async function createAccount() {
  document.getElementById('uid-generating').style.display = 'block';
  document.getElementById('uid-result').style.display = 'none';
  document.getElementById('btn-enter-app').disabled = true;
  document.getElementById('create-error').classList.remove('show');

  showScreen('create-screen');

  try {
    const data = await apiPost('/api/create-account', {});
    if (data.success) {
      document.getElementById('uid-generating').style.display = 'none';
      document.getElementById('uid-result').style.display = 'block';
      document.getElementById('new-uid-value').textContent = formatUID(data.uid);
      document.getElementById('btn-enter-app').disabled = false;
      document.getElementById('btn-enter-app').dataset.uid = data.uid;
    } else {
      throw new Error(data.error || 'Failed to create account');
    }
  } catch (e) {
    document.getElementById('uid-generating').style.display = 'none';
    const errEl = document.getElementById('create-error');
    errEl.textContent = '⚠️ ' + (e.message || 'Connection error. Is the server running?');
    errEl.classList.add('show');
  }
}

function formatUID(uid) {
  if (!uid) return '';
  // 9 digit: 3-3-3, 13 digit: show as is with spaces every 4
  if (uid.length === 9) return uid.slice(0,3) + ' ' + uid.slice(3,6) + ' ' + uid.slice(6);
  if (uid.length === 13) return uid.slice(0,4) + ' ' + uid.slice(4,8) + ' ' + uid.slice(8,11) + ' ' + uid.slice(11);
  return uid;
}

function stripUID(formatted) {
  return formatted.replace(/\s/g, '');
}

async function doLogin() {
  const input = document.getElementById('login-uid-input');
  const uid = stripUID(input.value.trim());
  const errEl = document.getElementById('login-error');

  if (!uid || (uid.length !== 9 && uid.length !== 13)) {
    errEl.textContent = '⚠️ Please enter a valid 9 or 13-digit UID';
    errEl.classList.add('show');
    return;
  }

  errEl.classList.remove('show');
  document.getElementById('btn-do-login').textContent = 'Logging in…';
  document.getElementById('btn-do-login').disabled = true;

  try {
    const data = await apiPost('/api/login', { uid });
    if (data.success) {
      loginSuccess(uid);
    } else {
      errEl.textContent = '⚠️ ' + (data.error || 'User not found. Check your UID.');
      errEl.classList.add('show');
    }
  } catch (e) {
    errEl.textContent = '⚠️ Connection error. Is the server running?';
    errEl.classList.add('show');
  } finally {
    document.getElementById('btn-do-login').textContent = 'Log In';
    document.getElementById('btn-do-login').disabled = false;
  }
}

function loginSuccess(uid) {
  state.uid = uid;
  save('uid', uid);
  showMainScreen();
}

function logout() {
  if (state.sseSource) state.sseSource.close();
  clearInterval(state.pollInterval);
  state.uid = null;
  state.currentChat = null;
  state.conversations = [];
  state.messages = {};
  save('uid', null);
  document.getElementById('login-uid-input').value = '';
  showScreen('welcome-screen');
}

// ─── MAIN SCREEN ───────────────────────────
function showMainScreen() {
  state.uid = state.uid;
  // Update UI
  document.getElementById('my-uid-display').textContent = formatUID(state.uid);
  document.getElementById('main-avatar').textContent = avatarLetter(state.uid);
  showScreen('main-screen');
  loadConversations();
  setupSSE();
  // Poll every 10s as fallback
  clearInterval(state.pollInterval);
  state.pollInterval = setInterval(loadConversations, 10000);
}

async function loadConversations() {
  if (!state.uid) return;
  try {
    const data = await apiGet(`/api/conversations/${state.uid}`);
    if (data.success) {
      state.conversations = data.conversations;
      renderConversations();
    }
  } catch(_) {}
}

function renderConversations() {
  const list = document.getElementById('conv-list');
  const empty = document.getElementById('empty-state');

  // Remove existing conv items
  list.querySelectorAll('.conv-item').forEach(el => el.remove());

  if (!state.conversations || state.conversations.length === 0) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  state.conversations.forEach(conv => {
    const item = document.createElement('div');
    item.className = 'conv-item';
    item.innerHTML = `
      <div class="avatar avatar-sm">${avatarLetter(conv.otherUid)}</div>
      <div class="conv-info">
        <div class="conv-top">
          <span class="conv-uid">${formatUID(conv.otherUid)}</span>
          <span class="conv-time">${formatTime(conv.lastTimestamp)}</span>
        </div>
        <div class="conv-preview">
          <span>${escapeHtml(conv.lastMessage || '')}</span>
          ${conv.unread > 0 ? `<span class="unread-badge" style="margin-left:auto">${conv.unread}</span>` : ''}
        </div>
      </div>
    `;
    item.addEventListener('click', () => openChat(conv.otherUid));
    list.appendChild(item);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── SEARCH ────────────────────────────────
let searchDebounce;
function setupSearch() {
  const input = document.getElementById('search-uid-input');
  const clearBtn = document.getElementById('search-clear');
  const results = document.getElementById('search-results');
  const found = document.getElementById('search-found');
  const notFound = document.getElementById('search-not-found');

  input.addEventListener('input', () => {
    const val = stripUID(input.value.trim());
    clearBtn.classList.toggle('visible', val.length > 0);

    if (val.length === 0) {
      results.classList.remove('show');
      return;
    }

    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      if (val.length !== 9 && val.length !== 13) return;

      if (val === state.uid) {
        found.style.display = 'none';
        notFound.style.display = 'block';
        notFound.textContent = '🙅 That\'s your own UID!';
        results.classList.add('show');
        return;
      }

      try {
        const data = await apiGet(`/api/user/${val}`);
        if (data.success) {
          document.getElementById('search-found-uid').textContent = formatUID(val);
          document.getElementById('search-found-avatar').textContent = avatarLetter(val);
          found.style.display = 'flex';
          notFound.style.display = 'none';
        } else {
          found.style.display = 'none';
          notFound.style.display = 'block';
          notFound.textContent = '😕 User not found';
        }
        results.classList.add('show');
      } catch(_) {}
    }, 400);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.remove('visible');
    results.classList.remove('show');
  });

  document.getElementById('search-found').addEventListener('click', () => {
    const uid = stripUID(document.getElementById('search-found-uid').textContent);
    input.value = '';
    clearBtn.classList.remove('visible');
    results.classList.remove('show');
    openChat(uid);
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-container')) {
      results.classList.remove('show');
    }
  });
}

// ─── CHAT ──────────────────────────────────
async function openChat(recipientUid) {
  state.currentChat = recipientUid;

  document.getElementById('chat-recipient-uid').textContent = formatUID(recipientUid);
  document.getElementById('chat-avatar').textContent = avatarLetter(recipientUid);

  // SMS link using sms: protocol
  const smsLink = document.getElementById('sms-link');
  smsLink.href = `sms:${recipientUid}`;

  // Clear messages
  document.getElementById('messages-area').innerHTML = '';

  showScreen('chat-screen');

  // Load messages
  await loadMessages();

  // Mark as read
  try {
    await apiPost('/api/messages/read', { from: recipientUid, to: state.uid });
    loadConversations();
  } catch(_) {}

  // Focus input
  setTimeout(() => document.getElementById('chat-input').focus(), 300);
}

async function loadMessages() {
  if (!state.uid || !state.currentChat) return;
  try {
    const data = await apiGet(`/api/messages/${state.uid}/${state.currentChat}`);
    if (data.success) {
      state.messages[state.currentChat] = data.messages;
      renderMessages(data.messages);
    }
  } catch(_) {}
}

function renderMessages(messages) {
  const area = document.getElementById('messages-area');
  area.innerHTML = '';

  if (!messages || messages.length === 0) {
    area.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:var(--text-muted)">
        <div style="font-size:32px;margin-bottom:12px">👋</div>
        <div style="font-size:14px">Say hello! Start the conversation.</div>
      </div>`;
    return;
  }

  let lastDate = null;

  messages.forEach(msg => {
    const msgDate = new Date(msg.timestamp).toDateString();
    if (msgDate !== lastDate) {
      const divider = document.createElement('div');
      divider.className = 'date-divider';
      divider.textContent = formatDateDivider(msg.timestamp);
      area.appendChild(divider);
      lastDate = msgDate;
    }

    const row = document.createElement('div');
    const isSent = msg.from === state.uid;
    row.className = `msg-row ${isSent ? 'sent' : 'received'}`;

    row.innerHTML = `
      <div class="msg-bubble">
        <div class="msg-text">${escapeHtml(msg.text)}</div>
      </div>
      <div class="msg-meta">
        <span class="msg-sender">${formatUID(msg.from)}</span>
        <span class="msg-time">${formatTime(msg.timestamp)}</span>
        ${isSent ? '<span class="msg-tick">✓✓</span>' : ''}
      </div>
    `;

    area.appendChild(row);
  });

  // Scroll to bottom
  scrollToBottom();
}

function scrollToBottom(smooth = false) {
  const area = document.getElementById('messages-area');
  area.scrollTo({ top: area.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
}

function appendMessage(msg) {
  const area = document.getElementById('messages-area');

  // Remove empty state if present
  const empty = area.querySelector('div[style*="text-align:center"]');
  if (empty) empty.remove();

  const isSent = msg.from === state.uid;
  const row = document.createElement('div');
  row.className = `msg-row ${isSent ? 'sent' : 'received'}`;
  row.innerHTML = `
    <div class="msg-bubble">
      <div class="msg-text">${escapeHtml(msg.text)}</div>
    </div>
    <div class="msg-meta">
      <span class="msg-sender">${formatUID(msg.from)}</span>
      <span class="msg-time">${formatTime(msg.timestamp)}</span>
      ${isSent ? '<span class="msg-tick">✓✓</span>' : ''}
    </div>
  `;
  area.appendChild(row);
  scrollToBottom(true);
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !state.uid || !state.currentChat) return;

  const btn = document.getElementById('btn-send');
  btn.disabled = true;
  input.value = '';
  autoResizeTextarea(input);

  try {
    const data = await apiPost('/api/messages', {
      from: state.uid,
      to: state.currentChat,
      text,
    });

    if (data.success) {
      appendMessage(data.message);
      loadConversations();
    } else {
      showToast('⚠️ Failed to send: ' + (data.error || 'Unknown error'));
      input.value = text;
    }
  } catch(e) {
    showToast('⚠️ Connection error. Message not sent.');
    input.value = text;
  } finally {
    btn.disabled = !input.value.trim();
    input.focus();
  }
}

// ─── SSE (real-time) ───────────────────────
function setupSSE() {
  if (state.sseSource) {
    state.sseSource.close();
  }

  const source = new EventSource(`/api/events/${state.uid}`);
  state.sseSource = source;

  source.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'message') {
        const msg = data.message;

        // If we're in that chat, append it
        if (state.currentChat && (msg.from === state.currentChat || msg.to === state.currentChat)) {
          appendMessage(msg);
          // Mark as read
          apiPost('/api/messages/read', { from: msg.from, to: state.uid }).catch(()=>{});
        } else {
          // Notification toast
          showToast(`💬 New message from ${formatUID(msg.from)}`);
        }

        loadConversations();
      }
    } catch(_) {}
  };

  source.onerror = () => {
    // SSE failed, rely on polling
  };
}

// ─── TEXTAREA AUTO-RESIZE ──────────────────
function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ─── INIT ──────────────────────────────────
function init() {
  // Apply saved theme
  const savedTheme = load('theme', 'dark');
  applyTheme(savedTheme);

  // Check saved session
  const savedUid = load('uid');
  if (savedUid) {
    state.uid = savedUid;
    showMainScreen();
  } else {
    showScreen('welcome-screen');
  }

  // ── Welcome screen buttons
  document.getElementById('btn-create').addEventListener('click', createAccount);
  document.getElementById('btn-login').addEventListener('click', () => showScreen('login-screen'));

  // ── Create screen
  document.getElementById('back-from-create').addEventListener('click', () => showScreen('welcome-screen'));
  document.getElementById('copy-uid-btn').addEventListener('click', () => {
    const uid = stripUID(document.getElementById('new-uid-value').textContent);
    navigator.clipboard.writeText(uid).then(() => {
      document.getElementById('copy-uid-btn').textContent = '✓ Copied!';
      setTimeout(() => document.getElementById('copy-uid-btn').textContent = 'Copy', 2000);
    }).catch(() => showToast('Could not copy automatically'));
  });
  document.getElementById('btn-enter-app').addEventListener('click', () => {
    const uid = document.getElementById('btn-enter-app').dataset.uid;
    if (uid) loginSuccess(uid);
  });

  // ── Login screen
  document.getElementById('back-from-login').addEventListener('click', () => showScreen('welcome-screen'));
  document.getElementById('btn-do-login').addEventListener('click', doLogin);
  document.getElementById('login-uid-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  // ── Main screen
  document.getElementById('btn-logout').addEventListener('click', () => {
    if (confirm('Log out of TxtBridge?')) logout();
  });
  document.getElementById('my-uid-badge').addEventListener('click', () => {
    navigator.clipboard.writeText(state.uid)
      .then(() => showToast('✓ UID copied to clipboard!'))
      .catch(() => showToast(`Your UID: ${state.uid}`));
  });
  setupSearch();

  // ── Chat screen
  document.getElementById('back-from-chat').addEventListener('click', () => {
    state.currentChat = null;
    showScreen('main-screen');
    loadConversations();
  });

  const chatInput = document.getElementById('chat-input');
  chatInput.addEventListener('input', () => {
    autoResizeTextarea(chatInput);
    document.getElementById('btn-send').disabled = !chatInput.value.trim();
  });
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  document.getElementById('btn-send').addEventListener('click', sendMessage);

  // ── Theme toggles (all)
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', toggleTheme);
  });

  // ── Poll messages in chat every 5s as fallback
  setInterval(() => {
    if (state.currentChat) {
      apiGet(`/api/messages/${state.uid}/${state.currentChat}`)
        .then(data => {
          if (data.success) {
            const existing = state.messages[state.currentChat] || [];
            const newMsgs = data.messages.filter(m => !existing.find(e => e.id === m.id));
            if (newMsgs.length > 0) {
              state.messages[state.currentChat] = data.messages;
              newMsgs.forEach(m => appendMessage(m));
              if (newMsgs.some(m => m.from !== state.uid)) {
                apiPost('/api/messages/read', { from: state.currentChat, to: state.uid }).catch(()=>{});
              }
            }
          }
        }).catch(()=>{});
    }
  }, 5000);
}

document.addEventListener('DOMContentLoaded', init);
