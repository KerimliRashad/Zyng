'use strict';
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');
const SQLiteStore = require('connect-sqlite3')(session);
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const VERSION = '3.0';
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ─── Database ────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL DEFAULT '',
    original_name TEXT NOT NULL DEFAULT '',
    size INTEGER NOT NULL DEFAULT 0,
    folder TEXT DEFAULT '',
    uploaded_by TEXT NOT NULL DEFAULT '',
    uploaded_at INTEGER DEFAULT (strftime('%s','now')),
    downloads INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS logins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    ip TEXT NOT NULL,
    success INTEGER NOT NULL,
    ts INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    code TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
`);

// ─── DB Migration (handle old schema) ────────────────────────────────────────
function colExists(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(r => r.name === col);
}
try {
  // files table migrations
  if (!colExists('files', 'filename')) {
    db.exec("ALTER TABLE files ADD COLUMN filename TEXT NOT NULL DEFAULT ''");
    if (colExists('files', 'stored_name')) db.exec("UPDATE files SET filename = stored_name WHERE filename = ''");
  }
  if (!colExists('files', 'uploaded_at')) {
    db.exec("ALTER TABLE files ADD COLUMN uploaded_at INTEGER DEFAULT 0");
    if (colExists('files', 'created_at')) db.exec("UPDATE files SET uploaded_at = strftime('%s', created_at) WHERE uploaded_at = 0");
  }
  if (!colExists('files', 'downloads')) db.exec("ALTER TABLE files ADD COLUMN downloads INTEGER DEFAULT 0");
  if (!colExists('files', 'folder')) db.exec("ALTER TABLE files ADD COLUMN folder TEXT DEFAULT ''");
  // otp_codes migration
  if (!colExists('otp_codes', 'expires')) {
    db.exec("DROP TABLE IF EXISTS otp_codes");
    db.exec("CREATE TABLE otp_codes (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, code TEXT NOT NULL, expires INTEGER NOT NULL)");
  }
} catch(e) { console.error('Migration error:', e.message); }

// Seed admin
const adminRow = db.prepare('SELECT id FROM users WHERE username=?').get(ADMIN_USER);
if (!adminRow) {
  const hash = bcrypt.hashSync(ADMIN_PASS, 10);
  db.prepare('INSERT INTO users (username,password,role) VALUES (?,?,?)').run(ADMIN_USER, hash, 'admin');
}

// ─── Telegram ────────────────────────────────────────────────────────────────
async function tgSend(text) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'HTML' })
    });
  } catch (e) { /* ignore */ }
}

// ─── App Setup ───────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 86400000 }
}));

// Rate limits
app.use(rateLimit({ windowMs: 60000, max: 150, standardHeaders: true, legacyHeaders: false }));
const loginLimit = rateLimit({ windowMs: 600000, max: 10, message: 'Слишком много попыток входа' });

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + crypto.randomBytes(4).toString('hex') + path.extname(file.originalname))
});
const upload = multer({ storage, limits: {} });

// ─── Helpers ─────────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.redirect('/login');
}
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  res.status(403).send('Нет доступа');
}
function getIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}
function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}
function formatDate(ts) {
  return new Date(ts * 1000).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
}
function uptime() {
  const s = Math.floor(process.uptime());
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return `${d}д ${h}ч ${m}м`;
}

// ─── HTML Template ───────────────────────────────────────────────────────────
function page(title, body, user = null) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — FileServer v${VERSION}</title>
<style>
:root{
  --bg:#0d1117;--bg2:#161b22;--bg3:#21262d;--border:#30363d;
  --text:#e6edf3;--text2:#8b949e;--accent:#238636;--accent2:#1f6feb;
  --danger:#da3633;--warn:#d29922;--radius:8px;--font:'Segoe UI',system-ui,sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:var(--font);min-height:100vh}
a{color:var(--accent2);text-decoration:none}
a:hover{text-decoration:underline}
.nav{background:var(--bg2);border-bottom:1px solid var(--border);padding:12px 24px;display:flex;align-items:center;gap:16px}
.nav .logo{font-size:18px;font-weight:700;color:var(--text);flex:1}
.nav .logo span{color:var(--accent2)}
.nav a{color:var(--text2);font-size:14px;padding:6px 12px;border-radius:var(--radius);transition:.2s}
.nav a:hover{background:var(--bg3);color:var(--text);text-decoration:none}
.nav .user-info{color:var(--text2);font-size:13px;margin-left:auto}
.container{max-width:1100px;margin:32px auto;padding:0 16px}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:20px}
.card h2{font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text)}
.btn{display:inline-block;padding:8px 16px;border-radius:var(--radius);border:none;cursor:pointer;font-size:14px;font-weight:500;transition:.2s;text-decoration:none}
.btn-primary{background:var(--accent2);color:#fff}
.btn-primary:hover{background:#388bfd;text-decoration:none;color:#fff}
.btn-success{background:var(--accent);color:#fff}
.btn-success:hover{background:#2ea043;text-decoration:none;color:#fff}
.btn-danger{background:var(--danger);color:#fff}
.btn-danger:hover{background:#f85149;text-decoration:none;color:#fff}
.btn-sm{padding:4px 10px;font-size:12px}
input,select{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:8px 12px;border-radius:var(--radius);font-size:14px;width:100%;margin-bottom:12px}
input:focus,select:focus{outline:none;border-color:var(--accent2)}
label{font-size:13px;color:var(--text2);margin-bottom:4px;display:block}
.table{width:100%;border-collapse:collapse;font-size:14px}
.table th{color:var(--text2);font-weight:500;text-align:left;padding:8px 12px;border-bottom:1px solid var(--border)}
.table td{padding:8px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
.table tr:hover td{background:var(--bg3)}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
.badge-admin{background:#1f3a6e;color:#79c0ff}
.badge-user{background:#1c2d1e;color:#56d364}
.badge-fail{background:#3d1a1a;color:#f85149}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:20px}
.stat{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:20px;text-align:center}
.stat .val{font-size:28px;font-weight:700;color:var(--accent2)}
.stat .lbl{font-size:12px;color:var(--text2);margin-top:4px}
.alert{padding:12px 16px;border-radius:var(--radius);margin-bottom:16px;font-size:14px}
.alert-danger{background:#3d1a1a;border:1px solid #da3633;color:#f85149}
.alert-success{background:#1c2d1e;border:1px solid #238636;color:#56d364}
#drop-zone{border:2px dashed var(--border);border-radius:var(--radius);padding:40px;text-align:center;cursor:pointer;transition:.2s;position:relative}
#drop-zone.drag-over{border-color:var(--accent2);background:rgba(31,111,235,.08)}
#drop-zone p{color:var(--text2);margin:8px 0}
#progress-wrap{display:none;margin-top:16px}
#progress-bar{height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;margin-bottom:8px}
#progress-fill{height:100%;background:var(--accent2);width:0%;transition:width .3s}
#progress-text{font-size:13px;color:var(--text2);text-align:center}
.status-bar{background:var(--bg2);border-bottom:1px solid var(--border);padding:6px 24px;font-size:12px;color:var(--text2);display:flex;gap:24px}
.status-bar span{display:flex;align-items:center;gap:4px}
.dot{width:7px;height:7px;border-radius:50%;background:#56d364;display:inline-block}
.dot.warn{background:#d29922}
.folder-tree{padding:0;list-style:none}
.folder-tree li{padding:4px 0}
.folder-tree .folder-name{color:var(--warn);font-weight:500}
.search-bar{display:flex;gap:8px;margin-bottom:20px}
.search-bar input{flex:1;margin:0}
@media(max-width:600px){.stats-grid{grid-template-columns:1fr 1fr}.nav{flex-wrap:wrap}}
</style>
</head>
<body>
${user ? `
<div class="status-bar" id="status-bar">
  <span><span class="dot" id="status-dot"></span> Сервер работает</span>
  <span id="status-cpu">CPU: —</span>
  <span id="status-ram">RAM: —</span>
  <span id="status-uptime">Аптайм: —</span>
  <span id="status-ver">v${VERSION}</span>
