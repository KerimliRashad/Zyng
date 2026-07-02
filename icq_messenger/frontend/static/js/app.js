// ── State ─────────────────────────────────────────────────────────────────────
let token = localStorage.getItem('jf_token');
let me = JSON.parse(localStorage.getItem('jf_me') || 'null');
let ws = null;
let activeChatId = null;
let activeChat = null;
let friends = [];
let chats = [];
let typingTimer = null;
let searchTimer = null;
let notifTimer = null;
let pendingFile = null;

// Voice rec
let mediaRec = null;
let recChunks = [];
let recTimer = null;
let recSecs = 0;

// WebRTC — store incoming SDP in a variable (not in DOM)
let pc = null;
let localStream = null;
let callTargetId = null;
let callType = 'voice';
let isCaller = false;
let isMuted = false;
let incomingSdp = null;  // ← critical fix: store SDP here, not in onclick attr

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
  document.getElementById('notif').onclick = () => hide('notif');
  document.getElementById('l-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('r-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });

  if (token && me) {
    showApp();
  } else {
    show('auth-screen');
  }
});

function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id) { document.getElementById(id)?.classList.add('hidden'); }
function isMobile() { return window.innerWidth <= 680; }

// ── Push Notifications & Sound ────────────────────────────────────────────────
let notifAudioCtx = null;

function requestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function pushNotify(title, body) {
  // Browser push notification
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try {
      const n = new Notification(title, { body, icon: '/favicon.ico', badge: '/favicon.ico' });
      setTimeout(() => n.close(), 5000);
      n.onclick = () => { window.focus(); n.close(); };
    } catch {}
  }
  // Notification sound (short beep)
  playNotifSound();
}

function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.setValueAtTime(1200, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    o.start(); o.stop(ctx.currentTime + 0.15);
    setTimeout(() => ctx.close(), 300);
  } catch {}
}

// ── App init ──────────────────────────────────────────────────────────────────
function showApp() {
  hide('auth-screen');
  show('app-screen');
  renderMe();
  connectWS();
  loadFriends();
  loadChats();
  loadPending();
  requestNotifPermission();
}

function doLogout() {
  token = null; me = null;
  localStorage.removeItem('jf_token');
  localStorage.removeItem('jf_me');
  if (ws) { ws.onclose = null; ws.close(); }
  location.reload();
}

// ── Mobile navigation ─────────────────────────────────────────────────────────
function goBack() {
  if (isMobile()) {
    document.getElementById('sidebar').classList.remove('mob-hidden');
    document.getElementById('chat-area').classList.remove('mob-visible');
  }
}

function showChatOnMobile() {
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
  if (me.avatar_url) {
    av.style.backgroundImage = `url(${me.avatar_url})`;
    av.style.backgroundSize = 'cover';
    av.textContent = '';
  } else {
    av.style.backgroundImage = '';
    av.textContent = me.username[0].toUpperCase();
  }
  document.getElementById('me-name').innerHTML = x(me.username) +
    (me.is_verified ? ' <span class="verified" title="Верифицирован">✓</span>' : '');
  document.getElementById('me-id').textContent = 'ID: ' + me.id + (me.is_admin ? ' 👑' : '');
  if (me.is_admin) document.getElementById('admin-btn').style.display = '';
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
      if (!msg.is_mine) {
        const preview = msg.file_type?.startsWith('audio/') ? '🎤 Голосовое' :
                        msg.file_name ? '📎 ' + msg.file_name : (msg.text || 'Сообщение');
        notify(msg.sender_name, preview, true);
      }
      break;
    case 'typing':
      if (msg.chat_id === activeChatId) showTyping();
      break;
    case 'user_status':
      const f = friends.find(u => u.id === msg.user_id);
      if (f) { f.status = msg.status; renderFriends(); }
      if (activeChat?.other_user?.id === msg.user_id) updateStatusBar(msg.status);
      loadChats();
      break;
    case 'friend_request':
      loadPending(); notify('Запрос в друзья', 'от ' + msg.from_name, true);
      break;
    case 'friend_accepted':
      loadFriends(); loadChats(); notify('Jeff', msg.username + ' принял запрос');
      break;
    case 'added_to_group':
      loadChats();
      notify(msg.is_channel ? 'Вас добавили в канал' : 'Вас добавили в группу', msg.chat_name);
      break;
    case 'system_message':
      if (activeChatId) {
        const d = document.createElement('div');
        d.className = 'msg system';
        d.innerHTML = `<div class="msg-bubble" style="background:rgba(255,255,255,.06);color:var(--muted);font-size:12px;white-space:pre-wrap;font-family:monospace">${x(msg.text)}</div>`;
        document.getElementById('msg-list').appendChild(d);
        scrollBottom();
      }
      break;
    case 'account_update':
      if (msg.is_verified !== undefined) {
        me.is_verified = msg.is_verified;
        localStorage.setItem('jf_me', JSON.stringify(me));
        renderMe();
        notify('Jeff', msg.is_verified ? '✅ Ваш аккаунт верифицирован!' : 'Верификация снята');
      }
      break;
    case 'banned':
      notify('Аккаунт заблокирован', 'Обратитесь к администратору');
      setTimeout(doLogout, 2000);
      break;
    case 'chat_verified': {
      const c = chats.find(ch => ch.id === msg.chat_id);
      if (c) { c.is_verified = msg.is_verified; renderChats(); }
      if (activeChatId === msg.chat_id) {
        const badge = msg.is_verified ? ' <span class="verified">✓</span>' : '';
        const nm = document.getElementById('ch-name');
        if (nm) nm.innerHTML = nm.innerHTML.replace(/<span class="verified">.*?<\/span>/g, '') + badge;
      }
      notify(msg.is_verified ? '✅ Верифицировано' : 'Верификация снята',
             chats.find(c => c.id === msg.chat_id)?.name || 'Чат');
      break;
    }
    case 'call_offer':
      incomingSdp = msg.sdp;
      callTargetId = msg.from_user_id;
      callType = msg.call_type || 'voice';
      isCaller = false;
      showIncomingCall(msg.from_name, msg.call_type || 'voice', msg.from_color);
      break;
    case 'call_answer':
      if (pc) pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)).catch(console.error);
      document.getElementById('call-status').textContent = callType === 'video' ? '📹 Видеозвонок' : '📞 Разговор';
      renderCallActions(true);
      if (callType === 'video') document.getElementById('call-video-wrap').style.display = '';
      break;
    case 'call_ice':
      if (pc && msg.candidate) pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
      break;
    case 'call_end':
    case 'call_reject':
      endCallClean();
      break;
  }
}

