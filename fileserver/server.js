'use strict';
require('dotenv').config();

const express    = require('express');
const session    = require('express-session');
const multer     = require('multer');
const bcrypt     = require('bcrypt');
const Database   = require('better-sqlite3');
const SQLiteStore = require('connect-sqlite3')(session);
const rateLimit  = require('express-rate-limit');
const helmet     = require('helmet');
const compression = require('compression');
const fetch      = require('node-fetch');
const path       = require('path');
const fs         = require('fs');
const os         = require('os');
const crypto     = require('crypto');

// ── Config ──────────────────────────────────────────────────────────────────
const VERSION      = '3.2';
const PORT         = process.env.PORT || 3000;
const UPLOAD_DIR   = path.join(__dirname, 'uploads');
const DB_FILE      = path.join(__dirname, 'fileserver.db');
const ADMIN_USER   = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS   = process.env.ADMIN_PASS || 'admin123';
const TG_TOKEN     = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT      = process.env.TELEGRAM_CHAT_ID   || '';
const SESS_SECRET  = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Database ─────────────────────────────────────────────────────────────────
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS files (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    disk_name   TEXT NOT NULL,
    orig_name   TEXT NOT NULL,
    size        INTEGER NOT NULL DEFAULT 0,
    folder      TEXT NOT NULL DEFAULT '',
    uploader    TEXT NOT NULL DEFAULT '',
    uploaded_at INTEGER DEFAULT (strftime('%s','now')),
    downloads   INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS logins (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    ip      TEXT NOT NULL,
    ok      INTEGER NOT NULL,
    ts      INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS otp (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    code     TEXT NOT NULL,
    expires  INTEGER NOT NULL
  );
`);

// Seed admin
if (!db.prepare('SELECT 1 FROM users WHERE username=?').get(ADMIN_USER)) {
  db.prepare('INSERT INTO users (username,password,role) VALUES (?,?,?)')
    .run(ADMIN_USER, bcrypt.hashSync(ADMIN_PASS, 10), 'admin');
}

// ── Telegram ──────────────────────────────────────────────────────────────────
async function tg(text) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'HTML' })
    });
  } catch (_) {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const ip   = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
const fmt  = b => b > 1e9 ? (b/1e9).toFixed(2)+' GB' : b > 1e6 ? (b/1e6).toFixed(1)+' MB' : b > 1e3 ? (b/1e3).toFixed(1)+' KB' : b+' B';
const date = ts => new Date(ts*1000).toLocaleString('ru-RU');
const up   = () => { const s=Math.floor(process.uptime()); return `${Math.floor(s/86400)}д ${Math.floor(s%86400/3600)}ч ${Math.floor(s%3600/60)}м`; };

function auth(req, res, next)  { req.session?.user ? next() : res.redirect('/login'); }
function admin(req, res, next) { req.session?.user?.role==='admin' ? next() : res.status(403).send('Нет доступа'); }

// ── Multer ────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename:    (_, f, cb) => cb(null, Date.now() + '_' + crypto.randomBytes(6).toString('hex') + path.extname(f.originalname))
});
const upload = multer({ storage });

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(rateLimit({ windowMs: 60000, max: 200 }));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
  secret: SESS_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 86400000 * 7 }
}));

const loginLimit = rateLimit({ windowMs: 600000, max: 10 });

// ── CSS + Layout ──────────────────────────────────────────────────────────────
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#0d1117;color:#e6edf3;min-height:100vh}
a{color:#58a6ff;text-decoration:none}a:hover{text-decoration:underline}
nav{background:#161b22;border-bottom:1px solid #30363d;padding:12px 24px;display:flex;align-items:center;gap:12px}
.logo{font-size:18px;font-weight:700;flex:1}.logo span{color:#58a6ff}
nav a{color:#8b949e;font-size:14px;padding:6px 12px;border-radius:6px;transition:.15s}
nav a:hover{background:#21262d;color:#e6edf3;text-decoration:none}
.user{color:#8b949e;font-size:13px;margin-left:auto}
.wrap{max-width:1100px;margin:28px auto;padding:0 16px}
.card{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:22px;margin-bottom:18px}
.card h2{font-size:15px;font-weight:600;margin-bottom:16px}
.btn{display:inline-block;padding:7px 16px;border-radius:6px;border:none;cursor:pointer;font-size:13px;font-weight:500;transition:.15s;text-decoration:none;line-height:1.4}
.btn:hover{text-decoration:none;filter:brightness(1.15)}
.blue{background:#1f6feb;color:#fff}.green{background:#238636;color:#fff}.red{background:#da3633;color:#fff}
.sm{padding:4px 10px;font-size:12px}
input,select{background:#21262d;border:1px solid #30363d;color:#e6edf3;padding:8px 12px;border-radius:6px;font-size:13px;width:100%;margin-bottom:10px}
input:focus,select:focus{outline:none;border-color:#58a6ff}
label{font-size:12px;color:#8b949e;margin-bottom:3px;display:block}
table{width:100%;border-collapse:collapse;font-size:13px}
th{color:#8b949e;font-weight:500;text-align:left;padding:8px 10px;border-bottom:1px solid #30363d}
td{padding:8px 10px;border-bottom:1px solid #21262d;vertical-align:middle}
tr:hover td{background:#21262d}
.badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600}
.ba{background:#1f3a6e;color:#79c0ff}.bu{background:#1c2d1e;color:#56d364}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin-bottom:18px}
.stat{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:18px;text-align:center}
.stat .v{font-size:26px;font-weight:700;color:#58a6ff}.stat .l{font-size:11px;color:#8b949e;margin-top:4px}
.alert{padding:11px 15px;border-radius:6px;margin-bottom:14px;font-size:13px}
.err{background:#3d1a1a;border:1px solid #da3633;color:#f85149}
.ok{background:#1c2d1e;border:1px solid #238636;color:#56d364}
#dz{border:2px dashed #30363d;border-radius:8px;padding:36px;text-align:center;cursor:pointer;transition:.2s}
#dz.over{border-color:#58a6ff;background:rgba(31,111,235,.07)}
#dz p{color:#8b949e;margin:6px 0}
.sbar{background:#161b22;border-bottom:1px solid #30363d;padding:5px 24px;font-size:12px;color:#8b949e;display:flex;gap:20px}
.dot{width:7px;height:7px;border-radius:50%;background:#56d364;display:inline-block;margin-right:4px}
.sf{display:flex;gap:8px;margin-bottom:16px}.sf input{margin:0;flex:1}
#float-upload{display:none;position:fixed;bottom:24px;right:24px;width:320px;background:#161b22;border:1px solid #30363d;border-radius:12px;padding:16px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,.5)}
#float-upload .fu-title{font-size:13px;font-weight:600;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
#float-upload .fu-bar{height:8px;background:#21262d;border-radius:4px;overflow:hidden;margin-bottom:8px}
#float-upload .fu-fill{height:100%;background:#1f6feb;width:0;transition:width .4s}
#float-upload .fu-info{font-size:12px;color:#8b949e}
#float-upload .fu-cancel{background:none;border:none;color:#8b949e;cursor:pointer;font-size:18px;line-height:1}
@media(max-width:600px){.grid{grid-template-columns:1fr 1fr}#float-upload{width:calc(100% - 32px);right:16px;bottom:16px}}
`;

function page(title, body, user = null) {
  return `<!DOCTYPE html><html lang="ru"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — FileServer v${VERSION}</title>
<style>${CSS}</style></head><body>
${user ? `<div class="sbar"><span><span class="dot" id="sd"></span>Онлайн</span><span id="sc">CPU —</span><span id="sr">RAM —</span><span id="su">Аптайм —</span><span>v${VERSION}</span></div>` : ''}
<nav>
  <div class="logo">File<span>Server</span> <small style="font-size:11px;color:#8b949e">v${VERSION}</small></div>
  ${user ? `<a href="/">Файлы</a>${user.role==='admin'?'<a href="/admin">Админ</a>':''}<span class="user">${user.username} <span class="badge ${user.role==='admin'?'ba':'bu'}">${user.role}</span></span><a href="/logout">Выход</a>` : ''}
</nav>
<div class="wrap">${body}</div>
${user ? `<script>
let uploading=false;
window.addEventListener('beforeunload',e=>{if(uploading){e.preventDefault();e.returnValue='Загрузка файлов ещё идёт! Подождите.';}});
async function loadStatus(){try{const d=await(await fetch('/api/status')).json();document.getElementById('sc').textContent='CPU '+d.cpu+'%';document.getElementById('sr').textContent='RAM '+d.ram+'%';document.getElementById('su').textContent='Аптайм '+d.uptime;}catch(e){if(document.getElementById('sd'))document.getElementById('sd').style.background='#da3633';}}
loadStatus();setInterval(loadStatus,15000);
</script>` : ''}
</body></html>`;
}

// ── Login ─────────────────────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.session?.user) return res.redirect('/');
  const msg = {bad:'Неверный логин или пароль', otp:'Неверный код'}[req.query.e] || '';
  res.send(page('Вход', `
<div style="max-width:360px;margin:70px auto">
<div class="card"><h2>Вход в систему</h2>
${msg ? `<div class="alert err">${msg}</div>` : ''}
<form method="POST" action="/login">
<label>Логин</label><input name="u" required autocomplete="username">
<label>Пароль</label><input name="p" type="password" required autocomplete="current-password">
<button class="btn blue" style="width:100%" type="submit">Войти →</button>
</form></div></div>`));
});