</div>
` : ''}
<nav class="nav">
  <div class="logo">File<span>Server</span> <small style="font-size:11px;color:var(--text2)">v${VERSION}</small></div>
  ${user ? `
  <a href="/">Файлы</a>
  ${user.role === 'admin' ? '<a href="/admin">Админ</a>' : ''}
  <span class="user-info">${user.username} <span class="badge badge-${user.role}">${user.role}</span></span>
  <a href="/logout">Выход</a>
  ` : ''}
</nav>
<div class="container">
${body}
</div>
${user ? `
<script>
async function loadStatus() {
  try {
    const r = await fetch('/api/status');
    const d = await r.json();
    document.getElementById('status-cpu').textContent = 'CPU: ' + d.cpu + '%';
    document.getElementById('status-ram').textContent = 'RAM: ' + d.ram + '%';
    document.getElementById('status-uptime').textContent = 'Аптайм: ' + d.uptime;
  } catch(e) {
    document.getElementById('status-dot').className = 'dot warn';
  }
}
loadStatus();
setInterval(loadStatus, 15000);
</script>
` : ''}
</body>
</html>`;
}

// ─── Login ────────────────────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  const err = req.query.err || '';
  const msgs = { bad: 'Неверный логин или пароль', otp: 'Неверный OTP-код', locked: 'Аккаунт заблокирован' };
  const alert = err ? `<div class="alert alert-danger">${msgs[err] || err}</div>` : '';
  res.send(page('Вход', `
<div style="max-width:380px;margin:80px auto">
  <div class="card">
    <h2>Вход в систему</h2>
    ${alert}
    <form method="POST" action="/login">
      <label>Логин</label>
      <input name="username" placeholder="admin" required autocomplete="username">
      <label>Пароль</label>
      <input name="password" type="password" required autocomplete="current-password">
      <button class="btn btn-primary" style="width:100%" type="submit">Войти</button>
    </form>
  </div>
</div>`));
});