function wsSend(d) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(d));
}

function updateStatusBar(status) {
  const el = document.getElementById('ch-status');
  el.textContent = status === 'online' ? 'В сети' : 'Не в сети';
  el.className = 'ch-status' + (status === 'online' ? ' online' : '');
}

// ── Friends ───────────────────────────────────────────────────────────────────
async function loadFriends() {
  const r = await api('/api/users/friends'); if (!r) return;
  friends = await r.json(); renderFriends();
}

function renderFriends() {
  const el = document.getElementById('friends-list');
  el.innerHTML = '';
  if (!friends.length) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">Добавьте друзей ✏️</div>';
    return;
  }
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
    <div style="position:relative">
      <div class="avatar" style="background:${f.avatar_color}">${f.username[0].toUpperCase()}</div>
      <div class="dot ${f.status}" style="position:absolute;bottom:0;right:0;border:2px solid var(--sb)"></div>
    </div>
    <div class="c-meta">
      <div class="c-name">${x(f.username)}</div>
      <div class="c-sub">ID: ${f.id}</div>
    </div>`;
  if (f.chat_id) d.onclick = () => openChat(f.chat_id);
  return d;
}

async function loadPending() {
  const r = await api('/api/users/pending-requests'); if (!r) return;
  const reqs = await r.json();
  const el = document.getElementById('pending-list');
  el.innerHTML = '';
  if (!reqs.length) return;
  el.insertAdjacentHTML('beforeend', '<div class="sec-label" style="color:var(--warn,#fbbf24)">Запросы в друзья</div>');
  reqs.forEach(req => {
    const d = document.createElement('div');
    d.className = 'pend-item'; d.id = `pr-${req.request_id}`;
    d.innerHTML = `
      <div class="avatar sm" style="background:${req.avatar_color}">${req.from_name[0].toUpperCase()}</div>
      <div class="c-meta">
        <div class="c-name" style="font-size:13px">${x(req.from_name)}</div>
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
  const sr = document.getElementById('search-res');
  if (!q) { sr.innerHTML = ''; return; }
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
    el.innerHTML = '<div style="padding:12px 14px;color:var(--muted);font-size:13px">Не найдено</div>';
    return;
  }
  const myIds = new Set(friends.map(f => f.id));
  users.forEach(u => {
    const d = document.createElement('div'); d.className = 's-item';
    const has = myIds.has(u.id);
    d.innerHTML = `
      <div class="avatar sm" style="background:${u.avatar_color}">${u.username[0].toUpperCase()}</div>
      <div class="c-meta">
        <div class="c-name" style="font-size:13px">${x(u.username)}${u.is_verified ? ' <span class="verified" title="Верифицирован">✓</span>' : ''}</div>
        <div class="c-sub">ID: ${u.id} · ${u.status === 'online' ? '<span style="color:var(--online)">В сети</span>' : 'Не в сети'}</div>
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
  if (!chats.length) {
    el.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">Нет чатов</div>';
    return;
  }
  chats.forEach(c => {
    const d = document.createElement('div');
    d.className = 'c-item' + (c.id === activeChatId ? ' active' : '');
    d.id = `ci-${c.id}`;
    const isGroup = c.type !== 'PERSONAL';
    const col = c.avatar_color || '#5288c1';
    const nm = c.name || 'Чат';
    const sub = c.last_message?.text?.slice(0, 40) || '';
    const t = c.last_message ? fmtTime(c.last_message.created_at) : '';
    const avUrl = c.avatar_url || c.other_user?.avatar_url;
    const avStyle = avUrl
      ? `background:${col};background-image:url(${avUrl});background-size:cover`
      : `background:${col}`;
    d.innerHTML = `
      <div class="avatar ${isGroup ? 'sq' : ''}" style="${avStyle}">${avUrl ? '' : nm[0].toUpperCase()}</div>
      <div class="c-meta">
        <div class="c-name">${x(nm)}${c.is_verified ? '<span class="verified" title="Верифицировано">✓</span>' : ''}${c.is_channel ? '<span class="channel-badge">канал</span>' : (isGroup ? '<span class="group-badge">группа</span>' : '')}</div>
        <div class="c-sub">${x(sub) || '&nbsp;'}</div>
      </div>
      <div class="c-right">
        <span class="c-time">${t}</span>
        ${c.unread_count ? `<span class="badge">${c.unread_count}</span>` : ''}
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

  const isGroup = chatObj && chatObj.type !== 'PERSONAL';
  const nm = chatObj?.name || 'Чат';
  const col = chatObj?.avatar_color || '#5288c1';

  // Hide no-chat, show chat-view
  document.getElementById('no-chat').style.display = 'none';
  const cv = document.getElementById('chat-view');
  cv.style.display = 'flex';

  // Avatar
  const av = document.getElementById('ch-av');
  const chatAvUrl = chatObj?.avatar_url || chatObj?.other_user?.avatar_url;
  av.style.background = col;
  if (chatAvUrl) {
    av.style.backgroundImage = `url(${chatAvUrl})`;
    av.style.backgroundSize = 'cover';
    av.textContent = '';
  } else {
    av.style.backgroundImage = '';
    av.textContent = nm[0].toUpperCase();
  }
  av.className = 'avatar' + (isGroup ? ' sq' : '');

  // Name & badges
  const nameEl = document.getElementById('ch-name');
  nameEl.innerHTML = x(nm) +
    (chatObj?.is_channel ? ' <span class="channel-badge">канал</span>' :
     isGroup ? ' <span class="group-badge">группа</span>' : '');

  // Status
  const st = document.getElementById('ch-status');
  if (isGroup) {
    st.textContent = (chatObj?.member_count || '') + ' участников';
    st.className = 'ch-status';
  } else {
    const status = chatObj?.other_user?.status || 'offline';
    updateStatusBar(status);
  }

  // Show/hide action buttons
  document.getElementById('btn-voice-call').style.display = (!isGroup) ? '' : 'none';
  document.getElementById('btn-video-call').style.display = (!isGroup) ? '' : 'none';
  document.getElementById('btn-members').style.display = isGroup ? '' : 'none';

  // Close members panel
  hide('members-panel');

  // Mark active in list
  document.querySelectorAll('.c-item').forEach(e => e.classList.remove('active'));
  document.getElementById(`ci-${chatId}`)?.classList.add('active');

  wsSend({ type: 'join_chat', chat_id: chatId });
  await loadMessages(chatId);
  loadChats();
  showChatOnMobile();
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

  const ft = m.file_type || '';
  let content = '';

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
        <span class="voice-dur" id="vd-${m.id}">0:00</span>
        <audio id="${vid}" src="${m.file_url}"
          onended="audioEnd('${vid}',${m.id})"
          ontimeupdate="audioTime('${vid}',${m.id})"></audio>
      </div>`;
    } else if (ft.startsWith('video/')) {
      content = `<video src="${m.file_url}" controls class="img-msg" style="max-width:280px;background:#000;border-radius:14px"></video>`;
    } else {
      const sz = m.file_size ? fmtSize(m.file_size) : '';
      content = `<a class="file-msg" href="${m.file_url}" target="_blank" download>
        <div class="file-icon">${fileIcon(ft)}</div>
        <div><div class="file-nm">${x(m.file_name || 'Файл')}</div>${sz ? `<div class="file-sz">${sz}</div>` : ''}</div>
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

// ── Audio helpers ─────────────────────────────────────────────────────────────
function togglePlay(vid, btn) {
  const a = document.getElementById(vid); if (!a) return;
  if (a.paused) { a.play(); btn.textContent = '⏸'; }
  else { a.pause(); btn.textContent = '▶'; }
}
function audioEnd(vid, id) {
  const btn = document.getElementById(vid)?.parentElement?.querySelector('.voice-play');
  if (btn) btn.textContent = '▶';
  const bar = document.getElementById(`vp-${id}`);
  if (bar) bar.style.width = '0%';
}
function audioTime(vid, id) {
  const a = document.getElementById(vid); if (!a || !a.duration) return;
  const bar = document.getElementById(`vp-${id}`);
  if (bar) bar.style.width = (a.currentTime / a.duration * 100) + '%';
  const dur = document.getElementById(`vd-${id}`);
  if (dur) dur.textContent = fmtDur(a.currentTime);
}
function seekAudio(vid, e, barEl) {
  const a = document.getElementById(vid); if (!a || !a.duration) return;
  const rect = barEl.getBoundingClientRect();
  a.currentTime = ((e.clientX - rect.left) / rect.width) * a.duration;
}
function fmtDur(s) { return Math.floor(s/60) + ':' + String(Math.floor(s%60)).padStart(2,'0'); }

// ── Send ──────────────────────────────────────────────────────────────────────
function sendMsg() {
  if (!activeChatId) return;
  const inp = document.getElementById('msg-inp');
  const text = inp.value.trim();
  if (!text && !pendingFile) return;

  const payload = { type: 'send_message', chat_id: activeChatId, text: text || '' };
  if (pendingFile) {
    Object.assign(payload, { file_url: pendingFile.url, file_name: pendingFile.name,
      file_size: pendingFile.size, file_type: pendingFile.type });
    clearFile();
  }
  wsSend(payload);
  inp.value = ''; inp.style.height = 'auto';
  hide('emoji-picker');
}

function onKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); return; }
  const t = e.target;
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, 130) + 'px';
}
function onType() { if (activeChatId) wsSend({ type: 'typing', chat_id: activeChatId }); }