app.post('/login', loginLimit, async (req, res) => {
  const { u, p } = req.body;
  const clientIP = ip(req);
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(u);
  if (!user || !await bcrypt.compare(p, user.password)) {
    db.prepare('INSERT INTO logins (username,ip,ok) VALUES (?,?,0)').run(u || '?', clientIP);
    const fails = db.prepare('SELECT COUNT(*) c FROM logins WHERE ip=? AND ok=0 AND ts>?').get(clientIP, Math.floor(Date.now()/1000)-600).c;
    if (fails >= 5) await tg(`🚨 <b>Брутфорс!</b>\nIP: <code>${clientIP}</code>\nЛогин: <code>${u}</code>\nПопыток: ${fails}`);
    return res.redirect('/login?e=bad');
  }
  if (user.role === 'admin') {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const exp  = Math.floor(Date.now()/1000) + 300;
    db.prepare('DELETE FROM otp WHERE username=?').run(u);
    db.prepare('INSERT INTO otp (username,code,expires) VALUES (?,?,?)').run(u, code, exp);
    await tg(`🔐 <b>Код входа: <code>${code}</code></b>\nДействует 5 мин\nIP: <code>${clientIP}</code>`);
    req.session.otp_user = u;
    return res.redirect('/otp');
  }
  db.prepare('INSERT INTO logins (username,ip,ok) VALUES (?,?,1)').run(u, clientIP);
  req.session.user = { id: user.id, username: user.username, role: user.role };
  await tg(`✅ Вход: <b>${u}</b> | IP: <code>${clientIP}</code>`);
  res.redirect('/');
});