app.post('/login', loginLimit, async (req, res) => {
  const { username, password } = req.body;
  const ip = getIP(req);
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!user || !await bcrypt.compare(password, user.password)) {
    db.prepare('INSERT INTO logins (username,ip,success) VALUES (?,?,0)').run(username || '?', ip);
    const fails = db.prepare('SELECT COUNT(*) as n FROM logins WHERE ip=? AND success=0 AND ts > strftime(\'%s\',\'now\')-600').get(ip).n;
    if (fails >= 5) {
      await tgSend(`🚨 <b>Брутфорс!</b>\nIP: <code>${ip}</code>\nЛогин: <code>${username}</code>\nПопыток: ${fails}`);
    }
    return res.redirect('/login?err=bad');
  }
  // 2FA for admin
  if (user.role === 'admin') {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const exp = Math.floor(Date.now() / 1000) + 300;
    db.prepare('DELETE FROM otp_codes WHERE username=?').run(username);
    db.prepare('INSERT INTO otp_codes (username,code,expires) VALUES (?,?,?)').run(username, code, exp);
    await tgSend(`🔐 <b>2FA код</b>\nКод: <code>${code}</code>\nДействует 5 минут\nIP: <code>${ip}</code>`);
    req.session.pending2fa = username;
    return res.redirect('/verify-otp');
  }
  db.prepare('INSERT INTO logins (username,ip,success) VALUES (?,?,1)').run(username, ip);
  req.session.user = { id: user.id, username: user.username, role: user.role };
  await tgSend(`✅ Вход: <b>${username}</b>\nIP: <code>${ip}</code>`);
  res.redirect('/');
});