// ── File upload ───────────────────────────────────────────────────────────────
async function handleFile(e) {
  const file = e.target.files[0]; if (!file) return;
  e.target.value = '';
  if (file.size > 50 * 1024 * 1024) { notify('Ошибка', 'Файл слишком большой (макс 50 МБ)'); return; }
  const form = new FormData(); form.append('file', file);
  try {
    const r = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form });
    if (!r.ok) { notify('Ошибка', 'Не удалось загрузить файл'); return; }
    pendingFile = await r.json();
    document.getElementById('file-preview-name').textContent = file.name;
    show('file-preview');
  } catch { notify('Ошибка', 'Не удалось загрузить файл'); }
}
function clearFile() { pendingFile = null; hide('file-preview'); document.getElementById('file-preview-name').textContent = ''; }

// ── Voice recording ───────────────────────────────────────────────────────────
async function toggleVoiceRec() {
  const btn = document.getElementById('voice-rec-btn');
  const ind = document.getElementById('rec-indicator');
  if (mediaRec && mediaRec.state === 'recording') {
    mediaRec.stop();
    btn.classList.remove('recording'); btn.textContent = '🎤';
    ind.classList.add('hidden');
    clearInterval(recTimer); return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recChunks = []; recSecs = 0;
    mediaRec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
    mediaRec.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
    mediaRec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      ind.classList.add('hidden');
      const blob = new Blob(recChunks, { type: mediaRec.mimeType || 'audio/webm' });
      const form = new FormData(); form.append('file', blob, 'voice.webm');
      try {
        const r = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form });
        if (!r.ok) { notify('Ошибка', 'Не удалось сохранить'); return; }
        const data = await r.json();
        if (activeChatId) wsSend({ type: 'send_message', chat_id: activeChatId,
          text: '', file_url: data.url, file_name: data.name, file_size: data.size, file_type: 'audio/webm' });
      } catch { notify('Ошибка', 'Загрузка не удалась'); }
    };
    mediaRec.start(200);
    btn.classList.add('recording'); btn.textContent = '⏹';
    ind.classList.remove('hidden');
    document.getElementById('rec-timer').textContent = '0:00';
    recTimer = setInterval(() => {
      recSecs++;
      document.getElementById('rec-timer').textContent = fmtDur(recSecs);
    }, 1000);
  } catch (e) { notify('🎤 Нет доступа', getMicError(e, 'voice')); }
}

// ── Emoji ─────────────────────────────────────────────────────────────────────
function buildEmojiPicker() {
  const el = document.getElementById('emoji-picker');
  EMOJIS.forEach(em => {
    const b = document.createElement('button'); b.className = 'ep-btn'; b.textContent = em;
    b.onclick = () => {
      const inp = document.getElementById('msg-inp');
      const pos = inp.selectionStart;
      inp.value = inp.value.slice(0, pos) + em + inp.value.slice(pos);
      inp.focus(); inp.selectionStart = inp.selectionEnd = pos + em.length;
    };
    el.appendChild(b);
  });
}
function toggleEmoji() { document.getElementById('emoji-picker').classList.toggle('hidden'); }
document.addEventListener('click', e => {
  const ep = document.getElementById('emoji-picker');
  if (!ep || ep.classList.contains('hidden')) return;
  if (!ep.contains(e.target) && !e.target.closest('.tool-btn')) ep.classList.add('hidden');
});