app.get('/otp', (req, res) => {
  if (!req.session.otp_user) return res.redirect('/login');
  const err = req.query.e ? '<div class="alert err">Неверный или просроченный код</div>' : '';
  res.send(page('2FA', `
<div style="max-width:360px;margin:70px auto">
<div class="card"><h2>Двухфакторная аутентификация</h2>
${err}<p style="color:#8b949e;font-size:13px;margin-bottom:14px">Код отправлен в Telegram. Введите 6 цифр.</p>
<form method="POST" action="/otp">
<label>Код</label><input name="code" maxlength="6" autofocus autocomplete="one-time-code" placeholder="______">
<button class="btn blue" style="width:100%" type="submit">Подтвердить</button>
</form></div></div>`));
});

app.post('/otp', (req, res) => {
  const u = req.session.otp_user;
  if (!u) return res.redirect('/login');
  const now = Math.floor(Date.now()/1000);
  const row = db.prepare('SELECT * FROM otp WHERE username=? AND expires>?').get(u, now);
  if (!row || row.code !== req.body.code?.trim()) return res.redirect('/otp?e=1');
  db.prepare('DELETE FROM otp WHERE username=?').run(u);
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(u);
  db.prepare('INSERT INTO logins (username,ip,ok) VALUES (?,?,1)').run(u, ip(req));
  req.session.otp_user = null;
  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.redirect('/');
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

// ── Main page ─────────────────────────────────────────────────────────────────
app.get('/', auth, (req, res) => {
  const user = req.session.user;
  const q    = req.query.q || '';
  const files = q
    ? db.prepare('SELECT * FROM files WHERE orig_name LIKE ? ORDER BY uploaded_at DESC').all(`%${q}%`)
    : db.prepare('SELECT * FROM files ORDER BY uploaded_at DESC').all();
  const stats = db.prepare('SELECT COUNT(*) c, SUM(size) s FROM files').get();

  const rows = files.map(f => `
<tr>
  <td><a href="/dl/${f.id}" title="${f.orig_name}">${f.orig_name.length>50?f.orig_name.slice(0,48)+'…':f.orig_name}</a>${f.folder?` <span style="color:#8b949e;font-size:11px">📁${f.folder}</span>`:''}</td>
  <td>${fmt(f.size)}</td>
  <td style="color:#8b949e">${f.uploader}</td>
  <td style="color:#8b949e">${date(f.uploaded_at)}</td>
  <td>${f.downloads}</td>
  <td style="white-space:nowrap">
    <a class="btn blue sm" href="/dl/${f.id}">↓ Скачать</a>
    ${user.role==='admin'?`<a class="btn red sm" href="/del/${f.id}" onclick="return confirm('Удалить файл?')">✕</a>`:''}
  </td>
</tr>`).join('');

  res.send(page('Файлы', `
<div class="grid">
  <div class="stat"><div class="v">${stats.c||0}</div><div class="l">Файлов</div></div>
  <div class="stat"><div class="v">${fmt(stats.s||0)}</div><div class="l">Занято</div></div>
  <div class="stat"><div class="v">${up()}</div><div class="l">Аптайм</div></div>
</div>
<div class="card">
  <h2>Загрузить файлы / папки</h2>
  <div id="dz" onclick="document.getElementById('fi').click()">
    <p style="font-size:28px">📁</p>
    <p>Перетащите файлы или папки сюда</p>
    <p style="font-size:11px">или нажмите для выбора файлов</p>
    <input id="fi" type="file" multiple style="display:none">
  </div>
</div>

<div id="float-upload">
  <div class="fu-title">
    <span id="fu-label">Загрузка…</span>
    <button class="fu-cancel" id="fu-cancel" title="Отмена">✕</button>
  </div>
  <div class="fu-bar"><div class="fu-fill" id="fu-fill"></div></div>
  <div class="fu-info" id="fu-info"></div>
</div>
<div class="card">
  <h2>Файлы</h2>
  <form class="sf" method="GET">
    <input name="q" placeholder="Поиск…" value="${q}">
    <button class="btn blue" type="submit">Найти</button>
    ${q?'<a class="btn" href="/" style="background:#21262d">✕</a>':''}
  </form>
  <div style="overflow-x:auto">
  <table><thead><tr><th>Имя</th><th>Размер</th><th>Кто</th><th>Дата</th><th>↓</th><th></th></tr></thead>
  <tbody>${rows||'<tr><td colspan="6" style="text-align:center;padding:28px;color:#8b949e">Файлов нет — загрузите первый!</td></tr>'}</tbody>
  </table></div>
</div>
<script>
const dz=document.getElementById('dz'),fi=document.getElementById('fi');
const fu=document.getElementById('float-upload'),fuFill=document.getElementById('fu-fill'),
      fuInfo=document.getElementById('fu-info'),fuLabel=document.getElementById('fu-label'),
      fuCancel=document.getElementById('fu-cancel');
let currentXHR=null;

dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('over')});
dz.addEventListener('dragleave',()=>dz.classList.remove('over'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('over');handleItems(e.dataTransfer.items)});
fi.addEventListener('change',()=>{go(Array.from(fi.files),[]);fi.value=''});

fuCancel.addEventListener('click',()=>{
  if(currentXHR){currentXHR.abort();currentXHR=null;}
  fu.style.display='none';uploading=false;
});

async function handleItems(items){
  const files=[],folders=[];
  async function read(entry,pre){
    if(entry.isFile){await new Promise(r=>entry.file(f=>{files.push(f);folders.push(pre);r()}))}
    else if(entry.isDirectory){const rd=entry.createReader();await new Promise(r=>rd.readEntries(async es=>{for(const e of es)await read(e,pre?pre+'/'+entry.name:entry.name);r()}))}
  }
  for(const item of items){const e=item.webkitGetAsEntry?.();if(e)await read(e,'');else if(item.getAsFile){files.push(item.getAsFile());folders.push('')}}
  go(files,folders);
}

function go(files,folders){
  if(!files.length)return;
  const totalMB=(files.reduce((a,f)=>a+f.size,0)/1048576).toFixed(1);
  fuLabel.textContent=files.length===1?files[0].name:files.length+' файлов ('+totalMB+' MB)';
  fuFill.style.width='0%';fuFill.style.background='#1f6feb';
  fuInfo.textContent='Подготовка…';fu.style.display='block';

  const fd=new FormData();
  files.forEach((f,i)=>{fd.append('files',f);fd.append('folders',folders[i]||'')});

  const x=new XMLHttpRequest();
  currentXHR=x;

  x.upload.addEventListener('progress',e=>{
    if(!e.lengthComputable)return;
    const p=Math.round(e.loaded/e.total*100);
    const loaded=(e.loaded/1048576).toFixed(1),total=(e.total/1048576).toFixed(1);
    fuFill.style.width=p+'%';
    fuInfo.textContent=p+'% — '+loaded+' MB / '+total+' MB';
    document.title=p+'% загрузка — FileServer';
  });

  x.addEventListener('load',()=>{
    uploading=false;currentXHR=null;document.title='Файлы — FileServer';
    if(x.status===200){
      fuFill.style.width='100%';fuFill.style.background='#238636';
      fuInfo.textContent='✓ Загружено успешно!';fuLabel.textContent='Готово!';
      setTimeout(()=>{fu.style.display='none';location.reload();},1500);
    } else {
      fuFill.style.background='#da3633';fuInfo.textContent='Ошибка сервера: '+x.status;
    }
  });

  x.addEventListener('error',()=>{
    uploading=false;currentXHR=null;document.title='Файлы — FileServer';
    fuFill.style.background='#da3633';fuInfo.textContent='Ошибка соединения. Попробуйте снова.';
  });

  x.addEventListener('abort',()=>{
    document.title='Файлы — FileServer';
    fuInfo.textContent='Загрузка отменена.';
  });

  x.open('POST','/upload');
  uploading=true;
  x.send(fd);
}
</script>`, user));
});

// ── Upload ────────────────────────────────────────────────────────────────────
app.post('/upload', auth, upload.array('files'), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'Нет файлов' });
  const raw = req.body.folders;
  const folders = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const ins = db.prepare('INSERT INTO files (disk_name,orig_name,size,folder,uploader) VALUES (?,?,?,?,?)');
  db.transaction(files => {
    files.forEach((f, i) => ins.run(f.filename, f.originalname, f.size, folders[i] || '', req.session.user.username));
  })(req.files);
  const mb = (req.files.reduce((a, f) => a + f.size, 0) / 1048576).toFixed(2);
  await tg(`📤 <b>Загружено</b>\nПользователь: <b>${req.session.user.username}</b>\nФайлов: ${req.files.length} (${mb} MB)\nIP: <code>${ip(req)}</code>`);
  res.json({ ok: true });
});