app.get('/verify-otp', (req, res) => {
  if (!req.session.pending2fa) return res.redirect('/login');
  const err = req.query.err ? '<div class="alert alert-danger">Неверный код. Попробуйте снова.</div>' : '';
  res.send(page('2FA Проверка', `
<div style="max-width:380px;margin:80px auto">
  <div class="card">
    <h2>Двухфакторная аутентификация</h2>
    ${err}
    <p style="color:var(--text2);font-size:14px;margin-bottom:16px">Код отправлен в Telegram. Введите 6-значный код.</p>
    <form method="POST" action="/verify-otp">
      <label>OTP-код</label>
      <input name="code" placeholder="123456" maxlength="6" autocomplete="one-time-code" autofocus>
      <button class="btn btn-primary" style="width:100%" type="submit">Подтвердить</button>
    </form>
  </div>
</div>`));
});

app.post('/verify-otp', (req, res) => {
  const username = req.session.pending2fa;
  if (!username) return res.redirect('/login');
  const { code } = req.body;
  const now = Math.floor(Date.now() / 1000);
  const row = db.prepare('SELECT * FROM otp_codes WHERE username=? AND expires>?').get(username, now);
  if (!row || row.code !== code) return res.redirect('/verify-otp?err=1');
  db.prepare('DELETE FROM otp_codes WHERE username=?').run(username);
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  db.prepare('INSERT INTO logins (username,ip,success) VALUES (?,?,1)').run(username, getIP(req));
  req.session.pending2fa = null;
  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ─── Main File List ───────────────────────────────────────────────────────────
app.get('/', requireAuth, (req, res) => {
  const user = req.session.user;
  const search = req.query.q || '';
  let query = 'SELECT * FROM files';
  let params = [];
  if (search) {
    query += ' WHERE original_name LIKE ?';
    params.push('%' + search + '%');
  }
  query += ' ORDER BY uploaded_at DESC';
  const files = db.prepare(query).all(...params);
  const totalSize = db.prepare('SELECT SUM(size) as s FROM files').get().s || 0;
  const totalFiles = db.prepare('SELECT COUNT(*) as n FROM files').get().n;
  const filesHTML = files.map(f => `
<tr>
  <td>
    <a href="/download/${f.id}" title="${f.original_name}">${f.original_name.length > 45 ? f.original_name.slice(0, 42) + '...' : f.original_name}</a>
    ${f.folder ? `<span style="color:var(--text2);font-size:11px"> 📁 ${f.folder}</span>` : ''}
  </td>
  <td>${formatBytes(f.size)}</td>
  <td style="color:var(--text2)">${f.uploaded_by}</td>
  <td style="color:var(--text2)">${formatDate(f.uploaded_at)}</td>
  <td>${f.downloads}</td>
  <td>
    <a class="btn btn-primary btn-sm" href="/download/${f.id}">↓</a>
    ${user.role === 'admin' ? `<a class="btn btn-danger btn-sm" href="/delete/${f.id}" onclick="return confirm('Удалить?')">✕</a>` : ''}
  </td>
</tr>`).join('');

  res.send(page('Файлы', `
<div class="stats-grid">
  <div class="stat"><div class="val">${totalFiles}</div><div class="lbl">Файлов</div></div>
  <div class="stat"><div class="val">${formatBytes(totalSize)}</div><div class="lbl">Занято</div></div>
  <div class="stat"><div class="val">${uptime()}</div><div class="lbl">Аптайм</div></div>
</div>

<div class="card">
  <h2>Загрузить файлы</h2>
  <div id="drop-zone" onclick="document.getElementById('file-input').click()">
    <p style="font-size:24px">📁</p>
    <p>Перетащите файлы или папки сюда</p>
    <p style="font-size:12px">или нажмите для выбора</p>
    <input id="file-input" type="file" multiple style="display:none">
  </div>
  <div id="progress-wrap">
    <div id="progress-bar"><div id="progress-fill"></div></div>
    <div id="progress-text">Загрузка...</div>
  </div>
</div>

<div class="card">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
    <h2 style="margin:0">Файлы</h2>
  </div>
  <form class="search-bar" method="GET" action="/">
    <input name="q" placeholder="Поиск по имени..." value="${search}">
    <button class="btn btn-primary" type="submit">Найти</button>
    ${search ? '<a class="btn" href="/" style="background:var(--bg3)">✕</a>' : ''}
  </form>
  <div style="overflow-x:auto">
  <table class="table">
    <thead><tr><th>Имя файла</th><th>Размер</th><th>Кто загрузил</th><th>Дата</th><th>Скачиваний</th><th>Действия</th></tr></thead>
    <tbody>${filesHTML || '<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:32px">Файлов нет</td></tr>'}</tbody>
  </table>
  </div>
</div>

<script>
const dz = document.getElementById('drop-zone');
const fi = document.getElementById('file-input');
const pw = document.getElementById('progress-wrap');
const pf = document.getElementById('progress-fill');
const pt = document.getElementById('progress-text');

dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
dz.addEventListener('drop', e => {
  e.preventDefault();
  dz.classList.remove('drag-over');
  handleItems(e.dataTransfer.items);
});
fi.addEventListener('change', () => uploadFiles(Array.from(fi.files), []));

async function handleItems(items) {
  const files = [], paths = [];
  async function readEntry(entry, prefix) {
    if (entry.isFile) {
      await new Promise(res => entry.file(f => { files.push(f); paths.push(prefix); res(); }));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      await new Promise(res => reader.readEntries(async entries => {
        for (const e of entries) await readEntry(e, prefix ? prefix + '/' + entry.name : entry.name);
        res();
      }));
    }
  }
  for (const item of items) {
    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
    if (entry) await readEntry(entry, '');
    else if (item.getAsFile) { files.push(item.getAsFile()); paths.push(''); }
  }
  uploadFiles(files, paths);
}

async function uploadFiles(files, paths) {
  if (!files.length) return;
  pw.style.display = 'block';
  const fd = new FormData();
  files.forEach((f, i) => { fd.append('files', f); fd.append('folders', paths[i] || ''); });
  const xhr = new XMLHttpRequest();
  xhr.upload.addEventListener('progress', e => {
    if (e.lengthComputable) {
      const pct = Math.round(e.loaded / e.total * 100);
      pf.style.width = pct + '%';
      pt.textContent = 'Загружено ' + pct + '% (' + (e.loaded/1048576).toFixed(1) + ' MB / ' + (e.total/1048576).toFixed(1) + ' MB)';
    }
  });
  xhr.addEventListener('load', () => {
    uploading = false;
    if (xhr.status === 200) { pt.textContent = '✓ Загружено успешно!'; pf.style.background = 'var(--accent)'; setTimeout(() => location.reload(), 1200); }
    else { pt.textContent = 'Ошибка: ' + xhr.status; pf.style.background = 'var(--danger)'; }
  });
  xhr.addEventListener('error', () => { pt.textContent = 'Ошибка соединения'; pf.style.background = 'var(--danger)'; uploading = false; });
  xhr.open('POST', '/upload');
  uploading = true;
  xhr.send(fd);
}

let uploading = false;
window.addEventListener('beforeunload', e => {
  if (uploading) { e.preventDefault(); e.returnValue = 'Загрузка ещё идёт! Вы уверены?'; return e.returnValue; }
});
</script>`, user));
});

// ─── Upload ───────────────────────────────────────────────────────────────────
app.post('/upload', requireAuth, upload.array('files'), async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'Нет файлов' });
  const folders = req.body.folders ? (Array.isArray(req.body.folders) ? req.body.folders : [req.body.folders]) : [];
  const stmt = db.prepare('INSERT INTO files (filename,original_name,size,folder,uploaded_by) VALUES (?,?,?,?,?)');
  const ins = db.transaction((files) => {
    files.forEach((f, i) => stmt.run(f.filename, f.originalname, f.size, folders[i] || '', req.session.user.username));
  });
  ins(req.files);
  const totalMB = (req.files.reduce((a, f) => a + f.size, 0) / 1048576).toFixed(2);
  await tgSend(`📤 <b>Загрузка файлов</b>\nПользователь: <b>${req.session.user.username}</b>\nФайлов: ${req.files.length}\nРазмер: ${totalMB} MB\nIP: <code>${getIP(req)}</code>`);
  res.json({ ok: true, count: req.files.length });
});