// ── Typing ────────────────────────────────────────────────────────────────────
function showTyping() {
  const t = document.getElementById('typing');
  t.classList.remove('hidden'); scrollBottom();
  clearTimeout(typingTimer);
  typingTimer = setTimeout(hideTyping, 2500);
}
function hideTyping() { document.getElementById('typing')?.classList.add('hidden'); }

// ── Sidebar tabs ──────────────────────────────────────────────────────────────
function showSide(tab) {
  ['contacts','chats'].forEach(t => {
    document.getElementById(`stab-${t}`).classList.toggle('active', t === tab);
    document.getElementById(`panel-${t}`).style.display = t === tab ? 'flex' : 'none';
  });
}

// ── Modals ────────────────────────────────────────────────────────────────────
function openAddModal() { show('add-modal'); setTimeout(() => document.getElementById('modal-q').focus(), 60); }
function onOverlayClick(e, id) { if (e.target.id === id) closeModalById(id); }
function closeModalById(id) {
  hide(id);
  if (id === 'add-modal') { document.getElementById('modal-q').value = ''; document.getElementById('modal-res').innerHTML = ''; }
}
function openGroupModal() {
  const list = document.getElementById('gm-friends');
  list.innerHTML = '';
  friends.forEach(f => {
    const row = document.createElement('label'); row.className = 'check-row';
    row.innerHTML = `
      <input type="checkbox" value="${f.id}">
      <div class="avatar sm" style="background:${f.avatar_color}">${f.username[0].toUpperCase()}</div>
      <span style="font-size:13px">${x(f.username)} <span style="color:var(--muted)">ID:${f.id}</span></span>`;
    list.appendChild(row);
  });
  document.getElementById('gm-name').value = '';
  document.getElementById('gm-desc').value = '';
  document.getElementById('gm-ischannel').checked = false;
  document.getElementById('gm-err').textContent = '';
  show('group-modal');
  setTimeout(() => document.getElementById('gm-name').focus(), 60);
}
async function doCreateGroup() {
  const name = document.getElementById('gm-name').value.trim();
  const desc = document.getElementById('gm-desc').value.trim();
  const isChannel = document.getElementById('gm-ischannel').checked;
  const errEl = document.getElementById('gm-err');
  errEl.textContent = '';
  if (!name) { errEl.textContent = 'Укажите название'; return; }
  const memberIds = [...document.getElementById('gm-friends').querySelectorAll('input:checked')].map(i => +i.value);
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
  const p = document.getElementById('members-panel');
  if (p.classList.contains('hidden')) { p.classList.remove('hidden'); await loadMembers(); }
  else p.classList.add('hidden');
}
async function loadMembers() {
  if (!activeChatId) return;
  const r = await api(`/api/chats/${activeChatId}/members`); if (!r || !r.ok) return;
  const mems = await r.json();
  const list = document.getElementById('mp-list'); list.innerHTML = '';
  mems.forEach(m => {
    const d = document.createElement('div'); d.className = 'mp-item';
    d.style.cursor = 'pointer';
    d.innerHTML = `
      <div class="avatar sm" style="background:${m.avatar_color}">${m.username[0].toUpperCase()}</div>
      <div class="mp-name">${x(m.username)}${m.is_verified ? ' <span class="verified">✓</span>' : ''}</div>
      <div class="mp-role">${m.role === 'owner' ? '👑' : m.role === 'admin' ? '⭐' : ''}</div>`;
    d.onclick = () => openUserProfile(m.id);
    list.appendChild(d);
  });
}

// ── Notification ──────────────────────────────────────────────────────────────
function notify(title, body, push = false) {
  const el = document.getElementById('notif');
  el.innerHTML = `<div class="notif-t">${x(title)}</div><div class="notif-b">${x(body)}</div>`;
  el.classList.remove('hidden');
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => el.classList.add('hidden'), 4000);
  if (push) pushNotify(title, body);
}

// ── Avatar upload helpers ─────────────────────────────────────────────────────
async function uploadProfileAvatar(e) {
  const file = e.target.files[0]; if (!file) return;
  e.target.value = '';
  const form = new FormData(); form.append('file', file);
  try {
    const r = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form });
    if (!r.ok) { notify('Ошибка', 'Не удалось загрузить фото'); return; }
    const data = await r.json();
    // save avatar_url immediately
    const r2 = await api('/api/users/me', 'PUT', { avatar_url: data.url });
    if (!r2 || !r2.ok) { notify('Ошибка', 'Не удалось сохранить фото'); return; }
    me.avatar_url = data.url;
    localStorage.setItem('jf_me', JSON.stringify(me));
    // show in modal avatar
    const av = document.getElementById('prof-av');
    av.style.background = 'transparent';
    av.style.backgroundImage = `url(${data.url})`;
    av.style.backgroundSize = 'cover';
    av.textContent = '';
    notify('Профиль', 'Фото обновлено ✓');
  } catch { notify('Ошибка', 'Загрузка не удалась'); }
}

async function uploadGroupAvatar(e) {
  const file = e.target.files[0]; if (!file) return;
  e.target.value = '';
  const form = new FormData(); form.append('file', file);
  try {
    const r = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form });
    if (!r.ok) { notify('Ошибка', 'Не удалось загрузить фото'); return; }
    const data = await r.json();
    // save to group settings immediately
    const r2 = await api(`/api/chats/${activeChatId}/settings`, 'PUT', { avatar_url: data.url });
    if (!r2 || !r2.ok) { notify('Ошибка', 'Не удалось сохранить фото'); return; }
    // update preview
    const av = document.getElementById('gs-avatar');
    av.style.background = 'transparent';
    av.style.backgroundImage = `url(${data.url})`;
    av.style.backgroundSize = 'cover';
    av.textContent = '';
    notify('Группа', 'Фото обновлено ✓');
    await loadChats();
  } catch { notify('Ошибка', 'Загрузка не удалась'); }
}

// ══════════════════ WEBRTC CALLS ══════════════════════════════════════════════
const ICE = { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.services.mozilla.com' },
  // Free TURN relay (openrelay.metered.ca)
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
] };

