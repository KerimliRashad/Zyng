const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DB_PATH = path.join(__dirname, 'data.db');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Database setup
const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    size INTEGER NOT NULL,
    mimetype TEXT,
    uploaded_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create default admin if not exists
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hash, 'admin');
  console.log('Default admin created: admin / admin123 — CHANGE THE PASSWORD!');
}

// Multer storage config
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB limit
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 1 week
}));

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied');
  }
  next();
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

const html = (title, body, user) => `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }
  nav { background: #1e293b; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #334155; }
  nav .logo { font-size: 20px; font-weight: 700; color: #60a5fa; }
  nav .links a { color: #94a3b8; text-decoration: none; margin-left: 16px; font-size: 14px; }
  nav .links a:hover { color: #e2e8f0; }
  .container { max-width: 1000px; margin: 0 auto; padding: 32px 16px; }
  h1 { font-size: 24px; margin-bottom: 24px; color: #f1f5f9; }
  h2 { font-size: 18px; margin-bottom: 16px; color: #cbd5e1; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
  .btn { display: inline-block; padding: 8px 18px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; text-decoration: none; }
  .btn-primary { background: #3b82f6; color: white; }
  .btn-primary:hover { background: #2563eb; }
  .btn-danger { background: #ef4444; color: white; font-size: 12px; padding: 5px 12px; }
  .btn-danger:hover { background: #dc2626; }
  .btn-success { background: #22c55e; color: white; }
  .btn-success:hover { background: #16a34a; }
  input[type=text], input[type=password], input[type=file] {
    width: 100%; padding: 10px 14px; background: #0f172a; border: 1px solid #334155;
    border-radius: 8px; color: #e2e8f0; font-size: 14px; margin-bottom: 12px;
  }
  input[type=text]:focus, input[type=password]:focus { outline: none; border-color: #3b82f6; }
  label { display: block; font-size: 13px; color: #94a3b8; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; padding: 10px 12px; color: #64748b; font-weight: 600; border-bottom: 1px solid #334155; }
  td { padding: 10px 12px; border-bottom: 1px solid #1e293b; vertical-align: middle; }
  tr:hover td { background: #263245; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
  .badge-admin { background: #7c3aed; color: white; }
  .badge-user { background: #0369a1; color: white; }
  .alert { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; }
  .alert-error { background: #450a0a; border: 1px solid #ef4444; color: #fca5a5; }
  .alert-success { background: #052e16; border: 1px solid #22c55e; color: #86efac; }
  .upload-area { border: 2px dashed #334155; border-radius: 12px; padding: 32px; text-align: center; cursor: pointer; transition: border-color 0.2s; }
  .upload-area:hover { border-color: #3b82f6; }
  .upload-area input[type=file] { display: none; }
  .file-name { font-size: 13px; color: #60a5fa; margin-top: 8px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .stat { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 20px; }
  .stat .num { font-size: 28px; font-weight: 700; color: #60a5fa; }
  .stat .label { font-size: 13px; color: #64748b; margin-top: 4px; }
</style>
</head>
<body>
<nav>
  <div class="logo">FileServer</div>
  <div class="links">
    ${user ? `<a href="/">Файлы</a>${user.role === 'admin' ? '<a href="/admin">Админ</a>' : ''}<a href="/logout">Выйти (${user.username})</a>` : '<a href="/login">Войти</a>'}
  </div>
</nav>
<div class="container">
${body}
</div>
</body>
</html>`;