// ─── Download ─────────────────────────────────────────────────────────────────
app.get('/download/:id', requireAuth, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id);
  if (!file) return res.status(404).send('Файл не найден');
  db.prepare('UPDATE files SET downloads=downloads+1 WHERE id=?').run(file.id);
  const fp = path.join(UPLOAD_DIR, file.filename);
  if (!fs.existsSync(fp)) return res.status(404).send('Файл удалён с диска');
  res.download(fp, file.original_name);
});

// ─── Delete ───────────────────────────────────────────────────────────────────
app.get('/delete/:id', requireAuth, requireAdmin, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id);
  if (!file) return res.redirect('/');
  const fp = path.join(UPLOAD_DIR, file.filename);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  db.prepare('DELETE FROM files WHERE id=?').run(file.id);
  res.redirect('/');
});

// ─── Admin Panel ──────────────────────────────────────────────────────────────
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  const user = req.session.user;
  const users = db.prepare('SELECT id,username,role,created_at FROM users ORDER BY id').all();
  const logins = db.prepare('SELECT * FROM logins ORDER BY ts DESC LIMIT 50').all();
  const files = db.prepare('SELECT * FROM files ORDER BY uploaded_at DESC LIMIT 20').all();
  const totalFiles = db.prepare('SELECT COUNT(*) as n FROM files').get().n;
  const totalSize = db.prepare('SELECT SUM(size) as s FROM files').get().s || 0;
  const totalLogins = db.prepare('SELECT COUNT(*) as n FROM logins WHERE success=1').get().n;
  const failLogins = db.prepare('SELECT COUNT(*) as n FROM logins WHERE success=0').get().n;
  const mem = process.memoryUsage();

  const usersHTML = users.map(u => `
<tr>
  <td>${u.id}</td>
  <td><b>${u.username}</b></td>
  <td><span class="badge badge-${u.role}">${u.role}</span></td>
  <td style="color:var(--text2)">${formatDate(u.created_at)}</td>
  <td>${u.username !== ADMIN_USER ? `<a class="btn btn-danger btn-sm" href="/admin/delete-user/${u.id}" onclick="return confirm('Удалить?')">Удалить</a>` : '—'}</td>
</tr>`).join('');

  const loginsHTML = logins.map(l => `
<tr>
  <td style="color:${l.success ? '#56d364' : '#f85149'}">${l.success ? '✓' : '✗'}</td>
  <td><b>${l.username}</b></td>
  <td><code>${l.ip}</code></td>
  <td style="color:var(--text2)">${formatDate(l.ts)}</td>
</tr>`).join('');

  res.send(page('Администратор', `
<h1 style="font-size:22px;margin-bottom:20px">Панель администратора</h1>

<div class="stats-grid">
  <div class="stat"><div class="val">${totalFiles}</div><div class="lbl">Файлов</div></div>
  <div class="stat"><div class="val">${formatBytes(totalSize)}</div><div class="lbl">Занято</div></div>
  <div class="stat"><div class="val">${totalLogins}</div><div class="lbl">Входов</div></div>
  <div class="stat"><div class="val" style="color:var(--danger)">${failLogins}</div><div class="lbl">Ошибок входа</div></div>
  <div class="stat"><div class="val">${uptime()}</div><div class="lbl">Аптайм</div></div>
  <div class="stat"><div class="val">${formatBytes(mem.rss)}</div><div class="lbl">Память</div></div>
</div>

<div class="card">
  <h2>Создать пользователя</h2>
  <form method="POST" action="/admin/create-user" style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
    <div style="flex:1;min-width:150px"><label>Логин</label><input name="username" placeholder="user1" style="margin:0"></div>
    <div style="flex:1;min-width:150px"><label>Пароль</label><input name="password" type="password" placeholder="••••••" style="margin:0"></div>
    <div style="min-width:120px"><label>Роль</label><select name="role" style="margin:0"><option value="user">user</option><option value="admin">admin</option></select></div>
    <button class="btn btn-success" type="submit">Создать</button>
  </form>
</div>

<div class="card">
  <h2>Пользователи</h2>
  <div style="overflow-x:auto">
  <table class="table">
    <thead><tr><th>ID</th><th>Логин</th><th>Роль</th><th>Создан</th><th></th></tr></thead>
    <tbody>${usersHTML}</tbody>
  </table>
  </div>
</div>

<div class="card">
  <h2>Последние входы</h2>
  <div style="overflow-x:auto">
  <table class="table">
    <thead><tr><th>Статус</th><th>Логин</th><th>IP</th><th>Время</th></tr></thead>
    <tbody>${loginsHTML}</tbody>
  </table>
  </div>
</div>

<div class="card">
  <h2>Системная информация</h2>
  <table class="table">
    <tr><td style="color:var(--text2)">ОС</td><td>${os.platform()} ${os.release()}</td></tr>
    <tr><td style="color:var(--text2)">Хост</td><td>${os.hostname()}</td></tr>
    <tr><td style="color:var(--text2)">CPU</td><td>${os.cpus()[0]?.model || '—'} × ${os.cpus().length}</td></tr>
    <tr><td style="color:var(--text2)">RAM всего</td><td>${formatBytes(os.totalmem())}</td></tr>
    <tr><td style="color:var(--text2)">RAM свободно</td><td>${formatBytes(os.freemem())}</td></tr>
    <tr><td style="color:var(--text2)">Версия Node</td><td>${process.version}</td></tr>
    <tr><td style="color:var(--text2)">Версия сервера</td><td>v${VERSION}</td></tr>
  </table>
</div>`, user));
});