// Ringtone (generated via Web Audio)
let ringCtx = null, ringNode = null;
function startRing() {
  try {
    ringCtx = new (window.AudioContext || window.webkitAudioContext)();
    function beep() {
      if (!ringCtx) return;
      const o = ringCtx.createOscillator();
      const g = ringCtx.createGain();
      o.connect(g); g.connect(ringCtx.destination);
      o.frequency.setValueAtTime(880, ringCtx.currentTime);
      o.frequency.setValueAtTime(1100, ringCtx.currentTime + 0.2);
      g.gain.setValueAtTime(0.3, ringCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ringCtx.currentTime + 0.5);
      o.start(); o.stop(ringCtx.currentTime + 0.5);
    }
    beep();
    ringNode = setInterval(beep, 1200);
    if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
  } catch {}
}
function stopRing() {
  clearInterval(ringNode); ringNode = null;
  if (ringCtx) { try { ringCtx.close(); } catch {} ringCtx = null; }
  if (navigator.vibrate) navigator.vibrate(0);
}

function getMicError(e, type) {
  const dev = type === 'video' ? 'камере/микрофону' : 'микрофону';
  if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError')
    return `Доступ к ${dev} запрещён. Нажми на 🔒 в адресной строке → разреши микрофон/камеру → перезагрузи страницу.`;
  if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError')
    return `${type === 'video' ? 'Камера или микрофон' : 'Микрофон'} не найден. Подключи устройство и повтори.`;
  if (e?.name === 'NotSupportedError')
    return 'Нужен HTTPS. Убедись что открываешь через https://';
  return `Нет доступа к ${dev}. Разреши использование в настройках браузера.`;
}

async function startCall(type) {
  if (!activeChatId || !activeChat?.other_user) return;
  callTargetId = activeChat.other_user.id;
  callType = type; isCaller = true; isMuted = false;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
  } catch (e) {
    notify('🎤 Нет доступа', getMicError(e, type));
    return;
  }

  pc = newPC();
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  if (type === 'video') {
    document.getElementById('local-video').srcObject = localStream;
  }

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  wsSend({ type: 'call_offer', to_user_id: callTargetId, from_name: me.username, sdp: offer, call_type: type });

  showCallUI(activeChat.other_user.username, activeChat.other_user.avatar_color, '📞 Вызов...', false);
}

function showIncomingCall(fromName, type, fromColor) {
  stopRing(); startRing();
  showCallUI(fromName, fromColor || '#5288c1',
    type === 'video' ? '📹 Входящий видеозвонок' : '📞 Входящий звонок', true);
  // Push notification
  pushNotify(type === 'video' ? '📹 Видеозвонок' : '📞 Входящий звонок', 'от ' + fromName);
}

function showCallUI(name, color, status, incoming) {
  const av = document.getElementById('call-av');
  av.style.background = color || '#5288c1';
  av.textContent = (name || '?')[0].toUpperCase();
  av.className = 'call-avatar' + (incoming ? '' : ' active');
  document.getElementById('call-name').textContent = name || '';
  document.getElementById('call-status').textContent = status;
  document.getElementById('call-video-wrap').style.display = 'none';
  document.getElementById('call-audio-ui').style.display = 'flex';
  renderCallActions(!incoming && !isCaller, incoming);
  document.getElementById('call-overlay').classList.remove('hidden');
}

function renderCallActions(active = false, incoming = false) {
  const el = document.getElementById('call-actions');
  if (incoming) {
    el.innerHTML = `
      <div style="text-align:center">
        <button class="call-btn accept" onclick="acceptIncomingCall()" title="Принять">📞</button>
        <div style="font-size:11px;color:var(--online);margin-top:6px">Принять</div>
      </div>
      <div style="text-align:center">
        <button class="call-btn end" onclick="rejectCall()" title="Отклонить">📵</button>
        <div style="font-size:11px;color:var(--danger);margin-top:6px">Отклонить</div>
      </div>`;
  } else if (active) {
    el.innerHTML = `
      <div style="text-align:center">
        <button class="call-btn mute" id="mute-btn" onclick="toggleMute()" title="Микрофон">${isMuted ? '🔇' : '🎤'}</button>
        <div style="font-size:11px;color:var(--muted);margin-top:6px">${isMuted ? 'Включить' : 'Выкл'}</div>
      </div>
      ${callType === 'video' ? `
      <div style="text-align:center">
        <button class="call-btn cam" id="cam-btn" onclick="toggleCam()" title="Камера">📷</button>
        <div style="font-size:11px;color:var(--muted);margin-top:6px">Камера</div>
      </div>` : ''}
      <div style="text-align:center">
        <button class="call-btn end" onclick="endCall()" title="Завершить">📵</button>
        <div style="font-size:11px;color:var(--danger);margin-top:6px">Завершить</div>
      </div>`;
  } else {
    el.innerHTML = `
      <div style="text-align:center">
        <button class="call-btn end" onclick="endCall()" title="Отменить">📵</button>
        <div style="font-size:11px;color:var(--danger);margin-top:6px">Отменить</div>
      </div>`;
  }
}

