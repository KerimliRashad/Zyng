const API = '';  // same origin
let token = localStorage.getItem('icq_token');
let me = JSON.parse(localStorage.getItem('icq_me') || 'null');
let ws = null;
let activeChatId = null;
let typingTimer = null;
let friends = [];
let chats = [];

// ── INIT ──────────────────────────────────────────────────────────────────────

window.onload = () => {
    if (token && me) {
        showApp();
    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
    }
};

function showApp() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    renderCurrentUser();
    connectWS();
    loadFriends();
    loadChats();
    loadPendingRequests();
}

function logout() {
    token = null; me = null;
    localStorage.removeItem('icq_token');
    localStorage.removeItem('icq_me');
    if (ws) ws.close();
    location.reload();
}

// ── AUTH ──────────────────────────────────────────────────────────────────────

function showTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((b, i) => {
        b.classList.toggle('active', (i === 0) === (tab === 'login'));
    });
    document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
    document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
}

document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    const form = new FormData();
    form.append('username', username);
    form.append('password', password);

    const res = await fetch(`${API}/api/auth/login`, { method: 'POST', body: form });
    const data = await res.json();

    if (!res.ok) {
        document.getElementById('login-error').textContent = data.detail || 'Ошибка входа';
        return;
    }
    saveSession(data);
    showApp();
};

document.getElementById('register-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = {
        username: document.getElementById('reg-username').value,
        password: document.getElementById('reg-password').value,
    };
    const res = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
        document.getElementById('register-error').textContent = data.detail || 'Ошибка регистрации';
        return;
    }
    saveSession(data);
    showApp();
};

function saveSession(data) {
    token = data.access_token;
    me = { id: data.user_id, username: data.username, is_admin: data.is_admin, avatar_color: data.avatar_color };
    localStorage.setItem('icq_token', token);
    localStorage.setItem('icq_me', JSON.stringify(me));
}

// ── CURRENT USER ──────────────────────────────────────────────────────────────

function renderCurrentUser() {
    const av = document.getElementById('my-avatar');
    av.style.background = me.avatar_color;
    av.textContent = me.username[0].toUpperCase();
    document.getElementById('my-display-name').textContent = me.username;
    const label = `ID: ${me.id}${me.is_admin ? ' 👑 Админ' : ''}`;
    document.getElementById('my-id-label').textContent = label;
}

// ── WEBSOCKET ──────────────────────────────────────────────────────────────────

