// ── State ─────────────────────────────────────────────────────────────────────
let token = localStorage.getItem('jf_token');
let me = JSON.parse(localStorage.getItem('jf_me') || 'null');
let ws = null;
let activeChatId = null;
let activeChat = null; // full chat object
let friends = [];
let chats = [];
let typingHideTimer = null;
let searchTimer = null;
let notifTimer = null;
let pendingFile = null;

// Voice recording
let mediaRec = null;
let recChunks = [];
let recTimer = null;
let recSeconds = 0;

// WebRTC
let pc = null;           // RTCPeerConnection
let localStream = null;
let callTargetId = null;
let callType = 'voice';  // 'voice' or 'video'
let isCaller = false;
let isMuted = false;

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
  document.getElementById('notif').onclick = () => hide('notif');
  // Enter key on auth fields
  document.getElementById('l-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('r-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
});

function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id) { document.getElementById(id)?.classList.add('hidden'); }
function isMobile() { return window.innerWidth <= 700; }

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

// ── Mobile nav ────────────────────────────────────────────────────────────────
function goBack() {
  if (isMobile()) {
    document.getElementById('sidebar').classList.remove('mob-hidden');
    document.getElementById('chat-area').classList.remove('mob-visible');
  }
}

function openChatMobile() {
  if (isMobile()) {
    document.getElementById('sidebar').classList.add('mob-hidden');
    document.getElementById('chat-area').classList.add('mob-visible');
  }
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
  } catch { errEl.textContent = 'Сервер недоступен'; }
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
  } catch { errEl.textContent = 'Сервер недоступен'; }
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
  switch (msg.type) {
    case 'new_message':
      if (msg.chat_id === activeChatId) { hideTyping(); appendMsg(msg); scrollBottom(); }
      loadChats();
      if (!msg.is_mine) notify(msg.sender_name, msg.text || (msg.file_name ? '📎 ' + msg.file_name : 'Голосовое / Файл'));
      break;
    case 'typing':
      if (msg.chat_id === activeChatId) showTyping();
      break;
    case 'user_status':
      const f = friends.find(x => x.id === msg.user_id);
      if (f) { f.status = msg.status; renderFriends(); }
      if (activeChatId) updateChatStatus(msg.user_id, msg.status);
      loadChats();
      break;
    case 'friend_request':
      loadPending(); notify('Запрос в друзья', 'от ' + msg.from_name);
      break;
    case 'friend_accepted':
      loadFriends(); loadChats(); notify('Jeff', msg.username + ' принял запрос');
      break;
    case 'added_to_group':
      loadChats(); notify(msg.is_channel ? 'Вас добавили в канал' : 'Вас добавили в группу', msg.chat_name);
      break;
    // WebRTC
    case 'call_offer':
      onIncomingCall(msg);
      break;
    case 'call_answer':
      onCallAnswer(msg);
      break;
    case 'call_ice':
      if (pc && msg.candidate) pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
      break;
    case 'call_end':
    case 'call_reject':
      endCall(false);
      break;
  }
}

function wsSend(d) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(d));
}

function updateChatStatus(userId, status) {
  const chat = chats.find(c => c.other_user?.id === userId);
  if (!chat || chat.id !== activeChatId) return;
  const st = document.getElementById('ch-status');
  const online = status === 'online';
  st.textContent = online ? 'В сети' : 'Не в сети';
  st.className = 'ch-status' + (online ? ' online' : '');
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
  if (f.chat_id) d.onclick = () => openChat(f.chat_id);
  return d;
}