async function acceptIncomingCall() {
  if (!incomingSdp) return;
  stopRing();
  isMuted = false;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' });
  } catch (e) {
    notify('🎤 Нет доступа', getMicError(e, callType));
    endCallClean(); return;
  }

  pc = newPC();
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  if (callType === 'video') {
    document.getElementById('local-video').srcObject = localStream;
    document.getElementById('call-video-wrap').style.display = '';
    document.getElementById('call-audio-ui').style.display = 'none';
  }

  await pc.setRemoteDescription(new RTCSessionDescription(incomingSdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  wsSend({ type: 'call_answer', to_user_id: callTargetId, sdp: answer });

  document.getElementById('call-av').classList.add('active');
  document.getElementById('call-status').textContent = callType === 'video' ? '📹 Видеозвонок' : '📞 Разговор';
  renderCallActions(true, false);
  incomingSdp = null;
}

function newPC() {
  const p = new RTCPeerConnection(ICE);
  p.ontrack = e => {
    if (callType === 'video') {
      document.getElementById('remote-video').srcObject = e.streams[0];
    } else {
      // Voice call: route to audio element
      document.getElementById('remote-audio').srcObject = e.streams[0];
    }
  };
  p.onicecandidate = e => {
    if (e.candidate && callTargetId)
      wsSend({ type: 'call_ice', to_user_id: callTargetId, candidate: e.candidate });
  };
  p.onconnectionstatechange = () => {
    const st = p.connectionState;
    if (st === 'connected') {
      stopRing();
      document.getElementById('call-av').classList.add('active');
      document.getElementById('call-status').textContent = callType === 'video' ? '📹 Видеозвонок' : '📞 Разговор';
      renderCallActions(true, false);
      if (callType === 'video') {
        document.getElementById('call-video-wrap').style.display = '';
        document.getElementById('call-audio-ui').style.display = 'none';
      }
    } else if (st === 'failed' || st === 'disconnected') {
      document.getElementById('call-status').textContent = '⚠️ Соединение прервано';
    }
  };
  return p;
}

function toggleMute() {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  const btn = document.getElementById('mute-btn');
  if (btn) btn.textContent = isMuted ? '🔇' : '🎤';
}

function toggleCam() {
  if (!localStream) return;
  const tracks = localStream.getVideoTracks();
  if (!tracks.length) return;
  tracks[0].enabled = !tracks[0].enabled;
  const btn = document.getElementById('cam-btn');
  if (btn) btn.textContent = tracks[0].enabled ? '📷' : '🚫';
}

function endCall() {
  if (callTargetId) wsSend({ type: 'call_end', to_user_id: callTargetId });
  endCallClean();
}

function rejectCall() {
  if (callTargetId) wsSend({ type: 'call_reject', to_user_id: callTargetId });
  endCallClean();
}

function endCallClean() {
  stopRing();
  if (pc) { pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  document.getElementById('remote-video').srcObject = null;
  document.getElementById('remote-audio').srcObject = null;
  document.getElementById('local-video').srcObject = null;
  document.getElementById('call-video-wrap').style.display = 'none';
  document.getElementById('call-audio-ui').style.display = 'flex';
  document.getElementById('call-overlay').classList.add('hidden');
  callTargetId = null; incomingSdp = null;
}

// ── Profile Edit ──────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#5B8DEF','#9b59b6','#e74c3c','#e67e22','#2ecc71','#1abc9c','#e91e8c',
  '#3498db','#f39c12','#16a085','#8e44ad','#c0392b','#27ae60','#d35400',
  '#2980b9','#7f8c8d','#f1c40f','#1a237e','#006064','#4a148c',
];
let selectedColor = null;

function openProfileModal() {
  selectedColor = me.avatar_color || '#5B8DEF';
  document.getElementById('prof-username').value = me.username || '';
  document.getElementById('prof-status').value = '';
  document.getElementById('prof-cur-pass').value = '';
  document.getElementById('prof-new-pass').value = '';
  document.getElementById('prof-err').textContent = '';
  // render avatar
  const av = document.getElementById('prof-av');
  av.style.background = selectedColor;
  if (me.avatar_url) {
    av.style.backgroundImage = `url(${me.avatar_url})`;
    av.style.backgroundSize = 'cover';
    av.textContent = '';
  } else {
    av.style.backgroundImage = '';
    av.textContent = (me.username || '?')[0].toUpperCase();
  }
  // render color grid
  const grid = document.getElementById('color-grid'); grid.innerHTML = '';
  AVATAR_COLORS.forEach(c => {
    const dot = document.createElement('div');
    dot.className = 'color-dot' + (c === selectedColor ? ' selected' : '');
    dot.style.background = c;
    dot.onclick = () => {
      selectedColor = c;
      document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
      document.getElementById('prof-av').style.background = c;
    };
    grid.appendChild(dot);
  });
  // load status from server
  api('/api/users/me').then(r => r?.json()).then(d => {
    if (d) document.getElementById('prof-status').value = d.status_message || '';
  });
  show('profile-modal');
}

async function saveProfile() {
  const errEl = document.getElementById('prof-err'); errEl.textContent = '';
  const uname = document.getElementById('prof-username').value.trim();
  const status = document.getElementById('prof-status').value;
  const curPass = document.getElementById('prof-cur-pass').value;
  const newPass = document.getElementById('prof-new-pass').value;

  const body = { username: uname, avatar_color: selectedColor, status_message: status };
  if (newPass) { body.current_password = curPass; body.new_password = newPass; }

  const r = await api('/api/users/me', 'PUT', body);
  if (!r) { errEl.textContent = 'Ошибка соединения'; return; }
  if (!r.ok) { const d = await r.json(); errEl.textContent = d.detail || 'Ошибка'; return; }
  const d = await r.json();
  me.username = d.username; me.avatar_color = d.avatar_color; me.is_verified = d.is_verified;
  if (d.avatar_url !== undefined) me.avatar_url = d.avatar_url;
  localStorage.setItem('jf_me', JSON.stringify(me));
  renderMe(); closeModalById('profile-modal');
  notify('Профиль', 'Изменения сохранены');
}

// ── User Profile View ─────────────────────────────────────────────────────────
async function openUserProfile(userId) {
  const r = await api(`/api/users/profile/${userId}`);
  if (!r || !r.ok) { notify('Ошибка', 'Профиль недоступен'); return; }
  const u = await r.json();

  const av = document.getElementById('up-avatar');
  av.style.background = u.avatar_color;
  if (u.avatar_url) {
    av.style.backgroundImage = `url(${u.avatar_url})`;
    av.style.backgroundSize = 'cover';
    av.textContent = '';
  } else {
    av.style.backgroundImage = '';
    av.textContent = u.username[0].toUpperCase();
  }

  const nameEl = document.getElementById('up-name');
  nameEl.innerHTML = x(u.username) +
    (u.is_verified ? ' <span class="verified" title="Верифицирован">✓</span>' : '') +
    (u.is_admin ? ' 👑' : '');

  const stEl = document.getElementById('up-status');
  stEl.innerHTML = u.status === 'online'
    ? '<span class="up-badge online">● В сети</span>'
    : '<span class="up-badge offline">Не в сети</span>';

  document.getElementById('up-status-msg').textContent = u.status_message || '';
  document.getElementById('up-id').textContent = `ID: ${u.id}`;
  document.getElementById('up-mutual').textContent = u.mutual_friends
    ? `${u.mutual_friends} общих друга(ей)`
    : '';

  const act = document.getElementById('up-actions');
  act.innerHTML = '';

  if (userId !== me.id) {
    if (u.chat_id) {
      const btn = document.createElement('button');
      btn.className = 'btn'; btn.textContent = '💬 Написать';
      btn.onclick = () => { closeModalById('user-profile-modal'); openChat(u.chat_id); showSide('chats'); };
      act.appendChild(btn);
    } else if (!u.is_friend && !u.has_pending) {
      const btn = document.createElement('button');
      btn.className = 'btn'; btn.textContent = '➕ Добавить';
      btn.onclick = async () => {
        btn.disabled = true; btn.textContent = '...';
        const res = await api(`/api/users/friend-request/${userId}`, 'POST');
        btn.textContent = res?.ok ? 'Отправлено ✓' : 'Ошибка';
      };
      act.appendChild(btn);
    } else if (u.has_pending) {
      const btn = document.createElement('button');
      btn.className = 'btn-sec'; btn.textContent = 'Запрос отправлен';
      btn.disabled = true;
      act.appendChild(btn);
    }
  }

  show('user-profile-modal');
}

// ── Chat Header Click ─────────────────────────────────────────────────────────
function onChatHeaderClick() {
  if (!activeChat) return;
  if (activeChat.type === 'PERSONAL' && activeChat.other_user) {
    openUserProfile(activeChat.other_user.id);
  } else {
    openGroupInfo();
  }
}

// ── Group Info / Settings ─────────────────────────────────────────────────────
let gsColor = null;

async function openGroupInfo() {
  if (!activeChatId || !activeChat) return;
  const r = await api(`/api/chats/${activeChatId}/info`);
  if (!r || !r.ok) return;
  const info = await r.json();

  const canEdit = info.my_role === 'owner' || info.my_role === 'admin';

  gsColor = info.avatar_color;
  const av = document.getElementById('gs-avatar');
  if (info.avatar_url) {
    av.style.background = 'transparent';
    av.style.backgroundImage = `url(${info.avatar_url})`;
    av.style.backgroundSize = 'cover';
    av.textContent = '';
  } else {
    av.style.backgroundImage = '';
    av.style.background = gsColor;
    av.textContent = (info.name || '?')[0].toUpperCase();
  }

  document.getElementById('gs-name').value = info.name || '';
  document.getElementById('gs-desc').value = info.description || '';
  document.getElementById('gs-err').textContent = '';

  // Photo upload button
  const photoLabel = document.getElementById('gs-photo-label');
  if (photoLabel) photoLabel.style.display = canEdit ? 'flex' : 'none';

  // Color grid — only for owner/admin
  const grid = document.getElementById('gs-colors'); grid.innerHTML = '';
  if (canEdit) {
    AVATAR_COLORS.forEach(c => {
      const dot = document.createElement('div');
      dot.className = 'color-dot' + (c === gsColor ? ' selected' : '');
      dot.style.background = c;
      dot.onclick = () => {
        gsColor = c;
        document.querySelectorAll('#gs-colors .color-dot').forEach(d => d.classList.remove('selected'));
        dot.classList.add('selected');
        av.style.background = c;
      };
      grid.appendChild(dot);
    });
    document.getElementById('gs-name').disabled = false;
    document.getElementById('gs-desc').disabled = false;
    document.querySelector('#grp-settings-modal .btn').style.display = '';
  } else {
    document.getElementById('gs-name').disabled = true;
    document.getElementById('gs-desc').disabled = true;
    document.querySelector('#grp-settings-modal .btn').style.display = 'none';
  }

  show('grp-settings-modal');
}

async function saveGroupSettings() {
  const errEl = document.getElementById('gs-err'); errEl.textContent = '';
  const name = document.getElementById('gs-name').value.trim();
  const desc = document.getElementById('gs-desc').value;
  if (!name) { errEl.textContent = 'Введите название'; return; }

  const r = await api(`/api/chats/${activeChatId}/settings`, 'PUT', {
    name, description: desc, avatar_color: gsColor
  });
  if (!r || !r.ok) { errEl.textContent = 'Ошибка сохранения'; return; }
  const d = await r.json();

  // update local chat
  if (activeChat) {
    activeChat.name = d.name;
    activeChat.description = d.description;
    activeChat.avatar_color = d.avatar_color;
  }
  // update header
  document.getElementById('ch-av').style.background = d.avatar_color;
  document.getElementById('ch-av').textContent = d.name[0].toUpperCase();

  closeModalById('grp-settings-modal');
  await loadChats();
  notify('Группа', 'Настройки сохранены');
}

// ── Admin Panel ───────────────────────────────────────────────────────────────
function showAdminTab(tab) {
  ['users','chats'].forEach(t => {
    document.getElementById(`atab-${t}`).classList.toggle('active', t === tab);
    document.getElementById(`apanel-${t}`).style.display = t === tab ? '' : 'none';
  });
  if (tab === 'chats') adminLoadChats('');
}

async function openAdminPanel() {
  show('admin-modal');
  await adminLoadStats();
  await adminLoadUsers('');
}

async function adminLoadStats() {
  const r = await api('/api/admin/stats'); if (!r || !r.ok) return;
  const s = await r.json();
  const el = document.getElementById('admin-stats');
  el.innerHTML = `
    <div class="stat-card"><div class="stat-val">${s.total_users}</div><div class="stat-lbl">Пользователей</div></div>
    <div class="stat-card"><div class="stat-val" style="color:var(--online)">${s.online_users}</div><div class="stat-lbl">Онлайн</div></div>
    <div class="stat-card"><div class="stat-val">${s.new_users_today}</div><div class="stat-lbl">Новых сегодня</div></div>
    <div class="stat-card"><div class="stat-val">${s.verified_users}</div><div class="stat-lbl">Верифицировано</div></div>
    <div class="stat-card"><div class="stat-val" style="color:var(--danger)">${s.banned_users}</div><div class="stat-lbl">Заблокировано</div></div>
    <div class="stat-card"><div class="stat-val">${s.total_messages}</div><div class="stat-lbl">Сообщений</div></div>
    <div class="stat-card"><div class="stat-val">${s.msgs_today}</div><div class="stat-lbl">Сообщ. сегодня</div></div>
    <div class="stat-card"><div class="stat-val">${s.total_chats}</div><div class="stat-lbl">Чатов</div></div>
  `;
}

function adminSearch() {
  clearTimeout(searchTimer);
  const q = document.getElementById('admin-search').value.trim();
  searchTimer = setTimeout(() => adminLoadUsers(q), 300);
}

async function adminLoadUsers(q = '') {
  const r = await api(`/api/admin/users?q=${encodeURIComponent(q)}&limit=100`);
  if (!r || !r.ok) return;
  const users = await r.json();
  const el = document.getElementById('admin-users'); el.innerHTML = '';
  users.forEach(u => {
    const row = document.createElement('div'); row.className = 'admin-user-row'; row.id = `au-${u.id}`;
    const dot = u.status === 'online' ? `<span style="color:var(--online)">●</span>` : `<span style="color:var(--muted)">●</span>`;
    row.innerHTML = `
      <div class="avatar sm" style="background:${u.avatar_color}">${u.username[0].toUpperCase()}</div>
      <div class="admin-user-info">
        <div class="admin-user-name">${x(u.username)}${u.is_verified ? ' <span class="verified">✓</span>' : ''}${u.is_admin ? ' 👑' : ''}</div>
        <div class="admin-user-sub">${dot} ID: ${u.id} · ${u.created_at ? u.created_at.slice(0,10) : ''}</div>
      </div>
      <div class="admin-actions">
        <button class="adm-btn verify ${u.is_verified ? 'on' : ''}" onclick="adminVerify(${u.id},this)">${u.is_verified ? '✓ Верифицирован' : 'Верифицировать'}</button>
        ${!u.is_admin ? `<button class="adm-btn ban ${u.is_banned ? 'on' : ''}" onclick="adminBan(${u.id},this)">${u.is_banned ? 'Разблокировать' : 'Забанить'}</button>` : ''}
      </div>`;
    el.appendChild(row);
  });
}

async function adminVerify(uid, btn) {
  const r = await api(`/api/admin/users/${uid}/verify`, 'POST'); if (!r || !r.ok) return;
  const d = await r.json();
  btn.classList.toggle('on', d.is_verified);
  btn.textContent = d.is_verified ? '✓ Верифицирован' : 'Верифицировать';
  // update name badge
  const row = document.getElementById(`au-${uid}`);
  if (row) {
    const nm = row.querySelector('.admin-user-name');
    if (nm) {
      nm.innerHTML = nm.innerHTML.replace(/<span class="verified">.*?<\/span>/g, '');
      if (d.is_verified) nm.insertAdjacentHTML('afterbegin', '<span class="verified">✓</span> ');
    }
  }
}

async function adminBan(uid, btn) {
  if (!confirm('Заблокировать / разблокировать пользователя?')) return;
  const r = await api(`/api/admin/users/${uid}/ban`, 'POST'); if (!r || !r.ok) return;
  const d = await r.json();
  btn.classList.toggle('on', d.is_banned);
  btn.textContent = d.is_banned ? 'Разблокировать' : 'Забанить';
}

function adminChatSearch() {
  clearTimeout(searchTimer);
  const q = document.getElementById('admin-chat-search').value.trim();
  searchTimer = setTimeout(() => adminLoadChats(q), 300);
}

async function adminLoadChats(q = '') {
  const r = await api(`/api/admin/chats?q=${encodeURIComponent(q)}`);
  if (!r || !r.ok) return;
  const chats = await r.json();
  const el = document.getElementById('admin-chats'); el.innerHTML = '';
  chats.forEach(c => {
    const row = document.createElement('div'); row.className = 'admin-user-row'; row.id = `ac-${c.id}`;
    const badge = c.is_channel ? '📢 канал' : '👥 группа';
    row.innerHTML = `
      <div class="avatar sq sm" style="background:${c.avatar_color}">${(c.name||'?')[0].toUpperCase()}</div>
      <div class="admin-user-info">
        <div class="admin-user-name">${x(c.name)}${c.is_verified ? ' <span class="verified">✓</span>' : ''}</div>
        <div class="admin-user-sub">${badge} · ${c.member_count} участников · ID: ${c.id}</div>
      </div>
      <div class="admin-actions">
        <button class="adm-btn verify ${c.is_verified ? 'on' : ''}" onclick="adminVerifyChat(${c.id},this)">${c.is_verified ? '✓ Верифицирован' : 'Верифицировать'}</button>
      </div>`;
    el.appendChild(row);
  });
}

async function adminVerifyChat(chatId, btn) {
  const r = await api(`/api/admin/chats/${chatId}/verify`, 'POST'); if (!r || !r.ok) return;
  const d = await r.json();
  btn.classList.toggle('on', d.is_verified);
  btn.textContent = d.is_verified ? '✓ Верифицирован' : 'Верифицировать';
}

async function adminSendStats() {
  const r = await api('/api/admin/stats/send', 'POST');
  if (r && r.ok) notify('Статистика', 'Отправлена в чат');
}

// ── Leave / Delete chat ───────────────────────────────────────────────────────
async function leaveChat() {
  if (!activeChatId || !activeChat) return;
  const isGroup = activeChat.type !== 'PERSONAL';
  const isOwner = activeChat.my_role === 'owner';
  let msg;
  if (!isGroup) msg = 'Удалить переписку? Все сообщения будут удалены.';
  else if (isOwner) msg = 'Вы владелец. Группа будет полностью удалена для всех. Продолжить?';
  else msg = 'Покинуть ' + (activeChat.is_channel ? 'канал' : 'группу') + ' «' + (activeChat.name || '') + '»?';

  if (!confirm(msg)) return;
  const r = await api(`/api/chats/${activeChatId}/leave`, 'POST');
  if (!r || !r.ok) { notify('Ошибка', 'Не удалось покинуть чат'); return; }

  activeChatId = null; activeChat = null;
  document.getElementById('chat-view').style.display = 'none';
  document.getElementById('no-chat').style.display = '';
  goBack();
  await loadChats();
}

// ── Utils ─────────────────────────────────────────────────────────────────────
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

function scrollBottom() { const el = document.getElementById('msgs'); if (el) el.scrollTop = el.scrollHeight; }

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}

function fmtSize(b) {
  if (b < 1024) return b + ' Б';
  if (b < 1048576) return (b/1024).toFixed(1) + ' КБ';
  return (b/1048576).toFixed(1) + ' МБ';
}

function fileIcon(t) {
  if (!t) return '📄';
  if (t.startsWith('video/')) return '🎬';
  if (t.startsWith('audio/')) return '🎵';
  if (t.includes('pdf')) return '📕';
  if (t.match(/zip|rar|7z|tar/)) return '🗜️';
  if (t.match(/word|document/)) return '📝';
  if (t.match(/excel|spreadsheet/)) return '📊';
  return '📎';
}