function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/ws?token=${token}`);

    ws.onopen = () => console.log('WS connected');
    ws.onmessage = (e) => handleWSMessage(JSON.parse(e.data));
    ws.onclose = () => setTimeout(connectWS, 3000);
    ws.onerror = () => ws.close();
}

function handleWSMessage(msg) {
    switch (msg.type) {
        case 'new_message':
            handleNewMessage(msg);
            break;
        case 'typing':
            if (msg.chat_id === activeChatId) showTyping();
            break;
        case 'user_status':
            updateUserStatus(msg.user_id, msg.status);
            break;
        case 'friend_request':
            addPendingRequest(msg);
            showNotification(`Запрос в друзья от ${msg.from_name}`, msg.from_username);
            break;
        case 'friend_accepted':
            loadFriends();
            loadChats();
            showNotification('Новый контакт', `${msg.username} принял(а) ваш запрос`);
            break;
    }
}

function sendWS(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

// ── CONTACTS ──────────────────────────────────────────────────────────────────

async function loadFriends() {
    const res = await apiFetch('/api/users/friends');
    if (!res.ok) return;
    friends = await res.json();
    renderFriends();
}

function renderFriends() {
    const list = document.getElementById('friends-list');
    list.innerHTML = '';

    const online = friends.filter(f => f.status === 'online');
    const offline = friends.filter(f => f.status !== 'online');

    if (online.length) {
        list.insertAdjacentHTML('beforeend', `<div class="section-label">В сети (${online.length})</div>`);
        online.forEach(f => list.appendChild(friendItem(f)));
    }
    if (offline.length) {
        list.insertAdjacentHTML('beforeend', `<div class="section-label">Не в сети (${offline.length})</div>`);
        offline.forEach(f => list.appendChild(friendItem(f)));
    }
}

function friendItem(f) {
    const div = document.createElement('div');
    div.className = 'contact-item';
    div.dataset.userId = f.id;
    div.innerHTML = `
        <div class="avatar" style="background:${f.avatar_color}">${f.username[0]}</div>
        <div class="contact-meta">
            <div class="contact-name">${esc(f.username)}</div>
            <div class="contact-sub">${esc(f.status_message || f.username)}</div>
        </div>
        <div class="status-dot ${f.status}"></div>
    `;
    if (f.chat_id) {
        div.onclick = () => openChat(f.chat_id, f.username, f.avatar_color, f.status);
    }
    return div;
}

async function loadPendingRequests() {
    const res = await apiFetch('/api/users/pending-requests');
    if (!res.ok) return;
    const requests = await res.json();
    renderPending(requests);
}

function renderPending(requests) {
    const sec = document.getElementById('pending-requests');
    sec.innerHTML = '';
    if (!requests.length) return;
    sec.insertAdjacentHTML('beforeend', `<div class="pending-header">Запросы в друзья</div>`);
    requests.forEach(r => addPendingRequest(r, sec));
}

function addPendingRequest(r, container) {
    const sec = container || document.getElementById('pending-requests');
    const div = document.createElement('div');
    div.className = 'pending-item';
    div.id = `req-${r.request_id}`;
    div.innerHTML = `
        <div class="avatar" style="background:${r.avatar_color || '#00a2ff'}">${r.from_name[0]}</div>
        <div class="contact-meta">
            <div class="contact-name">${esc(r.from_name)}</div>
            <div class="contact-sub">@${esc(r.from_username)}</div>
        </div>
        <button class="accept-btn" onclick="acceptRequest('${r.request_id}')">✓</button>
    `;
    sec.appendChild(div);
}

async function acceptRequest(requestId) {
    const res = await apiFetch(`/api/users/friend-request/${requestId}/accept`, 'POST');
    if (res.ok) {
        document.getElementById(`req-${requestId}`)?.remove();
        loadFriends();
        loadChats();
    }
}

// ── USER SEARCH ──────────────────────────────────────────────────────────────

let searchTimeout = null;

function searchUsers() {
    const q = document.getElementById('search-input').value.trim();
    clearTimeout(searchTimeout);
    if (!q) {
        document.getElementById('search-results').classList.add('hidden');
        return;
    }
    searchTimeout = setTimeout(() => doSearchUsers(q, 'search-results'), 300);
}

function searchForContact() {
    const q = document.getElementById('contact-search').value.trim();
    clearTimeout(searchTimeout);
    if (!q) { document.getElementById('contact-search-results').innerHTML = ''; return; }
    searchTimeout = setTimeout(() => doSearchUsers(q, 'contact-search-results'), 300);
}

async function doSearchUsers(q, containerId) {
    const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const users = await res.json();
    const container = document.getElementById(containerId);
    container.classList.remove('hidden');
    container.innerHTML = '';

    if (!users.length) {
        container.innerHTML = '<div style="padding:12px;color:var(--text-secondary);font-size:13px">Никого не найдено</div>';
        return;
    }

    const myFriendIds = new Set(friends.map(f => f.id));

    users.forEach(u => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        const alreadyFriend = myFriendIds.has(u.id);
        div.innerHTML = `
            <div class="avatar" style="background:${u.avatar_color}">${u.username[0]}</div>
            <div class="contact-meta">
                <div class="contact-name">${esc(u.username)}</div>
                <div class="contact-sub">@${esc(u.username)}</div>
            </div>
            <button class="add-btn" ${alreadyFriend ? 'disabled' : ''} onclick="sendFriendRequest('${u.id}', this)">
                ${alreadyFriend ? '✓' : 'Добавить'}
            </button>
        `;
        container.appendChild(div);
    });
}

async function sendFriendRequest(userId, btn) {
    btn.disabled = true;
    btn.textContent = '...';
    const res = await apiFetch(`/api/users/friend-request/${userId}`, 'POST');
    if (res.ok) {
        btn.textContent = 'Отправлено';
    } else {
        const d = await res.json();
        btn.textContent = d.detail || 'Ошибка';
    }
}

// ── CHATS ─────────────────────────────────────────────────────────────────────

async function loadChats() {
    const res = await apiFetch('/api/chats');
    if (!res.ok) return;
    chats = await res.json();
    renderChats();
}

function renderChats() {
    const list = document.getElementById('chats-list');
    list.innerHTML = '';
    chats.forEach(c => {
        const div = document.createElement('div');
        div.className = 'chat-item' + (c.id === activeChatId ? ' active' : '');
        div.id = `chat-item-${c.id}`;
        const timeStr = c.last_message ? formatTime(c.last_message.created_at) : '';
        div.innerHTML = `
            <div class="avatar" style="background:${c.other_user?.avatar_color || '#00a2ff'}">${(c.name || '?')[0]}</div>
            <div class="contact-meta">
                <div class="contact-name">${esc(c.name || 'Чат')}</div>
                <div class="contact-sub">${esc(c.last_message?.text?.slice(0, 40) || '')}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
                <div style="font-size:11px;color:var(--text-secondary)">${timeStr}</div>
                ${c.unread_count ? `<div class="unread-badge">${c.unread_count}</div>` : ''}
            </div>
        `;
        div.onclick = () => {
            const status = c.other_user?.status || 'offline';
            openChat(c.id, c.name, c.other_user?.avatar_color, status);
        };
        list.appendChild(div);
    });
}

// ── OPEN CHAT ─────────────────────────────────────────────────────────────────

async function openChat(chatId, name, avatarColor, status) {
    activeChatId = chatId;

    document.getElementById('no-chat').classList.add('hidden');
    document.getElementById('active-chat').classList.remove('hidden');

    const av = document.getElementById('chat-avatar');
    av.style.background = avatarColor || '#00a2ff';
    av.textContent = (name || '?')[0];
    document.getElementById('chat-name').textContent = name;

    const statusEl = document.getElementById('chat-status');
    statusEl.textContent = status === 'online' ? 'В сети' : 'Не в сети';
    statusEl.className = 'chat-status ' + (status === 'online' ? 'online' : '');

    // Mark chat as active in list
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`chat-item-${chatId}`)?.classList.add('active');

    sendWS({ type: 'join_chat', chat_id: chatId });

    await loadMessages(chatId);
    loadChats(); // refresh unread count
}

async function loadMessages(chatId) {
    const list = document.getElementById('messages-list');
    list.innerHTML = '';
    const res = await apiFetch(`/api/chats/${chatId}/messages`);
    if (!res.ok) return;
    const messages = await res.json();
    messages.forEach(m => appendMessage(m));
    scrollToBottom();
}

function appendMessage(msg) {
    const list = document.getElementById('messages-list');
    const div = document.createElement('div');
    div.className = 'message ' + (msg.is_mine ? 'mine' : 'other');
    div.id = `msg-${msg.id}`;

    const time = formatTime(msg.created_at);

    div.innerHTML = `
        ${!msg.is_mine ? `<div class="msg-sender">${esc(msg.sender_name)}</div>` : ''}
        <div class="msg-bubble">${esc(msg.text)}</div>
        <div class="msg-time">${time}</div>
    `;
    list.appendChild(div);
}

function handleNewMessage(msg) {
    if (msg.chat_id === activeChatId) {
        hideTyping();
        appendMessage(msg);
        scrollToBottom();
        loadChats();
    } else {
        // Update chat list unread
        loadChats();
        if (!msg.is_mine) {
            showNotification(msg.sender_name, msg.text);
        }
    }
}

// ── SEND MESSAGE ──────────────────────────────────────────────────────────────

function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text || !activeChatId) return;

    sendWS({ type: 'send_message', chat_id: activeChatId, text });
    input.value = '';
    input.style.height = 'auto';
}

function handleInputKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
    // Auto-resize
    const inp = e.target;
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
}

function onTyping() {
    if (!activeChatId) return;
    sendWS({ type: 'typing', chat_id: activeChatId });
}

// ── TYPING INDICATOR ──────────────────────────────────────────────────────────

let typingHideTimer = null;

function showTyping() {
    document.getElementById('typing-indicator').classList.remove('hidden');
    scrollToBottom();
    clearTimeout(typingHideTimer);
    typingHideTimer = setTimeout(hideTyping, 2500);
}

function hideTyping() {
    document.getElementById('typing-indicator').classList.add('hidden');
}

// ── STATUS UPDATE ─────────────────────────────────────────────────────────────

function updateUserStatus(userId, status) {
    const friend = friends.find(f => f.id === userId);
    if (friend) {
        friend.status = status;
        renderFriends();
    }
    // Update chat header if active chat is with this user
    const activeChat = chats.find(c => c.id === activeChatId);
    if (activeChat?.other_user?.id === userId) {
        const statusEl = document.getElementById('chat-status');
        statusEl.textContent = status === 'online' ? 'В сети' : 'Не в сети';
        statusEl.className = 'chat-status ' + (status === 'online' ? 'online' : '');
    }
    loadChats();
}

// ── TABS ──────────────────────────────────────────────────────────────────────

function showSideTab(tab) {
    document.querySelectorAll('.stab').forEach((b, i) => {
        b.classList.toggle('active', (i === 0) === (tab === 'contacts'));
    });
    document.getElementById('contacts-panel').classList.toggle('hidden', tab !== 'contacts');
    document.getElementById('chats-panel').classList.toggle('hidden', tab !== 'chats');
}

// ── MODAL ─────────────────────────────────────────────────────────────────────

function showAddContact() {
    document.getElementById('add-contact-modal').classList.remove('hidden');
    document.getElementById('contact-search').focus();
}

function closeModal() {
    document.getElementById('add-contact-modal').classList.add('hidden');
    document.getElementById('contact-search').value = '';
    document.getElementById('contact-search-results').innerHTML = '';
}

document.getElementById('add-contact-modal').onclick = (e) => {
    if (e.target === e.currentTarget) closeModal();
};

// ── NOTIFICATION ──────────────────────────────────────────────────────────────

let notifTimer = null;

function showNotification(title, body) {
    const el = document.getElementById('notification');
    el.innerHTML = `<div class="notif-title">${esc(title)}</div><div class="notif-body">${esc(body)}</div>`;
    el.classList.remove('hidden');
    clearTimeout(notifTimer);
    notifTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

document.getElementById('notification').onclick = () => {
    document.getElementById('notification').classList.add('hidden');
};

// ── UTILS ─────────────────────────────────────────────────────────────────────

async function apiFetch(url, method = 'GET', body = null) {
    const opts = {
        method,
        headers: { 'Authorization': `Bearer ${token}` },
    };
    if (body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    return fetch(API + url, opts);
}

function esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function scrollToBottom() {
    const c = document.getElementById('messages-container');
    c.scrollTop = c.scrollHeight;
}

function formatTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr + (isoStr.endsWith('Z') ? '' : 'Z'));
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}
