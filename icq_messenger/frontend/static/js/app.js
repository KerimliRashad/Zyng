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

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    if (token && me) {
        showApp();
    } else {
        show('auth-screen');
    }
});

function show(id) {
    document.getElementById(id).classList.remove('hidden');
}
function hide(id) {
    document.getElementById(id).classList.add('hidden');
}

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
    document.getElementById('l-err').textContent = '';

    if (!username || !password) {
        document.getElementById('l-err').textContent = 'Заполните все поля';
        return;
    }

    const form = new FormData();
    form.append('username', username);
    form.append('password', password);

    try {
        const res = await fetch('/api/auth/login', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) { document.getElementById('l-err').textContent = data.detail || 'Ошибка'; return; }
        saveSession(data);
        showApp();
    } catch {
        document.getElementById('l-err').textContent = 'Нет соединения с сервером';
    }
}

async function doRegister() {
    const username = document.getElementById('r-user').value.trim();
    const password = document.getElementById('r-pass').value;
    document.getElementById('r-err').textContent = '';

    if (!username || !password) {
        document.getElementById('r-err').textContent = 'Заполните все поля';
        return;
    }
    if (password.length < 4) {
        document.getElementById('r-err').textContent = 'Пароль минимум 4 символа';
        return;
    }

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) { document.getElementById('r-err').textContent = data.detail || 'Ошибка'; return; }
        saveSession(data);
        showApp();
    } catch {
        document.getElementById('r-err').textContent = 'Нет соединения с сервером';
    }
}

function saveSession(data) {
    token = data.access_token;
    me = { id: data.user_id, username: data.username, is_admin: data.is_admin, avatar_color: data.avatar_color };
    localStorage.setItem('jf_token', token);
    localStorage.setItem('jf_me', JSON.stringify(me));
}