// Login page
app.get('/login', (req, res) => {
  res.send(html('Вход', `
    <div style="max-width:380px;margin:60px auto">
      <div class="card">
        <h1 style="margin-bottom:20px">Вход</h1>
        ${req.query.error ? '<div class="alert alert-error">Неверный логин или пароль</div>' : ''}
        <form method="POST" action="/login">
          <label>Логин</label>
          <input type="text" name="username" required autofocus>
          <label>Пароль</label>
          <input type="password" name="password" required>
          <button class="btn btn-primary" style="width:100%;padding:12px" type="submit">Войти</button>
        </form>
      </div>
    </div>
  `, null));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.redirect('/login?error=1');
  }
  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Main file listing
app.get('/', requireLogin, (req, res) => {
  const files = db.prepare('SELECT * FROM files ORDER BY created_at DESC').all();
  const totalSize = files.reduce((s, f) => s + f.size, 0);

  const rows = files.map(f => `
    <tr>
      <td>${escHtml(f.original_name)}</td>
      <td>${formatSize(f.size)}</td>
      <td>${escHtml(f.uploaded_by)}</td>
      <td>${new Date(f.created_at).toLocaleString('ru-RU')}</td>
      <td>
        <a href="/download/${f.id}" class="btn btn-success" style="margin-right:6px">Скачать</a>
        ${req.session.user.role === 'admin' || req.session.user.username === f.uploaded_by
          ? `<form method="POST" action="/delete/${f.id}" style="display:inline" onsubmit="return confirm('Удалить файл?')"><button class="btn btn-danger" type="submit">Удалить</button></form>`
          : ''}
      </td>
    </tr>
  `).join('');

  res.send(html('Файлы', `
    <h1>Мои файлы</h1>
    <div class="stats">
      <div class="stat"><div class="num">${files.length}</div><div class="label">Файлов</div></div>
      <div class="stat"><div class="num">${formatSize(totalSize)}</div><div class="label">Занято места</div></div>
    </div>
    <div class="card">
      <h2>Загрузить файл</h2>
      <form method="POST" action="/upload" enctype="multipart/form-data">
        <div class="upload-area" onclick="document.getElementById('fileInput').click()">
          <div style="font-size:36px">📁</div>
          <div style="margin-top:8px;color:#94a3b8">Нажмите для выбора файла</div>
          <div style="font-size:12px;color:#475569;margin-top:4px">Максимум 500 MB</div>
          <input type="file" id="fileInput" name="file" required onchange="document.getElementById('fn').textContent=this.files[0]?.name||''">
          <div class="file-name" id="fn"></div>
        </div>
        <br>
        <button class="btn btn-primary" type="submit">Загрузить</button>
      </form>
    </div>
    <div class="card">
      <h2>Все файлы</h2>
      ${files.length === 0 ? '<p style="color:#64748b">Нет файлов</p>' : `
        <table>
          <thead><tr><th>Имя файла</th><th>Размер</th><th>Кто загрузил</th><th>Дата</th><th>Действия</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`}
    </div>
  `, req.session.user));
});

app.post('/upload', requireLogin, upload.single('file'), (req, res) => {
  if (!req.file) return res.redirect('/');
  db.prepare('INSERT INTO files (original_name, stored_name, size, mimetype, uploaded_by) VALUES (?, ?, ?, ?, ?)')
    .run(req.file.originalname, req.file.filename, req.file.size, req.file.mimetype, req.session.user.username);
  res.redirect('/');
});

app.get('/download/:id', requireLogin, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).send('Файл не найден');
  const filePath = path.join(UPLOADS_DIR, file.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).send('Файл не найден на диске');
  res.download(filePath, file.original_name);
});

app.post('/delete/:id', requireLogin, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.redirect('/');
  if (req.session.user.role !== 'admin' && req.session.user.username !== file.uploaded_by) {
    return res.status(403).send('Нет доступа');
  }
  const filePath = path.join(UPLOADS_DIR, file.stored_name);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM files WHERE id = ?').run(file.id);
  res.redirect('/');
});

// Admin panel
app.get('/admin', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at').all();
  const rows = users.map(u => `
    <tr>
      <td>${escHtml(u.username)}</td>
      <td><span class="badge badge-${u.role}">${u.role}</span></td>
      <td>${new Date(u.created_at).toLocaleString('ru-RU')}</td>
      <td>
        ${u.username !== 'admin' ? `<form method="POST" action="/admin/delete/${u.id}" style="display:inline" onsubmit="return confirm('Удалить пользователя?')"><button class="btn btn-danger" type="submit">Удалить</button></form>` : ''}
      </td>
    </tr>
  `).join('');

  res.send(html('Админ', `
    <h1>Панель администратора</h1>
    <div class="card">
      <h2>Добавить пользователя</h2>
      ${req.query.created ? '<div class="alert alert-success">Пользователь создан!</div>' : ''}
      ${req.query.exists ? '<div class="alert alert-error">Такой логин уже существует</div>' : ''}
      <form method="POST" action="/admin/users">
        <label>Логин</label>
        <input type="text" name="username" required>
        <label>Пароль</label>
        <input type="password" name="password" required>
        <label>Роль</label>
        <select name="role" style="width:100%;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;margin-bottom:12px">
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <button class="btn btn-primary" type="submit">Создать</button>
      </form>
    </div>
    <div class="card">
      <h2>Пользователи</h2>
      <table>
        <thead><tr><th>Логин</th><th>Роль</th><th>Дата создания</th><th>Действия</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="card">
      <h2>Сменить пароль</h2>
      ${req.query.pwdok ? '<div class="alert alert-success">Пароль изменён!</div>' : ''}
      <form method="POST" action="/admin/change-password">
        <label>Новый пароль</label>
        <input type="password" name="password" required>
        <button class="btn btn-primary" type="submit">Сохранить</button>
      </form>
    </div>
  `, req.session.user));
});

app.post('/admin/users', requireAdmin, (req, res) => {
  const { username, password, role } = req.body;
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.redirect('/admin?exists=1');
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hash, role);
  res.redirect('/admin?created=1');
});

app.post('/admin/delete/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

app.post('/admin/change-password', requireAdmin, (req, res) => {
  const hash = bcrypt.hashSync(req.body.password, 10);
  db.prepare('UPDATE users SET password = ? WHERE username = ?').run(hash, req.session.user.username);
  res.redirect('/admin?pwdok=1');
});

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

app.listen(PORT, () => {
  console.log(`FileServer running on http://localhost:${PORT}`);
});