async function loadPending() {
  const r = await api('/api/users/pending-requests'); if (!r) return;
  const reqs = await r.json();
  const el = document.getElementById('pending-list');
  el.innerHTML = '';
  if (!reqs.length) return;
  el.insertAdjacentHTML('beforeend', '<div class="sec-label">Запросы в друзья</div>');
  reqs.forEach(req => {
    const d = document.createElement('div');
    d.className = 'pend-item'; d.id = `pr-${req.request_id}`;
    d.innerHTML = `
      <div class="avatar" style="background:${req.avatar_color}">${req.from_name[0].toUpperCase()}</div>
      <div class="c-meta">
        <div class="c-name">${x(req.from_name)}</div>
        <div class="c-sub">ID: ${req.from_id}</div>
      </div>
      <button class="acc-btn" onclick="acceptReq(${req.request_id})">✓ Принять</button>`;
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
  if (!users.length) {
    el.innerHTML = '<div style="padding:10px 14px;color:var(--muted);font-size:13px">Не найдено</div>';
    return;
  }
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
  btn.textContent = (r && r.ok) ? 'Отправлено' : '✓';
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
    const col = c.avatar_color || '#5B8DEF';
    const nm = c.name || 'Чат';
    const sub = c.last_message?.text?.slice(0, 36) || '';
    const t = c.last_message ? fmtTime(c.last_message.created_at) : '';
    const isGroup = c.type !== 'PERSONAL';
    d.innerHTML = `
      <div class="avatar ${isGroup ? 'sq' : ''}" style="background:${col}">${nm[0].toUpperCase()}</div>
      <div class="c-meta">
        <div class="c-name">${x(nm)}${c.is_channel ? '<span class="channel-badge">канал</span>' : (isGroup ? '<span class="group-badge">группа</span>' : '')}</div>
        <div class="c-sub">${x(sub)}</div>
      </div>
      <div class="c-right">
        <div class="c-time">${t}</div>
        ${c.unread_count ? `<div class="badge">${c.unread_count}</div>` : ''}
      </div>`;
    d.onclick = () => openChat(c.id);
    el.appendChild(d);
  });
}

