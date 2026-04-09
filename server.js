const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);

// Simple SSE connections store
const clients = new Map(); // uid -> res

const DB_PATH = path.join(__dirname, 'db.json');

// Initialize db.json if not exists
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({ users: {}, messages: [] }, null, 2));
}

function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function generateUID() {
  const length = Math.random() < 0.5 ? 9 : 13;
  let uid = '';
  for (let i = 0; i < length; i++) {
    uid += Math.floor(Math.random() * 10).toString();
  }
  return uid;
}

app.use(express.json());
app.use(express.static(__dirname));

// Create account
app.post('/api/create-account', (req, res) => {
  const db = readDB();
  let uid;
  do {
    uid = generateUID();
  } while (db.users[uid]);

  db.users[uid] = {
    uid,
    createdAt: new Date().toISOString()
  };
  writeDB(db);
  res.json({ success: true, uid });
});

// Login
app.post('/api/login', (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: 'UID required' });
  const db = readDB();
  if (!db.users[uid]) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ success: true, uid });
});

// Find user
app.get('/api/user/:uid', (req, res) => {
  const db = readDB();
  const user = db.users[req.params.uid];
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true, user: { uid: user.uid } });
});

// Get messages between two users
app.get('/api/messages/:uid1/:uid2', (req, res) => {
  const { uid1, uid2 } = req.params;
  const db = readDB();
  const messages = db.messages.filter(m =>
    (m.from === uid1 && m.to === uid2) ||
    (m.from === uid2 && m.to === uid1)
  ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  res.json({ success: true, messages });
});

// Send message
app.post('/api/messages', (req, res) => {
  const { from, to, text } = req.body;
  if (!from || !to || !text) return res.status(400).json({ error: 'Missing fields' });

  const db = readDB();
  if (!db.users[from] || !db.users[to]) {
    return res.status(404).json({ error: 'User not found' });
  }

  const message = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    from,
    to,
    text: text.trim(),
    timestamp: new Date().toISOString(),
    read: false
  };

  db.messages.push(message);
  writeDB(db);

  // Notify recipient via SSE if connected
  if (clients.has(to)) {
    const clientRes = clients.get(to);
    clientRes.write(`data: ${JSON.stringify({ type: 'message', message })}\n\n`);
  }

  res.json({ success: true, message });
});

// SSE endpoint for real-time updates
app.get('/api/events/:uid', (req, res) => {
  const { uid } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  clients.set(uid, res);

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`);
  }, 30000);

  req.on('close', () => {
    clients.delete(uid);
    clearInterval(heartbeat);
  });
});

// Get conversations list for a user
app.get('/api/conversations/:uid', (req, res) => {
  const { uid } = req.params;
  const db = readDB();
  const involved = db.messages.filter(m => m.from === uid || m.to === uid);

  const convMap = new Map();
  for (const m of involved) {
    const other = m.from === uid ? m.to : m.from;
    if (!convMap.has(other) || new Date(m.timestamp) > new Date(convMap.get(other).timestamp)) {
      convMap.set(other, m);
    }
  }

  const conversations = Array.from(convMap.entries()).map(([otherUid, lastMsg]) => ({
    otherUid,
    lastMessage: lastMsg.text,
    lastTimestamp: lastMsg.timestamp,
    unread: db.messages.filter(m => m.from === otherUid && m.to === uid && !m.read).length
  })).sort((a, b) => new Date(b.lastTimestamp) - new Date(a.lastTimestamp));

  res.json({ success: true, conversations });
});

// Mark messages as read
app.post('/api/messages/read', (req, res) => {
  const { from, to } = req.body;
  const db = readDB();
  db.messages = db.messages.map(m => {
    if (m.from === from && m.to === to && !m.read) {
      return { ...m, read: true };
    }
    return m;
  });
  writeDB(db);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 SMS Chat server running at:`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://<your-ip>:${PORT}\n`);
});
