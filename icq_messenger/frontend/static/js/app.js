// ── State ─────────────────────────────────────────────────────────────────────
let token = localStorage.getItem('jf_token');
let me = JSON.parse(localStorage.getItem('jf_me') || 'null');
let ws = null;
let activeChatId = null;
let friends = [];
let chats = [];
let typingHideTimer = null;
let searchTimer = null;
let notifTimer = null;
let pendingFile = null; // { url, name, size, type }

// ── Emojis ────────────────────────────────────────────────────────────────────
const EMOJIS = [
  '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘',
  '😗','😙','😚','🙂','🤗','🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥',
  '😮','🤐','😯','😪','😫','🥱','😴','😌','😛','😜','😝','🤤','😒','😓','😔',
  '😕','🙃','🤑','😲','☹️','🙁','😖','😞','😟','😤','😢','😭','😦','😧','😨',
  '😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵','🥴','😠','😡','🤬','😷',
  '🤒','🤕','🤢','🤮','🤧','😇','🥳','🥸','🤠','🤡','🤥','🤫','🤭','🧐','🤓',
  '👋','🤚','🖐','✋','🖖','👌','🤌','✌️','🤞','🤙','👈','👉','👆','👇','☝️',
  '👍','👎','✊','👊','🤛','🤜','👏','🙌','🤲','🤝','🙏','💪','🦾','🦿','🦵',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗',
  '💖','💘','💝','💟','☮️','✝️','☪️','🕉','☯️','✡️','🔯','🕎','☦️','⛎','♈',
  '🔥','💥','✨','🌟','⭐','🌈','☀️','🌤','⛅','🌥','☁️','🌦','🌧','⛈','🌩',
  '🌨','❄️','☃️','⛄','🌪','🌫','🌬','🌀','🌊','💧','💦','☔','⚡','🌙','⭕',
  '🎉','🎊','🎈','🎁','🎀','🏆','🥇','🥈','🥉','🎖','🏅','🎗','🎟','🎫','🎠',
  '🎡','🎢','🎪','🤹','🎭','🎨','🖼','🎬','🎤','🎧','🎼','🎵','🎶','🎹','🎸',
  '🍕','🍔','🌭','🍟','🌮','🌯','🥙','🧆','🥚','🍳','🥘','🍲','🥗','🥫','🧂',
  '🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟',
  '🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼',
  '🚀','✈️','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚋','🚌',
  '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵',
  '👨‍💻','👩‍💻','🧑‍💻','👨‍🎤','👩‍🎤','🧑‍🎤','👨‍🚀','👩‍🚀','🧑‍🚀','🕵️','💂','🧙','🧝','🧛','🧟',
];

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  buildEmojiPicker();
  if (token && me) {
    showApp();
  } else {
    document.getElementById('auth-screen').classList.remove('hidden');
  }
});

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

function showApp() {
  hide('auth-screen');
  show('app-screen');
  renderMe();
  connectWS();
  loadFriends();
  loadChats();
  loadPending();
}

function doLogout() {
  token = null; me = null;
  localStorage.removeItem('jf_token');
  localStorage.removeItem('jf_me');
  if (ws) { ws.onclose = null; ws.close(); }
  location.reload();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function showTab(t) {
  document.getElementById('tab-login').classList.toggle('active', t === 'login');
  document.getElementById('tab-reg').classList.toggle('active', t === 'register');
  document.getElementById('pane-login').style.display = t === 'login' ? '' : 'none';
  document.getElementById('pane-reg').style.display = t === 'register' ? '' : 'none';
}

async function doLogin() {
  const username = document.getElementById('l-user').value.trim();
  const password = document.getElementById('l-pass').value;
  const errEl = document.getElementById('l-err');
  errEl.textContent = '';
  if (!username || !password) { errEl.textContent = 'Заполните все поля'; return; }

  const form = new FormData();
  form.append('username', username);
  form.append('password', password);

  try {
    const res = await fetch('/api/auth/login', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.detail || 'Ошибка'; return; }
    saveSession(data); showApp();
  } catch (e) {
    errEl.textContent = 'Сервер недоступен';
  }
}

async function doRegister() {
  const username = document.getElementById('r-user').value.trim();
  const password = document.getElementById('r-pass').value;
  const errEl = document.getElementById('r-err');
  errEl.textContent = '';
  if (!username || !password) { errEl.textContent = 'Заполните все поля'; return; }
  if (username.length < 3) { errEl.textContent = 'Логин минимум 3 символа'; return; }
  if (password.length < 4) { errEl.textContent = 'Пароль минимум 4 символа'; return; }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.detail || 'Ошибка'; return; }
    saveSession(data); showApp();
  } catch (e) {
    errEl.textContent = 'Сервер недоступен';
  }
}