// ── Me ────────────────────────────────────────────────────────────────────────
function renderMe() {
    const av = document.getElementById('me-av');
    av.style.background = me.avatar_color;
    av.textContent = me.username[0].toUpperCase();
    document.getElementById('me-name').textContent = me.username;
    document.getElementById('me-id').textContent = `ID: ${me.id}` + (me.is_admin ? ' 👑' : '');
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/ws?token=${token}`);
    ws.onopen = () => {};
    ws.onmessage = e => handleWS(JSON.parse(e.data));
    ws.onclose = () => setTimeout(connectWS, 3000);
    ws.onerror = () => ws.close();
}

function handleWS(msg) {
    if (msg.type === 'new_message') {
        if (msg.chat_id === activeChatId) {
            hideTyping();
            appendMsg(msg);
            scrollBottom();
        }
        loadChats();
        if (!msg.is_mine) notify(msg.sender_name, msg.text);
    } else if (msg.type === 'typing') {
        if (msg.chat_id === activeChatId) showTyping();
    } else if (msg.type === 'user_status') {
        const f = friends.find(x => x.id === msg.user_id);
        if (f) { f.status = msg.status; renderFriends(); }
        loadChats();
    } else if (msg.type === 'friend_request') {
        loadPending();
        notify('Запрос в друзья', `от ${msg.from_name}`);
    } else if (msg.type === 'friend_accepted') {
        loadFriends(); loadChats();
        notify('Jeff Messenger', `${msg.username} принял запрос`);
    }
}

function wsSend(data) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

// ── Friends ───────────────────────────────────────────────────────────────────
async function loadFriends() {
    const res = await api('/api/users/friends');
    if (!res) return;
    friends = await res.json();
    renderFriends();
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
    const res = await api('/api/users/pending-requests');
    if (!res) return;
    const reqs = await res.json();
    const el = document.getElementById('pending-list');
    el.innerHTML = '';
    if (!reqs.length) return;
    el.insertAdjacentHTML('beforeend', '<div class="pend-head">Запросы в друзья</div>');
    reqs.forEach(r => {
        const d = document.createElement('div');
        d.className = 'pend-item';
        d.id = `pr-${r.request_id}`;
        d.innerHTML = `
            <div class="avatar" style="background:${r.avatar_color}">${r.from_name[0].toUpperCase()}</div>
            <div class="c-meta">
                <div class="c-name">${x(r.from_name)}</div>
                <div class="c-sub">ID: ${r.from_id}</div>
            </div>
            <button class="acc-btn" onclick="acceptReq(${r.request_id})">✓</button>`;
        el.appendChild(d);
    });
}

async function acceptReq(id) {
    const res = await api(`/api/users/friend-request/${id}/accept`, 'POST');
    if (res && res.ok) {
        document.getElementById(`pr-${id}`)?.remove();
        loadFriends(); loadChats();
    }
}

// ── Search ────────────────────────────────────────────────────────────────────
function onSearchContacts() {
    const q = document.getElementById('q-contact').value.trim();
    clearTimeout(searchTimer);
    const el = document.getElementById('search-res');
    if (!q) { el.innerHTML = ''; return; }
    searchTimer = setTimeout(() => doSearch(q, 'search-res'), 300);
}

function onSearchModal() {
    const q = document.getElementById('modal-q').value.trim();
    clearTimeout(searchTimer);
    const el = document.getElementById('modal-res');
    if (!q) { el.innerHTML = ''; return; }
    searchTimer = setTimeout(() => doSearch(q, 'modal-res'), 300);
}

async function doSearch(q, elId) {
    const res = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
    if (!res) return;
    const users = await res.json();
    const el = document.getElementById(elId);
    el.innerHTML = '';
    if (!users.length) {
        el.innerHTML = '<div style="padding:10px 14px;color:var(--muted);font-size:13px">Не найдено</div>';
        return;
    }
    const myIds = new Set(friends.map(f => f.id));
    users.forEach(u => {
        const d = document.createElement('div');
        d.className = 's-item';
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
    const res = await api(`/api/users/friend-request/${uid}`, 'POST');
    if (res && res.ok) { btn.textContent = 'Отправлено'; }
    else { btn.textContent = 'Уже'; }
}

// ── Chats list ────────────────────────────────────────────────────────────────
async function loadChats() {
    const res = await api('/api/chats');
    if (!res) return;
    chats = await res.json();
    renderChats();
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
        const sub = c.last_message?.text?.slice(0, 38) || '';
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
    const res = await api(`/api/chats/${chatId}/messages`);
    if (!res || !res.ok) return;
    const msgs = await res.json();
    msgs.forEach(m => appendMsg(m));
    scrollBottom();
}

function appendMsg(m) {
    const list = document.getElementById('msg-list');
    const d = document.createElement('div');
    d.className = 'msg ' + (m.is_mine ? 'me' : 'other');
    d.innerHTML = `
        ${!m.is_mine ? `<div class="msg-who">${x(m.sender_name)}</div>` : ''}
        <div class="msg-bubble">${x(m.text)}</div>
        <div class="msg-time">${fmtTime(m.created_at)}</div>`;
    list.appendChild(d);
}

// ── Send ──────────────────────────────────────────────────────────────────────
function sendMsg() {
    const inp = document.getElementById('msg-inp');
    const text = inp.value.trim();
    if (!text || !activeChatId) return;
    wsSend({ type: 'send_message', chat_id: activeChatId, text });
    inp.value = '';
    inp.style.height = 'auto';
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

// ── Typing ────────────────────────────────────────────────────────────────────
function showTyping() {
    const t = document.getElementById('typing');
    t.classList.remove('hidden');
    scrollBottom();
    clearTimeout(typingHideTimer);
    typingHideTimer = setTimeout(hideTyping, 2500);
}
function hideTyping() {
    document.getElementById('typing')?.classList.add('hidden');
}

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
    if (!e || e.target === document.getElementById('add-modal')) {
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