app.post('/admin/create-user', requireAuth, requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.redirect('/admin');
  const hash = await bcrypt.hash(password, 10);
  try {
    db.prepare('INSERT INTO users (username,password,role) VALUES (?,?,?)').run(username, hash, role || 'user');
  } catch (e) { /* duplicate */ }
  res.redirect('/admin');
});

app.get('/admin/delete-user/:id', requireAuth, requireAdmin, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (u && u.username !== ADMIN_USER) db.prepare('DELETE FROM users WHERE id=?').run(u.id);
  res.redirect('/admin');
});

// ─── API ──────────────────────────────────────────────────────────────────────
app.get('/api/status', requireAuth, (req, res) => {
  const cpus = os.cpus();
  const totalMem = os.totalmem(), freeMem = os.freemem();
  const ramPct = Math.round((1 - freeMem / totalMem) * 100);
  // Simple CPU usage approximation via load average
  const load = os.loadavg()[0];
  const cpuPct = Math.min(100, Math.round((load / cpus.length) * 100));
  res.json({
    ok: true,
    version: VERSION,
    uptime: uptime(),
    cpu: cpuPct,
    ram: ramPct,
    files: db.prepare('SELECT COUNT(*) as n FROM files').get().n,
    size: db.prepare('SELECT SUM(size) as s FROM files').get().s || 0
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`FileServer v${VERSION} запущен на порту ${PORT}`);
  await tgSend(`🚀 <b>FileServer v${VERSION}</b> запущен!\nПорт: ${PORT}\nАптайм: ${uptime()}`);
});

module.exports = app;