// ── Open Chat ─────────────────────────────────────────────────────────────────
async function openChat(chatId) {
  const chatObj = chats.find(c => c.id === chatId);
  activeChatId = chatId;
  activeChat = chatObj;

  const name = chatObj?.name || 'Чат';
  const color = chatObj?.avatar_color || '#5B8DEF';
  const isGroup = chatObj && chatObj.type !== 'PERSONAL';

  document.getElementById('no-chat').style.display = 'none';
  const cv = document.getElementById('chat-view');
  cv.style.display = 'flex';

  const av = document.getElementById('ch-av');
  av.style.background = color;
  av.textContent = name[0].toUpperCase();
  av.className = 'avatar' + (isGroup ? ' sq' : '');

  document.getElementById('ch-name').textContent = name;

  const st = document.getElementById('ch-status');
  if (isGroup) {
    st.textContent = (chatObj?.member_count || '') + ' участников';
    st.className = 'ch-status';
  } else {
    const status = chatObj?.other_user?.status || 'offline';
    st.textContent = status === 'online' ? 'В сети' : 'Не в сети';
    st.className = 'ch-status' + (status === 'online' ? ' online' : '');
  }

  // Show/hide call buttons (only for personal chats)
  document.getElementById('btn-voice-call').style.display = isGroup ? 'none' : '';
  document.getElementById('btn-video-call').style.display = isGroup ? 'none' : '';
  document.getElementById('btn-members').style.display = isGroup ? '' : 'none';

  document.querySelectorAll('.c-item').forEach(e => e.classList.remove('active'));
  document.getElementById(`ci-${chatId}`)?.classList.add('active');

  // Close members panel
  hide('members-panel');

  wsSend({ type: 'join_chat', chat_id: chatId });
  await loadMessages(chatId);
  loadChats();
  openChatMobile();
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
  const ft = m.file_type || '';

  if (m.file_url) {
    if (ft.startsWith('image/')) {
      content = `<a href="${m.file_url}" target="_blank"><img class="img-msg" src="${m.file_url}" alt="${x(m.file_name)}" loading="lazy"></a>`;
    } else if (ft.startsWith('audio/')) {
      const vid = 'aud-' + m.id;
      content = `<div class="voice-msg">
        <button class="voice-play" onclick="togglePlay('${vid}',this)">▶</button>
        <div class="voice-bar" onclick="seekAudio('${vid}',event,this)">
          <div class="voice-progress" id="vp-${m.id}"></div>
        </div>
        <div class="voice-dur" id="vd-${m.id}">0:00</div>
        <audio id="${vid}" src="${m.file_url}" onended="onAudioEnd('${vid}',this)"
          ontimeupdate="onAudioTime('${vid}',${m.id})"></audio>
      </div>`;
    } else if (ft.startsWith('video/')) {
      content = `<video src="${m.file_url}" controls class="img-msg" style="max-width:280px;background:#000"></video>`;
    } else {
      const sz = m.file_size ? fmtSize(m.file_size) : '';
      content = `<a class="file-msg" href="${m.file_url}" target="_blank" download>
        <div class="file-icon">${fileIcon(ft)}</div>
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

// ── Audio playback ────────────────────────────────────────────────────────────
function togglePlay(vid, btn) {
  const audio = document.getElementById(vid);
  if (!audio) return;
  if (audio.paused) { audio.play(); btn.textContent = '⏸'; }
  else { audio.pause(); btn.textContent = '▶'; }
}

function onAudioEnd(vid, audio) {
  const btn = audio.previousElementSibling?.querySelector('.voice-play');
  if (btn) btn.textContent = '▶';
  const id = vid.replace('aud-', '');
  const bar = document.getElementById(`vp-${id}`);
  if (bar) bar.style.width = '0%';
}

function onAudioTime(vid, msgId) {
  const audio = document.getElementById(vid);
  if (!audio || !audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  const bar = document.getElementById(`vp-${msgId}`);
  if (bar) bar.style.width = pct + '%';
  const dur = document.getElementById(`vd-${msgId}`);
  if (dur) dur.textContent = fmtDur(audio.currentTime);
}

function seekAudio(vid, e, barEl) {
  const audio = document.getElementById(vid);
  if (!audio || !audio.duration) return;
  const rect = barEl.getBoundingClientRect();
  audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
}

function fmtDur(s) {
  const m = Math.floor(s / 60);
  return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
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
  } catch { notify('Ошибка', 'Не удалось загрузить файл'); }
}

function clearFile() {
  pendingFile = null;
  hide('file-preview');
  document.getElementById('file-preview-name').textContent = '';
}

// ── Voice recording ───────────────────────────────────────────────────────────
async function toggleVoiceRec() {
  const btn = document.getElementById('voice-rec-btn');
  if (mediaRec && mediaRec.state === 'recording') {
    mediaRec.stop();
    btn.classList.remove('recording');
    btn.textContent = '🎤';
    clearInterval(recTimer);
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recChunks = [];
    recSeconds = 0;
    mediaRec = new MediaRecorder(stream);
    mediaRec.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
    mediaRec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(recChunks, { type: 'audio/webm' });
      const form = new FormData();
      form.append('file', blob, 'voice.webm');
      try {
        const r = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: form,
        });
        if (!r.ok) { notify('Ошибка', 'Не удалось загрузить голосовое'); return; }
        const data = await r.json();
        if (activeChatId) {
          wsSend({ type: 'send_message', chat_id: activeChatId,
            text: '', file_url: data.url, file_name: data.name,
            file_size: data.size, file_type: 'audio/webm' });
        }
      } catch { notify('Ошибка', 'Не удалось загрузить голосовое'); }
    };
    mediaRec.start();
    btn.classList.add('recording');
    btn.textContent = '⏹';
    recTimer = setInterval(() => {
      recSeconds++;
      btn.title = 'Запись ' + fmtDur(recSeconds);
    }, 1000);
  } catch { notify('Ошибка', 'Нет доступа к микрофону'); }
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
  document.getElementById('emoji-picker').classList.toggle('hidden');
}

document.addEventListener('click', e => {
  const ep = document.getElementById('emoji-picker');
  if (!ep || ep.classList.contains('hidden')) return;
  if (!ep.contains(e.target) && !e.target.closest('.tool-btn')) ep.classList.add('hidden');
});

// ── Typing indicator ──────────────────────────────────────────────────────────
function showTyping() {
  const t = document.getElementById('typing');
  t.classList.remove('hidden'); scrollBottom();
  clearTimeout(typingHideTimer);
  typingHideTimer = setTimeout(hideTyping, 2500);
}
function hideTyping() { document.getElementById('typing')?.classList.add('hidden'); }

// ── Sidebar tabs ──────────────────────────────────────────────────────────────
function showSide(tab) {
  ['contacts', 'chats'].forEach(t => {
    document.getElementById(`stab-${t}`).classList.toggle('active', t === tab);
    document.getElementById(`panel-${t}`).style.display = t === tab ? 'flex' : 'none';
  });
}

// ── Modals ────────────────────────────────────────────────────────────────────
function openAddModal() {
  show('add-modal');
  setTimeout(() => document.getElementById('modal-q').focus(), 50);
}

function openGroupModal() {
  // Populate friends checkboxes
  const list = document.getElementById('gm-friends');
  list.innerHTML = '';
  friends.forEach(f => {
    const row = document.createElement('label');
    row.className = 'check-row';
    row.innerHTML = `
      <input type="checkbox" value="${f.id}">
      <div class="avatar" style="background:${f.avatar_color};width:28px;height:28px;font-size:11px;flex-shrink:0">${f.username[0].toUpperCase()}</div>
      <label style="cursor:pointer">${x(f.username)} <span style="color:var(--muted);font-size:11px">ID:${f.id}</span></label>`;
    list.appendChild(row);
  });
  document.getElementById('gm-name').value = '';
  document.getElementById('gm-desc').value = '';
  document.getElementById('gm-ischannel').checked = false;
  document.getElementById('gm-err').textContent = '';
  show('group-modal');
  setTimeout(() => document.getElementById('gm-name').focus(), 50);
}

function closeModal(e, id) {
  if (e && e.target.id !== id) return;
  closeModalById(id);
}

function closeModalById(id) {
  hide(id);
  if (id === 'add-modal') {
    document.getElementById('modal-q').value = '';
    document.getElementById('modal-res').innerHTML = '';
  }
}

async function doCreateGroup() {
  const name = document.getElementById('gm-name').value.trim();
  const desc = document.getElementById('gm-desc').value.trim();
  const isChannel = document.getElementById('gm-ischannel').checked;
  const errEl = document.getElementById('gm-err');
  errEl.textContent = '';
  if (!name) { errEl.textContent = 'Укажите название'; return; }

  const memberIds = [...document.getElementById('gm-friends').querySelectorAll('input[type=checkbox]:checked')]
    .map(i => parseInt(i.value));

  const r = await api('/api/chats/group', 'POST', { name, description: desc, is_channel: isChannel, member_ids: memberIds });
  if (!r || !r.ok) { errEl.textContent = 'Ошибка создания'; return; }
  const data = await r.json();
  closeModalById('group-modal');
  await loadChats();
  openChat(data.chat_id);
  showSide('chats');
}

// ── Members panel ─────────────────────────────────────────────────────────────
async function toggleMembersPanel() {
  const panel = document.getElementById('members-panel');
  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
    await loadMembers();
  } else {
    panel.classList.add('hidden');
  }
}

async function loadMembers() {
  if (!activeChatId) return;
  const r = await api(`/api/chats/${activeChatId}/members`);
  if (!r || !r.ok) return;
  const members = await r.json();
  const list = document.getElementById('mp-list');
  list.innerHTML = '';
  members.forEach(m => {
    const d = document.createElement('div');
    d.className = 'mp-item';
    d.innerHTML = `
      <div class="avatar" style="background:${m.avatar_color};width:28px;height:28px;font-size:11px">${m.username[0].toUpperCase()}</div>
      <div class="mp-name">${x(m.username)}</div>
      <div class="mp-role">${roleLabel(m.role)}</div>`;
    list.appendChild(d);
  });
}

function roleLabel(r) {
  if (r === 'owner') return '👑';
  if (r === 'admin') return '⭐';
  return '';
}

// ── Notification ──────────────────────────────────────────────────────────────
function notify(title, body) {
  const el = document.getElementById('notif');
  el.innerHTML = `<div class="notif-t">${x(title)}</div><div class="notif-b">${x(body)}</div>`;
  el.classList.remove('hidden');
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

// ── WebRTC Calls ──────────────────────────────────────────────────────────────
const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

async function startCall(type) {
  if (!activeChatId || !activeChat?.other_user) return;
  callTargetId = activeChat.other_user.id;
  callType = type;
  isCaller = true;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video',
    });
  } catch { notify('Ошибка', 'Нет доступа к камере/микрофону'); return; }

  pc = new RTCPeerConnection(ICE_SERVERS);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  if (type === 'video') {
    document.getElementById('local-video').srcObject = localStream;
  }

  pc.ontrack = e => {
    document.getElementById('remote-video').srcObject = e.streams[0];
  };

  pc.onicecandidate = e => {
    if (e.candidate) wsSend({ type: 'call_ice', to_user_id: callTargetId, candidate: e.candidate });
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  wsSend({
    type: 'call_offer', to_user_id: callTargetId,
    from_name: me.username, sdp: offer, call_type: type,
  });

  showCallUI('calling', activeChat.other_user, type);
}

function onIncomingCall(msg) {
  callTargetId = msg.from_user_id;
  callType = msg.call_type || 'voice';
  isCaller = false;

  const caller = { username: msg.from_name, avatar_color: '#5B8DEF' };
  showCallUI('incoming', caller, callType, msg.sdp);
}

async function acceptCall(remoteSdp) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video',
    });
  } catch { notify('Ошибка', 'Нет доступа к камере/микрофону'); endCall(true); return; }

  pc = new RTCPeerConnection(ICE_SERVERS);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  if (callType === 'video') {
    document.getElementById('local-video').srcObject = localStream;
    document.getElementById('call-video-wrap').style.display = '';
  }

  pc.ontrack = e => {
    document.getElementById('remote-video').srcObject = e.streams[0];
  };

  pc.onicecandidate = e => {
    if (e.candidate) wsSend({ type: 'call_ice', to_user_id: callTargetId, candidate: e.candidate });
  };

  await pc.setRemoteDescription(new RTCSessionDescription(remoteSdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  wsSend({ type: 'call_answer', to_user_id: callTargetId, sdp: answer });

  document.getElementById('call-status').textContent = callType === 'video' ? '📹 Видеозвонок' : '📞 Голосовой звонок';
  renderActiveCallActions();
}

async function onCallAnswer(msg) {
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
  if (callType === 'video') {
    document.getElementById('call-video-wrap').style.display = '';
  }
  document.getElementById('call-status').textContent = callType === 'video' ? '📹 Видеозвонок' : '📞 Голосовой звонок';
  renderActiveCallActions();
}

function endCall(notify_remote = true) {
  if (notify_remote && callTargetId) {
    wsSend({ type: 'call_end', to_user_id: callTargetId });
  }
  if (pc) { pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  document.getElementById('remote-video').srcObject = null;
  document.getElementById('local-video').srcObject = null;
  document.getElementById('call-video-wrap').style.display = 'none';
  hide('call-overlay');
  callTargetId = null;
}

function rejectCall() {
  if (callTargetId) wsSend({ type: 'call_reject', to_user_id: callTargetId });
  hide('call-overlay');
  callTargetId = null;
}

function toggleMute() {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  renderActiveCallActions();
}

function showCallUI(state, user, type, remoteSdp) {
  const overlay = document.getElementById('call-overlay');
  overlay.classList.remove('hidden');

  const av = document.getElementById('call-av');
  av.style.background = user.avatar_color || '#5B8DEF';
  av.textContent = (user.username || '?')[0].toUpperCase();

  document.getElementById('call-name').textContent = user.username || '';
  document.getElementById('call-status').textContent =
    state === 'calling' ? 'Вызов...' : 'Входящий ' + (type === 'video' ? 'видеозвонок' : 'звонок') + '...';

  const actions = document.getElementById('call-actions');
  if (state === 'incoming') {
    actions.innerHTML = `
      <button class="call-btn accept" onclick="acceptCall(${JSON.stringify(remoteSdp).replace(/"/g,'&quot;')})">📞</button>
      <button class="call-btn end" onclick="rejectCall()">📵</button>`;
    // Parse remoteSdp properly
    actions.querySelector('.call-btn.accept').onclick = () => acceptCall(remoteSdp);
  } else {
    renderActiveCallActions();
  }
}

function renderActiveCallActions() {
  const actions = document.getElementById('call-actions');
  actions.innerHTML = `
    <button class="call-btn mute" onclick="toggleMute()">${isMuted ? '🔇' : '🎤'}</button>
    <button class="call-btn end" onclick="endCall(true)">📵</button>`;
}

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
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / 1048576).toFixed(1) + ' МБ';
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
