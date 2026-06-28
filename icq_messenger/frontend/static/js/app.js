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

// ── App init ──────────────────────────────────────────────────────────────────
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
      if (!msg.is_mine) {
        const preview = msg.file_type?.startsWith('audio/') ? '🎤 Голосовое' :
                        msg.file_name ? '📎 ' + msg.file_name : (msg.text || 'Сообщение');
        notify(msg.sender_name, preview);
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
      loadPending(); notify('Запрос в друзья', 'от ' + msg.from_name);
      break;
    case 'friend_accepted':
      loadFriends(); loadChats(); notify('Jeff', msg.username + ' принял запрос');
      break;
    case 'added_to_group':
      loadChats();
      notify(msg.is_channel ? 'Вас добавили в канал' : 'Вас добавили в группу', msg.chat_name);
      break;
    case 'call_offer':
      incomingSdp = msg.sdp;
      callTargetId = msg.from_user_id;
      callType = msg.call_type || 'voice';
      isCaller = false;
      showIncomingCall(msg.from_name, msg.call_type || 'voice');
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
        <div class="c-name" style="font-size:13px">${x(u.username)}</div>
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
    d.innerHTML = `
      <div class="avatar ${isGroup ? 'sq' : ''}" style="background:${col}">${nm[0].toUpperCase()}</div>
      <div class="c-meta">
        <div class="c-name">${x(nm)}${c.is_channel ? '<span class="channel-badge">канал</span>' : (isGroup ? '<span class="group-badge">группа</span>' : '')}</div>
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
  av.style.background = col;
  av.textContent = nm[0].toUpperCase();
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
  if (mediaRec && mediaRec.state === 'recording') {
    mediaRec.stop(); btn.classList.remove('recording'); btn.textContent = '🎤';
    clearInterval(recTimer); return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recChunks = []; recSecs = 0;
    mediaRec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
    mediaRec.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
    mediaRec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
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
    recTimer = setInterval(() => { recSecs++; btn.title = 'Запись ' + fmtDur(recSecs); }, 1000);
  } catch { notify('Ошибка', 'Нет доступа к микрофону'); }
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
    d.innerHTML = `
      <div class="avatar sm" style="background:${m.avatar_color}">${m.username[0].toUpperCase()}</div>
      <div class="mp-name">${x(m.username)}</div>
      <div class="mp-role">${m.role === 'owner' ? '👑' : m.role === 'admin' ? '⭐' : ''}</div>`;
    list.appendChild(d);
  });
}

// ── Notification ──────────────────────────────────────────────────────────────
function notify(title, body) {
  const el = document.getElementById('notif');
  el.innerHTML = `<div class="notif-t">${x(title)}</div><div class="notif-b">${x(body)}</div>`;
  el.classList.remove('hidden');
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

// ══════════════════ WEBRTC CALLS ══════════════════════════════════════════════
const ICE = { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
] };

async function startCall(type) {
  if (!activeChatId || !activeChat?.other_user) return;
  callTargetId = activeChat.other_user.id;
  callType = type; isCaller = true; isMuted = false;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
  } catch { notify('Ошибка', 'Нет доступа к ' + (type === 'video' ? 'камере' : 'микрофону')); return; }

  pc = newPC();
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  if (type === 'video') document.getElementById('local-video').srcObject = localStream;

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  wsSend({ type: 'call_offer', to_user_id: callTargetId, from_name: me.username, sdp: offer, call_type: type });
  showCallUI(activeChat.other_user.username, activeChat.other_user.avatar_color, 'Вызов...', false);
}

function showIncomingCall(fromName, type) {
  const col = '#5288c1';
  showCallUI(fromName, col, (type === 'video' ? '📹 Входящий видеозвонок' : '📞 Входящий звонок'), true);
}

function showCallUI(name, color, status, incoming) {
  const av = document.getElementById('call-av');
  av.style.background = color; av.textContent = (name || '?')[0].toUpperCase();
  document.getElementById('call-name').textContent = name || '';
  document.getElementById('call-status').textContent = status;
  document.getElementById('call-video-wrap').style.display = 'none';
  renderCallActions(!incoming, incoming);
  show('call-overlay');
}

function renderCallActions(active = false, incoming = false) {
  const el = document.getElementById('call-actions');
  if (incoming) {
    el.innerHTML = `
      <button class="call-btn accept" onclick="acceptIncomingCall()">📞</button>
      <button class="call-btn end" onclick="rejectCall()">📵</button>`;
  } else if (active) {
    el.innerHTML = `
      <button class="call-btn mute" id="mute-btn" onclick="toggleMute()">${isMuted ? '🔇' : '🎤'}</button>
      <button class="call-btn end" onclick="endCall()">📵</button>`;
  } else {
    el.innerHTML = `<button class="call-btn end" onclick="endCall()">📵</button>`;
  }
}

async function acceptIncomingCall() {
  if (!incomingSdp) return;
  isMuted = false;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' });
  } catch { notify('Ошибка', 'Нет доступа к ' + (callType === 'video' ? 'камере' : 'микрофону')); endCallClean(); return; }

  pc = newPC();
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  if (callType === 'video') {
    document.getElementById('local-video').srcObject = localStream;
    document.getElementById('call-video-wrap').style.display = '';
  }

  await pc.setRemoteDescription(new RTCSessionDescription(incomingSdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  wsSend({ type: 'call_answer', to_user_id: callTargetId, sdp: answer });

  document.getElementById('call-status').textContent = callType === 'video' ? '📹 Видеозвонок' : '📞 Разговор';
  renderCallActions(true, false);
  incomingSdp = null;
}

function newPC() {
  const p = new RTCPeerConnection(ICE);
  p.ontrack = e => { document.getElementById('remote-video').srcObject = e.streams[0]; };
  p.onicecandidate = e => {
    if (e.candidate && callTargetId) wsSend({ type: 'call_ice', to_user_id: callTargetId, candidate: e.candidate });
  };
  p.onconnectionstatechange = () => {
    if (p.connectionState === 'connected') {
      document.getElementById('call-status').textContent = callType === 'video' ? '📹 Видеозвонок' : '📞 Разговор';
      renderCallActions(true, false);
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

function endCall() {
  if (callTargetId) wsSend({ type: 'call_end', to_user_id: callTargetId });
  endCallClean();
}

function rejectCall() {
  if (callTargetId) wsSend({ type: 'call_reject', to_user_id: callTargetId });
  endCallClean();
}

function endCallClean() {
  if (pc) { pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  document.getElementById('remote-video').srcObject = null;
  document.getElementById('local-video').srcObject = null;
  document.getElementById('call-video-wrap').style.display = 'none';
  hide('call-overlay');
  callTargetId = null; incomingSdp = null;
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