// ── Download ──────────────────────────────────────────────────────────────────
app.get('/dl/:id', auth, (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id);
  if (!f) return res.status(404).send('Файл не найден');
  const fp = path.join(UPLOAD_DIR, f.disk_name);
  if (!fs.existsSync(fp)) return res.status(404).send('Файл удалён с диска');
  db.prepare('UPDATE files SET downloads=downloads+1 WHERE id=?').run(f.id);
  res.download(fp, f.orig_name);
});

// ── Delete ────────────────────────────────────────────────────────────────────
app.get('/del/:id', auth, admin, (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id);
  if (f) {
    const fp = path.join(UPLOAD_DIR, f.disk_name);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    db.prepare('DELETE FROM files WHERE id=?').run(f.id);
  }
  res.redirect('/');
});

// ── Admin ─────────────────────────────────────────────────────────────────────
app.get('/admin', auth, admin, (req, res) => {
  const user   = req.session.user;
  const users  = db.prepare('SELECT id,username,role,created_at FROM users ORDER BY id').all();
  const logins = db.prepare('SELECT * FROM logins ORDER BY ts DESC LIMIT 50').all();
  const stats  = db.prepare('SELECT COUNT(*) c,SUM(size) s FROM files').get();
  const fails  = db.prepare('SELECT COUNT(*) c FROM logins WHERE ok=0').get().c;
  const mem    = process.memoryUsage();
  const disk   = { total: 23*1024*1024*1024, free: 13*1024*1024*1024 }; // approximate

  const urows = users.map(u => `<tr>
    <td>${u.id}</td><td><b>${u.username}</b></td>
    <td><span class="badge ${u.role==='admin'?'ba':'bu'}">${u.role}</span></td>
    <td style="color:#8b949e">${date(u.created_at)}</td>
    <td>${u.username!==ADMIN_USER?`<a class="btn red sm" href="/admin/del-user/${u.id}" onclick="return confirm('Удалить?')">Удалить</a>`:'—'}</td>
  </tr>`).join('');

  const lrows = logins.map(l => `<tr>
    <td style="color:${l.ok?'#56d364':'#f85149'}">${l.ok?'✓':'✗'}</td>
    <td><b>${l.username}</b></td><td><code>${l.ip}</code></td>
    <td style="color:#8b949e">${date(l.ts)}</td>
  </tr>`).join('');

  res.send(page('Админ', `
<h1 style="font-size:20px;margin-bottom:18px">Панель администратора</h1>
<div class="grid">
  <div class="stat"><div class="v">${stats.c||0}</div><div class="l">Файлов</div></div>
  <div class="stat"><div class="v">${fmt(stats.s||0)}</div><div class="l">Загружено</div></div>
  <div class="stat"><div class="v" style="color:#f85149">${fails}</div><div class="l">Ошибок входа</div></div>
  <div class="stat"><div class="v">${up()}</div><div class="l">Аптайм</div></div>
  <div class="stat"><div class="v">${fmt(mem.rss)}</div><div class="l">Память Node</div></div>
  <div class="stat"><div class="v">${os.cpus().length}</div><div class="l">CPU ядер</div></div>
</div>
<div class="card">
  <h2>Создать пользователя</h2>
  <form method="POST" action="/admin/add-user" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
    <div style="flex:1;min-width:130px"><label>Логин</label><input name="username" placeholder="user1" style="margin:0"></div>
    <div style="flex:1;min-width:130px"><label>Пароль</label><input name="password" type="password" placeholder="••••••" style="margin:0"></div>
    <div style="min-width:110px"><label>Роль</label><select name="role" style="margin:0"><option value="user">user</option><option value="admin">admin</option></select></div>
    <button class="btn green" type="submit">Создать</button>
  </form>
</div>
<div class="card"><h2>Пользователи</h2>
  <div style="overflow-x:auto"><table>
    <thead><tr><th>ID</th><th>Логин</th><th>Роль</th><th>Создан</th><th></th></tr></thead>
    <tbody>${urows}</tbody>
  </table></div>
</div>
<div class="card"><h2>Последние входы</h2>
  <div style="overflow-x:auto"><table>
    <thead><tr><th>Статус</th><th>Логин</th><th>IP</th><th>Время</th></tr></thead>
    <tbody>${lrows}</tbody>
  </table></div>
</div>
<div class="card"><h2>Система</h2>
  <table>
    <tr><td style="color:#8b949e;width:160px">ОС</td><td>${os.platform()} ${os.release()}</td></tr>
    <tr><td style="color:#8b949e">CPU</td><td>${os.cpus()[0]?.model} × ${os.cpus().length}</td></tr>
    <tr><td style="color:#8b949e">RAM всего</td><td>${fmt(os.totalmem())}</td></tr>
    <tr><td style="color:#8b949e">RAM свободно</td><td>${fmt(os.freemem())}</td></tr>
    <tr><td style="color:#8b949e">Node.js</td><td>${process.version}</td></tr>
    <tr><td style="color:#8b949e">Версия</td><td>v${VERSION}</td></tr>
  </table>
</div>`, user));
});

app.post('/admin/add-user', auth, admin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.redirect('/admin');
  try { db.prepare('INSERT INTO users (username,password,role) VALUES (?,?,?)').run(username, await bcrypt.hash(password, 10), role || 'user'); } catch (_) {}
  res.redirect('/admin');
});

app.get('/admin/del-user/:id', auth, admin, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (u && u.username !== ADMIN_USER) db.prepare('DELETE FROM users WHERE id=?').run(u.id);
  res.redirect('/admin');
});

// ── API ───────────────────────────────────────────────────────────────────────
app.get('/api/status', auth, (req, res) => {
  const load = os.loadavg()[0];
  const cpuPct = Math.min(100, Math.round(load / os.cpus().length * 100));
  const ramPct = Math.round((1 - os.freemem() / os.totalmem()) * 100);
  res.json({ ok: true, version: VERSION, uptime: up(), cpu: cpuPct, ram: ramPct });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`FileServer v${VERSION} запущен на порту ${PORT}`);
  await tg(`🚀 <b>FileServer v${VERSION}</b> запущен!\nПорт: ${PORT}`);
});