function saveSession(d) {
  token = d.access_token;
  me = { id: d.user_id, username: d.username, is_admin: d.is_admin, avatar_color: d.avatar_color };
  localStorage.setItem('jf_token', token);
  localStorage.setItem('jf_me', JSON.stringify(me));
}

// ── Me ────────────────────────────────────────────────────────────────────────
function renderMe() {
  const av = document.getElementById('me-av');
  av.style.background = me.avatar_color;
  av.textContent = me.username[0].toUpperCase();
  document.getElementById('me-name').textContent = me.username;
  document.getElementById('me-id').textContent = 'ID: ' + me.id + (me.is_admin ? ' 👑' : '');
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws?token=${token}`);
  ws.onmessage = e => onWS(JSON.parse(e.data));
  ws.onclose = () => setTimeout(connectWS, 3000);
  ws.onerror = () => ws.close();
}

function onWS(msg) {
  if (msg.type === 'new_message') {
    if (msg.chat_id === activeChatId) {
      hideTyping(); appendMsg(msg); scrollBottom();
    }
    loadChats();
    if (!msg.is_mine) notify(msg.sender_name, msg.text || (msg.file_name ? '📎 ' + msg.file_name : 'Файл'));
  } else if (msg.type === 'typing') {
    if (msg.chat_id === activeChatId) showTyping();
  } else if (msg.type === 'user_status') {
    const f = friends.find(x => x.id === msg.user_id);
    if (f) { f.status = msg.status; renderFriends(); }
    loadChats();
  } else if (msg.type === 'friend_request') {
    loadPending(); notify('Запрос в друзья', 'от ' + msg.from_name);
  } else if (msg.type === 'friend_accepted') {
    loadFriends(); loadChats(); notify('Jeff Messenger', msg.username + ' принял запрос');
  }
}

function wsSend(d) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(d));
}

// ── Friends ───────────────────────────────────────────────────────────────────
async function loadFriends() {
  const r = await api('/api/users/friends'); if (!r) return;
  friends = await r.json(); renderFriends();
}

function renderFriends() {
  const el = document.getElementById('friends-list');
  el.innerHTML = '';
  const on = friends.filter(f => f.status === 'online');
  const off = friends.filter(f => f.status !== 'online');
  if (on.length) {
    el.insertAdjacentHTML('beforeend', `<div class="sec-label">В сети · ${on.length}</div>`);
    on.forEach(f => el.appendChild(mkFriend(f)));
  }
  if (off.length) {
    el.insertAdjacentHTML('beforeend', `<div class="sec-label">Не в сети · ${off.length}</div>`);
    off.forEach(f => el.appendChild(mkFriend(f)));
  }
}

function mkFriend(f) {
  const d = document.createElement('div');
  d.className = 'c-item';
  d.innerHTML = `
    <div class="avatar" style="background:${f.avatar_color}">${f.username[0].toUpperCase()}</div>
    <div class="c-meta">
      <div class="c-name">${x(f.username)}</div>
      <div class="c-sub">ID: ${f.id}</div>
    </div>
    <div class="dot ${f.status}"></div>`;
  if (f.chat_id) d.onclick = () => openChat(f.chat_id, f.username, f.avatar_color, f.status);
  return d;
}

async function loadPending() {
  const r = await api('/api/users/pending-requests'); if (!r) return;
  const reqs = await r.json();
  const el = document.getElementById('pending-list');
  el.innerHTML = '';
  if (!reqs.length) return;
  el.insertAdjacentHTML('beforeend', '<div class="pend-head">Запросы в друзья</div>');
  reqs.forEach(req => {
    const d = document.createElement('div');
    d.className = 'pend-item'; d.id = `pr-${req.request_id}`;
    d.innerHTML = `
      <div class="avatar" style="background:${req.avatar_color}">${req.from_name[0].toUpperCase()}</div>
      <div class="c-meta">
        <div class="c-name">${x(req.from_name)}</div>
        <div class="c-sub">ID: ${req.from_id}</div>
      </div>
      <button class="acc-btn" onclick="acceptReq(${req.request_id})">✓</button>`;
    el.appendChild(d);
  });
}

async function acceptReq(id) {
  const r = await api(`/api/users/friend-request/${id}/accept`, 'POST');
  if (r && r.ok) { document.getElementById(`pr-${id}`)?.remove(); loadFriends(); loadChats(); }
}

// ── Search ────────────────────────────────────────────────────────────────────
function onSearchContacts() {
  clearTimeout(searchTimer);
  const q = document.getElementById('q-contact').value.trim();
  if (!q) { document.getElementById('search-res').innerHTML = ''; return; }
  searchTimer = setTimeout(() => doSearch(q, 'search-res'), 300);
}

function onSearchModal() {
  clearTimeout(searchTimer);
  const q = document.getElementById('modal-q').value.trim();
  if (!q) { document.getElementById('modal-res').innerHTML = ''; return; }
  searchTimer = setTimeout(() => doSearch(q, 'modal-res'), 300);
}

async function doSearch(q, elId) {
  const r = await api(`/api/users/search?q=${encodeURIComponent(q)}`); if (!r) return;
  const users = await r.json();
  const el = document.getElementById(elId);
  el.innerHTML = '';
  if (!users.length) { el.innerHTML = '<div style="padding:10px 14px;color:var(--muted);font-size:13px">Не найдено</div>'; return; }
  const myIds = new Set(friends.map(f => f.id));
  users.forEach(u => {
    const d = document.createElement('div'); d.className = 's-item';
    const has = myIds.has(u.id);
    d.innerHTML = `
      <div class="avatar" style="background:${u.avatar_color}">${u.username[0].toUpperCase()}</div>
      <div class="c-meta">
        <div class="c-name">${x(u.username)}</div>
        <div class="c-sub">ID: ${u.id}</div>
      </div>
      <button class="add-btn" ${has ? 'disabled' : ''} onclick="sendReq(${u.id},this)">${has ? '✓' : 'Добавить'}</button>`;
    el.appendChild(d);
  });
}

async function sendReq(uid, btn) {
  btn.disabled = true; btn.textContent = '...';
  const r = await api(`/api/users/friend-request/${uid}`, 'POST');
  btn.textContent = (r && r.ok) ? 'Отправлено' : 'Уже';
}

// ── Chats list ────────────────────────────────────────────────────────────────
async function loadChats() {
  const r = await api('/api/chats'); if (!r) return;
  chats = await r.json(); renderChats();
}

function renderChats() {
  const el = document.getElementById('chats-list');
  el.innerHTML = '';
  chats.forEach(c => {
    const d = document.createElement('div');
    d.className = 'c-item' + (c.id === activeChatId ? ' active' : '');
    d.id = `ci-${c.id}`;
    const col = c.other_user?.avatar_color || '#5B8DEF';
    const nm = c.name || 'Чат';
    const sub = c.last_message?.text?.slice(0, 36) || '';
    const t = c.last_message ? fmtTime(c.last_message.created_at) : '';
    d.innerHTML = `
      <div class="avatar" style="background:${col}">${nm[0].toUpperCase()}</div>
      <div class="c-meta">
        <div class="c-name">${x(nm)}</div>
        <div class="c-sub">${x(sub)}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0">
        <div style="font-size:10px;color:var(--muted)">${t}</div>
        ${c.unread_count ? `<div class="badge">${c.unread_count}</div>` : ''}
      </div>`;
    d.onclick = () => openChat(c.id, nm, col, c.other_user?.status || 'offline');
    el.appendChild(d);
  });
}

// ── Open Chat ─────────────────────────────────────────────────────────────────
async function openChat(chatId, name, color, status) {
  activeChatId = chatId;
  document.getElementById('no-chat').style.display = 'none';
  const cv = document.getElementById('chat-view');
  cv.style.display = 'flex';

  const av = document.getElementById('ch-av');
  av.style.background = color || '#5B8DEF';
  av.textContent = (name || '?')[0].toUpperCase();
  document.getElementById('ch-name').textContent = name;
  const st = document.getElementById('ch-status');
  st.textContent = status === 'online' ? 'В сети' : 'Не в сети';
  st.className = 'ch-status' + (status === 'online' ? ' online' : '');

  document.querySelectorAll('.c-item').forEach(e => e.classList.remove('active'));
  document.getElementById(`ci-${chatId}`)?.classList.add('active');

  wsSend({ type: 'join_chat', chat_id: chatId });
  await loadMessages(chatId);
  loadChats();
}

async function loadMessages(chatId) {
  document.getElementById('msg-list').innerHTML = '';
  const r = await api(`/api/chats/${chatId}/messages`);
  if (!r || !r.ok) return;
  (await r.json()).forEach(m => appendMsg(m));
  scrollBottom();
}

function appendMsg(m) {
  const list = document.getElementById('msg-list');
  const d = document.createElement('div');
  d.className = 'msg ' + (m.is_mine ? 'me' : 'other');

  let content = '';
  if (m.file_url) {
    const isImg = m.file_type && m.file_type.startsWith('image/');
    if (isImg) {
      content = `<a href="${m.file_url}" target="_blank"><img class="img-msg" src="${m.file_url}" alt="${x(m.file_name)}" loading="lazy"></a>`;
    } else {
      const sz = m.file_size ? fmtSize(m.file_size) : '';
      content = `<a class="file-msg" href="${m.file_url}" target="_blank" download>
        <div class="file-icon">${fileIcon(m.file_type)}</div>
        <div class="file-info">
          <div class="file-nm">${x(m.file_name || 'Файл')}</div>
          ${sz ? `<div class="file-sz">${sz}</div>` : ''}
        </div>
      </a>`;
    }
    if (m.text) content += `<div class="msg-bubble" style="margin-top:4px">${x(m.text)}</div>`;
  } else {
    content = `<div class="msg-bubble">${x(m.text)}</div>`;
  }

  d.innerHTML = `
    ${!m.is_mine ? `<div class="msg-who">${x(m.sender_name)}</div>` : ''}
    ${content}
    <div class="msg-time">${fmtTime(m.created_at)}</div>`;
  list.appendChild(d);
}

// ── Send ──────────────────────────────────────────────────────────────────────
function sendMsg() {
  if (!activeChatId) return;
  const inp = document.getElementById('msg-inp');
  const text = inp.value.trim();
  if (!text && !pendingFile) return;

  const payload = { type: 'send_message', chat_id: activeChatId, text: text || '' };
  if (pendingFile) {
    payload.file_url = pendingFile.url;
    payload.file_name = pendingFile.name;
    payload.file_size = pendingFile.size;
    payload.file_type = pendingFile.type;
    clearFile();
  }
  wsSend(payload);
  inp.value = '';
  inp.style.height = 'auto';
  hide('emoji-picker');
}

function onKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); return; }
  const t = e.target;
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, 120) + 'px';
}

function onType() {
  if (activeChatId) wsSend({ type: 'typing', chat_id: activeChatId });
}

// ── File upload ───────────────────────────────────────────────────────────────
async function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  if (file.size > 50 * 1024 * 1024) { notify('Ошибка', 'Файл слишком большой (макс 50 МБ)'); return; }

  const form = new FormData();
  form.append('file', file);

  try {
    const r = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form,
    });
    if (!r.ok) { notify('Ошибка', 'Не удалось загрузить файл'); return; }
    const data = await r.json();
    pendingFile = data;
    document.getElementById('file-preview-name').textContent = file.name;
    show('file-preview');
  } catch {
    notify('Ошибка', 'Не удалось загрузить файл');
  }
}

function clearFile() {
  pendingFile = null;
  hide('file-preview');
  document.getElementById('file-preview-name').textContent = '';
}

// ── Emoji ─────────────────────────────────────────────────────────────────────
function buildEmojiPicker() {
  const el = document.getElementById('emoji-picker');
  EMOJIS.forEach(em => {
    const b = document.createElement('button');
    b.className = 'ep-btn'; b.textContent = em;
    b.onclick = () => {
      const inp = document.getElementById('msg-inp');
      const pos = inp.selectionStart;
      inp.value = inp.value.slice(0, pos) + em + inp.value.slice(pos);
      inp.focus();
      inp.selectionStart = inp.selectionEnd = pos + em.length;
    };
    el.appendChild(b);
  });
}

function toggleEmoji() {
  const el = document.getElementById('emoji-picker');
  el.classList.toggle('hidden');
}

document.addEventListener('click', e => {
  const ep = document.getElementById('emoji-picker');
  if (!ep || ep.classList.contains('hidden')) return;
  if (!ep.contains(e.target) && !e.target.classList.contains('tool-btn')) {
    ep.classList.add('hidden');
  }
});

// ── Typing ────────────────────────────────────────────────────────────────────
function showTyping() {
  const t = document.getElementById('typing');
  t.classList.remove('hidden'); scrollBottom();
  clearTimeout(typingHideTimer);
  typingHideTimer = setTimeout(hideTyping, 2500);
}
function hideTyping() { document.getElementById('typing')?.classList.add('hidden'); }

// ── Tabs ──────────────────────────────────────────────────────────────────────
function showSide(tab) {
  ['contacts', 'chats'].forEach(t => {
    document.getElementById(`stab-${t}`).classList.toggle('active', t === tab);
    document.getElementById(`panel-${t}`).style.display = t === tab ? 'flex' : 'none';
  });
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openAddModal() {
  show('add-modal');
  setTimeout(() => document.getElementById('modal-q').focus(), 50);
}
function closeModal(e) {
  if (!e || e.target.id === 'add-modal') {
    hide('add-modal');
    document.getElementById('modal-q').value = '';
    document.getElementById('modal-res').innerHTML = '';
  }
}

// ── Notification ──────────────────────────────────────────────────────────────
function notify(title, body) {
  const el = document.getElementById('notif');
  el.innerHTML = `<div class="notif-t">${x(title)}</div><div class="notif-b">${x(body)}</div>`;
  el.classList.remove('hidden');
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('notif').onclick = () => hide('notif');
});

// ── Util ──────────────────────────────────────────────────────────────────────
async function api(url, method = 'GET', body = null) {
  try {
    const opts = { method, headers: { 'Authorization': `Bearer ${token}` } };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return await fetch(url, opts);
  } catch { return null; }
}

function x(s) {
  if (!s && s !== 0) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function scrollBottom() {
  const el = document.getElementById('msgs');
  if (el) el.scrollTop = el.scrollHeight;
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / 1024 / 1024).toFixed(1) + ' МБ';
}

function fileIcon(type) {
  if (!type) return '📄';
  if (type.startsWith('video/')) return '🎬';
  if (type.startsWith('audio/')) return '🎵';
  if (type.includes('pdf')) return '📕';
  if (type.includes('zip') || type.includes('rar') || type.includes('7z')) return '🗜️';
  if (type.includes('word') || type.includes('document')) return '📝';
  if (type.includes('excel') || type.includes('spreadsheet')) return '📊';
  return '📎';
}
