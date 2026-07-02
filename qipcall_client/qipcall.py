"""
JeffTUN VPN — десктопный клиент для Windows.
Вставь ключ (vless:// / vmess:// / trojan:// / ss://) или ссылку-подписку,
нажми «Подключиться» — трафик пойдёт через VPN (системный прокси + xray-core).
"""
import os
import sys
import json
import time
import base64
import socket
import threading
import subprocess
import urllib.request
from urllib.parse import urlparse, parse_qs, unquote

import tkinter as tk
from tkinter import ttk, messagebox

APP_NAME = "JeffTUN VPN"
APP_VERSION = "2.5"
VERSION_URL = "https://raw.githubusercontent.com/kerimlirashad/kerimlirashad/claude/icq-messenger-b0bt2n/qipcall_client/version.txt"
RELEASES_URL = "https://github.com/kerimlirashad/kerimlirashad/releases/tag/qipcall-latest"
DOWNLOAD_BASE = "https://github.com/kerimlirashad/kerimlirashad/releases/download/qipcall-latest"
TELEGRAM_URL = "https://t.me/jeffvpn"
SOCKS_PORT = 10808
HTTP_PORT = 10809
CONFIG_FILE = os.path.join(os.path.expanduser("~"), ".jeffton_config.json")

# ── Тёмная тема ───────────────────────────────────────────────────────────────
BG = "#0a0e17"
CARD = "#141b2b"
CARD2 = "#0d121d"
ACC = "#5b8def"
ACC2 = "#7c5cff"
TEXT = "#eef2f9"
MUTED = "#8a97ad"
OK = "#3fce6a"
WARN = "#f5b942"
DANGER = "#f87171"
BORDER = "#242c3d"


def resource_path(name):
    """Путь к xray.exe — рядом с программой или во временной папке PyInstaller."""
    candidates = []
    if hasattr(sys, "_MEIPASS"):
        candidates.append(os.path.join(sys._MEIPASS, name))
    candidates.append(os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), name))
    candidates.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), name))
    for c in candidates:
        if os.path.exists(c):
            return c
    return name


# ══ ПАРСИНГ КЛЮЧЕЙ В OUTBOUND xray ═══════════════════════════════════════════
def parse_link(link: str) -> dict:
    link = link.strip()
    if link.startswith("vless://"):
        return _parse_vless(link)
    if link.startswith("vmess://"):
        return _parse_vmess(link)
    if link.startswith("trojan://"):
        return _parse_trojan(link)
    if link.startswith("ss://"):
        return _parse_ss(link)
    raise ValueError("Неизвестный формат. Нужен vless / vmess / trojan / ss.")


def link_host_port(link: str):
    """Возвращает (host, port) из ключа — для пинга."""
    link = link.strip()
    try:
        if link.startswith("vmess://"):
            raw = link[len("vmess://"):]; raw += "=" * (-len(raw) % 4)
            obj = json.loads(base64.b64decode(raw).decode())
            return obj.get("add"), int(obj.get("port", 443))
        u = urlparse(link)
        return u.hostname, u.port or 443
    except Exception:
        return None, None


COUNTRY_CODES = {
    "france": "FR", "franc": "FR", "germany": "DE", "german": "DE",
    "finland": "FI", "finl": "FI", "usa": "US", "america": "US", "united states": "US",
    "malaysia": "MY", "malay": "MY", "netherlands": "NL", "holland": "NL",
    "russia": "RU", "moscow": "RU", "uk": "GB", "london": "GB", "england": "GB",
    "poland": "PL", "sweden": "SE", "turkey": "TR", "turkiye": "TR",
    "japan": "JP", "singapore": "SG", "canada": "CA", "france ": "FR",
    "spain": "ES", "italy": "IT", "ukraine": "UA", "latvia": "LV",
    "estonia": "EE", "lithuania": "LT", "switzerland": "CH", "austria": "AT",
    "hongkong": "HK", "hong kong": "HK", "korea": "KR", "india": "IN",
    "uae": "AE", "dubai": "AE", "kazakhstan": "KZ", "georgia": "GE",
}


def country_of(name: str):
    """Возвращает (код_страны, флаг_emoji) по названию сервера."""
    low = (name or "").lower()
    code = None
    for key, c in COUNTRY_CODES.items():
        if key in low:
            code = c
            break
    if not code:
        # первые 2 буквы из названия
        letters = "".join(ch for ch in (name or "?") if ch.isalpha())
        code = (letters[:2] or "VP").upper()
    # флаг из regional indicator (на некоторых ОС не рисуется — тогда виден код)
    flag = "".join(chr(0x1F1E6 + ord(ch) - ord("A")) for ch in code) if len(code) == 2 else ""
    return code, flag


def proto_line(link: str) -> str:
    """Строка протокола для подписи, напр. 'VLESS · TCP · Reality'."""
    try:
        scheme = link.split("://", 1)[0].upper()
        if link.startswith("vmess://"):
            raw = link[8:]; raw += "=" * (-len(raw) % 4)
            obj = json.loads(base64.b64decode(raw).decode())
            net = obj.get("net", "tcp").upper()
            sec = "TLS" if obj.get("tls") else "—"
            return f"VMESS · {net} · {sec}"
        p = parse_qs(urlparse(link).query)
        net = p.get("type", ["tcp"])[0].upper()
        sec = p.get("security", ["none"])[0]
        sec = {"reality": "Reality", "tls": "TLS", "none": "—"}.get(sec, sec.title())
        return f"{scheme} · {net} · {sec}"
    except Exception:
        return link.split("://", 1)[0].upper()


def _stream(params, net, security):
    ss = {"network": net}
    if security == "reality":
        ss["security"] = "reality"
        ss["realitySettings"] = {
            "serverName": params.get("sni", [""])[0],
            "fingerprint": params.get("fp", ["chrome"])[0],
            "publicKey": params.get("pbk", [""])[0],
            "shortId": params.get("sid", [""])[0],
            "spiderX": params.get("spx", [""])[0],
        }
    elif security == "tls":
        ss["security"] = "tls"
        ss["tlsSettings"] = {
            "serverName": params.get("sni", [params.get("host", [""])[0]])[0],
            "fingerprint": params.get("fp", ["chrome"])[0],
            "allowInsecure": params.get("allowInsecure", ["0"])[0] in ("1", "true"),
        }
    if net == "ws":
        ss["wsSettings"] = {
            "path": params.get("path", ["/"])[0],
            "headers": {"Host": params.get("host", [""])[0]} if params.get("host") else {},
        }
    elif net == "grpc":
        ss["grpcSettings"] = {"serviceName": params.get("serviceName", [""])[0]}
    return ss


def _parse_vless(link):
    u = urlparse(link); p = parse_qs(u.query)
    net = p.get("type", ["tcp"])[0]; security = p.get("security", ["none"])[0]
    vnext = {"address": u.hostname, "port": u.port or 443,
             "users": [{"id": unquote(u.username or ""), "encryption": "none",
                        "flow": p.get("flow", [""])[0]}]}
    return {"protocol": "vless", "settings": {"vnext": [vnext]},
            "streamSettings": _stream(p, net, security), "tag": "proxy"}


def _parse_vmess(link):
    raw = link[len("vmess://"):]; raw += "=" * (-len(raw) % 4)
    obj = json.loads(base64.b64decode(raw).decode())
    net = obj.get("net", "tcp")
    security = "tls" if obj.get("tls") in ("tls", True, "true") else "none"
    p = {"path": [obj.get("path", "/")], "host": [obj.get("host", "")],
         "sni": [obj.get("sni", obj.get("host", ""))], "serviceName": [obj.get("path", "")]}
    vnext = {"address": obj.get("add"), "port": int(obj.get("port", 443)),
             "users": [{"id": obj.get("id"), "alterId": int(obj.get("aid", 0)), "security": "auto"}]}
    return {"protocol": "vmess", "settings": {"vnext": [vnext]},
            "streamSettings": _stream(p, net, security), "tag": "proxy"}


def _parse_trojan(link):
    u = urlparse(link); p = parse_qs(u.query)
    net = p.get("type", ["tcp"])[0]; security = p.get("security", ["tls"])[0]
    return {"protocol": "trojan", "settings": {"servers": [{
                "address": u.hostname, "port": u.port or 443,
                "password": unquote(u.username or "")}]},
            "streamSettings": _stream(p, net, security), "tag": "proxy"}


def _parse_ss(link):
    body = link[len("ss://"):]
    if "#" in body:
        body = body.split("#", 1)[0]
    if "@" in body:
        userinfo, server = body.split("@", 1)
        userinfo += "=" * (-len(userinfo) % 4)
        try:
            method, password = base64.b64decode(userinfo).decode().split(":", 1)
        except Exception:
            method, password = unquote(userinfo).split(":", 1)
    else:
        body += "=" * (-len(body) % 4)
        creds, server = base64.b64decode(body).decode().split("@", 1)
        method, password = creds.split(":", 1)
    host, port = server.split(":")
    port = int(port.split("/")[0].split("?")[0])
    return {"protocol": "shadowsocks", "settings": {"servers": [{
                "address": host, "port": port, "method": method, "password": password}]},
            "tag": "proxy"}


def build_xray_config(outbound: dict) -> dict:
    return {
        "log": {"loglevel": "warning"},
        "inbounds": [
            {"tag": "socks", "port": SOCKS_PORT, "listen": "127.0.0.1",
             "protocol": "socks", "settings": {"udp": True}},
            {"tag": "http", "port": HTTP_PORT, "listen": "127.0.0.1", "protocol": "http"},
        ],
        "outbounds": [outbound, {"protocol": "freedom", "tag": "direct"}],
    }


# ══ СИСТЕМНЫЙ ПРОКСИ WINDOWS ═════════════════════════════════════════════════
def set_system_proxy(enable: bool):
    if sys.platform == "darwin":
        _set_mac_proxy(enable)
        return
    if os.name != "nt":
        _set_linux_proxy(enable)
        return
    import winreg, ctypes
    key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
        r"Software\Microsoft\Windows\CurrentVersion\Internet Settings",
        0, winreg.KEY_ALL_ACCESS)
    if enable:
        winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, 1)
        winreg.SetValueEx(key, "ProxyServer", 0, winreg.REG_SZ, f"127.0.0.1:{HTTP_PORT}")
        winreg.SetValueEx(key, "ProxyOverride", 0, winreg.REG_SZ,
                          "localhost;127.*;10.*;172.16.*;192.168.*;<local>")
    else:
        winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, 0)
    winreg.CloseKey(key)
    internet = ctypes.windll.Wininet
    internet.InternetSetOptionW(0, 39, 0, 0)
    internet.InternetSetOptionW(0, 37, 0, 0)


def _set_mac_proxy(enable: bool):
    """Системный прокси в macOS через networksetup (Wi-Fi + Ethernet)."""
    def services():
        try:
            out = subprocess.check_output(["networksetup", "-listallnetworkservices"]).decode()
            return [s.strip() for s in out.splitlines()[1:] if s.strip() and not s.startswith("*")]
        except Exception:
            return ["Wi-Fi"]

    for svc in services():
        try:
            if enable:
                subprocess.run(["networksetup", "-setwebproxy", svc, "127.0.0.1", str(HTTP_PORT)], check=False)
                subprocess.run(["networksetup", "-setsecurewebproxy", svc, "127.0.0.1", str(HTTP_PORT)], check=False)
                subprocess.run(["networksetup", "-setsocksfirewallproxy", svc, "127.0.0.1", str(SOCKS_PORT)], check=False)
            else:
                subprocess.run(["networksetup", "-setwebproxystate", svc, "off"], check=False)
                subprocess.run(["networksetup", "-setsecurewebproxystate", svc, "off"], check=False)
                subprocess.run(["networksetup", "-setsocksfirewallproxystate", svc, "off"], check=False)
        except Exception:
            pass


def _set_linux_proxy(enable: bool):
    """Системный прокси в Linux через gsettings (GNOME/Cinnamon/Mate)."""
    def g(*args):
        try:
            subprocess.run(["gsettings"] + list(args), check=False,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
    if enable:
        g("set", "org.gnome.system.proxy", "mode", "manual")
        for proto in ("http", "https"):
            g("set", f"org.gnome.system.proxy.{proto}", "host", "127.0.0.1")
            g("set", f"org.gnome.system.proxy.{proto}", "port", str(HTTP_PORT))
        g("set", "org.gnome.system.proxy.socks", "host", "127.0.0.1")
        g("set", "org.gnome.system.proxy.socks", "port", str(SOCKS_PORT))
    else:
        g("set", "org.gnome.system.proxy", "mode", "none")


# ══ АВТОЗАПУСК С СИСТЕМОЙ (Windows) ══════════════════════════════════════════
def set_autostart(enable: bool):
    if os.name != "nt" or not getattr(sys, "frozen", False):
        return
    import winreg
    key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
        r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_ALL_ACCESS)
    if enable:
        winreg.SetValueEx(key, "JeffTUN", 0, winreg.REG_SZ, f'"{sys.executable}"')
    else:
        try: winreg.DeleteValue(key, "JeffTUN")
        except Exception: pass
    winreg.CloseKey(key)


def get_autostart() -> bool:
    if os.name != "nt":
        return False
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run")
        winreg.QueryValueEx(key, "JeffTUN")
        winreg.CloseKey(key)
        return True
    except Exception:
        return False


# ══ ЗАГРУЗКА ПОДПИСКИ ════════════════════════════════════════════════════════
def fetch_subscription(url: str) -> list:
    ctx = None
    try:
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    except Exception:
        pass
    req = urllib.request.Request(url, headers={"User-Agent": "JeffTUN"})
    with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
        data = r.read().decode().strip()
    try:
        decoded = base64.b64decode(data + "=" * (-len(data) % 4)).decode()
        if "://" in decoded:
            data = decoded
    except Exception:
        pass
    return [ln.strip() for ln in data.splitlines() if "://" in ln]


def tcp_ping(host, port, timeout=3.0):
    """Возвращает пинг в мс или None."""
    try:
        start = time.time()
        s = socket.create_connection((host, port), timeout=timeout)
        s.close()
        return int((time.time() - start) * 1000)
    except Exception:
        return None


# ══ GUI ══════════════════════════════════════════════════════════════════════
class JeffTUN:
    def __init__(self, root):
        self.root = root
        self.proc = None
        self.connected = False
        self.links = []
        self.sub_url = ""
        self.autoconnect = False

        root.title(APP_NAME)
        root.geometry("460x640")
        root.configure(bg=BG)
        root.resizable(False, False)

        # ── Заголовок ──
        header = tk.Frame(root, bg=BG)
        header.pack(fill="x", padx=26, pady=(24, 2))
        logo = tk.Frame(header, bg=BG)
        logo.pack(side="left")
        tk.Label(logo, text="Jeff", bg=BG, fg=TEXT, font=("Segoe UI", 26, "bold")).pack(side="left")
        tk.Label(logo, text="TUN", bg=BG, fg=ACC, font=("Segoe UI", 26, "bold")).pack(side="left")
        tk.Label(header, text="VPN", bg=BG, fg=MUTED, font=("Segoe UI", 11, "bold")).pack(side="left", padx=(6, 0), pady=(12, 0))
        tk.Button(header, text="⚙", command=self.open_settings, bg=BG, fg=MUTED,
                  relief="flat", font=("Segoe UI", 18), cursor="hand2", bd=0,
                  activebackground=BG, activeforeground=TEXT).pack(side="right", pady=(6, 0))

        tk.Label(root, text="Вставь ключ или ссылку-подписку и подключись",
                 bg=BG, fg=MUTED, font=("Segoe UI", 10)).pack(padx=26, anchor="w", pady=(0, 12))

        # ── Плашка обновления (скрыта пока нет апдейта) ──
        self.update_bar = tk.Frame(root, bg="#1a2c1e", highlightthickness=1, highlightbackground=OK)
        self._update_lbl = tk.Label(self.update_bar, text="", bg="#1a2c1e", fg=OK,
                                    font=("Segoe UI", 10, "bold"))
        self._update_lbl.pack(side="left", padx=14, pady=9)
        tk.Button(self.update_bar, text="Обновить ⬇", command=self.do_self_update,
                  bg=OK, fg="#0a0e17", relief="flat", cursor="hand2", bd=0,
                  font=("Segoe UI", 9, "bold"), padx=14, pady=7).pack(side="right", padx=10)

        # ── Карта ключа ──
        card = tk.Frame(root, bg=CARD, highlightthickness=1, highlightbackground=BORDER)
        card.pack(fill="x", padx=26)
        tk.Label(card, text="КЛЮЧ / ПОДПИСКА", bg=CARD, fg=MUTED,
                 font=("Segoe UI", 8, "bold")).pack(anchor="w", padx=16, pady=(14, 6))
        self.txt = tk.Text(card, height=4, bg=CARD2, fg=TEXT, insertbackground=ACC,
                           relief="flat", font=("Consolas", 9), wrap="word",
                           highlightthickness=1, highlightbackground=BORDER, padx=10, pady=8)
        self.txt.pack(fill="x", padx=16, pady=(0, 8))
        self._setup_paste(self.txt)

        paste_row = tk.Frame(card, bg=CARD)
        paste_row.pack(fill="x", padx=16, pady=(0, 14))
        self._chip(paste_row, "📋 Вставить", self.paste_clipboard, ACC).pack(side="left")
        self._chip(paste_row, "✖ Очистить", lambda: self.txt.delete("1.0", "end"), "#2a3346").pack(side="left", padx=6)
        self._chip(paste_row, "💾 Сохранить", self.save, "#2a3346").pack(side="left")

        # ── Список серверов (страны с флагами) ──
        self.selected_idx = 0
        self.server_rows = []
        self.server_box = tk.Frame(root, bg=BG)
        tk.Label(self.server_box, text="СЕРВЕРЫ", bg=BG, fg=MUTED,
                 font=("Segoe UI", 8, "bold")).pack(anchor="w", padx=26, pady=(14, 4))
        self.server_list = tk.Frame(self.server_box, bg=BG)
        self.server_list.pack(fill="x", padx=20)
        # Пока серверов нет — прячем
        self.server_box.pack(fill="x")
        self.server_box.pack_forget()

        # ── Пинг ──
        self.ping_lbl = tk.Label(root, text="", bg=BG, fg=MUTED, font=("Segoe UI", 10, "bold"))
        self.ping_lbl.pack(pady=(12, 2))

        # ── Статус + кнопка ──
        self.status = tk.Label(root, text="● Отключено", bg=BG, fg=MUTED, font=("Segoe UI", 13, "bold"))
        self.status.pack(pady=(4, 10))

        self.btn = tk.Button(root, text="Подключиться", command=self.toggle,
                             bg=ACC, fg="white", relief="flat", cursor="hand2",
                             font=("Segoe UI", 15, "bold"), width=22, height=2,
                             activebackground=ACC2, activeforeground="white", bd=0)
        self.btn.pack(pady=4)
        self.btn.bind("<Enter>", lambda e: self.btn.config(bg=(DANGER if self.connected else ACC2)))
        self.btn.bind("<Leave>", lambda e: self.btn.config(bg=(DANGER if self.connected else ACC)))

        # ── Нижние действия ──
        row = tk.Frame(root, bg=BG)
        row.pack(pady=14)
        self._chip(row, "🔄 Загрузить подписку", self.load_sub, CARD).pack(side="left", padx=4)
        self._chip(row, "📶 Пинг", self.do_ping, CARD).pack(side="left", padx=4)
        self._chip(row, "⬆ Обновить подписку", self.update_sub, CARD).pack(side="left", padx=4)

        self.info = tk.Label(root, text="", bg=BG, fg=MUTED, font=("Segoe UI", 9),
                             wraplength=410, justify="center")
        self.info.pack(pady=(6, 0))

        tk.Label(root, text=f"JeffTUN v{APP_VERSION}", bg=BG, fg="#3a4256",
                 font=("Segoe UI", 8)).pack(side="bottom", pady=6)

        self.load_saved()
        self.refresh_from_box()
        self.txt.bind("<KeyRelease>", lambda e: self._debounce_refresh())
        self.check_update()
        if self.autoconnect and self.links:
            self.root.after(800, self.connect)
        root.protocol("WM_DELETE_WINDOW", self.on_close)

    _refresh_timer = None
    def _debounce_refresh(self):
        if self._refresh_timer:
            self.root.after_cancel(self._refresh_timer)
        self._refresh_timer = self.root.after(600, self.refresh_from_box)

    # ── UI helpers ──
    def _chip(self, parent, text, cmd, color):
        return tk.Button(parent, text=text, command=cmd, bg=color, fg=TEXT, relief="flat",
                         font=("Segoe UI", 9), cursor="hand2", activebackground=ACC,
                         activeforeground="white", bd=0, padx=12, pady=7)

    # ── Фикс вставки (Ctrl+V не работает на рус. раскладке в tkinter) ──
    def _setup_paste(self, widget):
        menu = tk.Menu(widget, tearoff=0, bg=CARD, fg=TEXT,
                       activebackground=ACC, activeforeground="white")
        menu.add_command(label="Вставить", command=self.paste_clipboard)
        menu.add_command(label="Копировать", command=lambda: self._copy(widget))
        menu.add_command(label="Выделить всё", command=lambda: self._select_all(widget))
        menu.add_command(label="Очистить", command=lambda: widget.delete("1.0", "end"))

        def popup(e):
            try: menu.tk_popup(e.x_root, e.y_root)
            finally: menu.grab_release()
        widget.bind("<Button-3>", popup)

        def on_key(e):
            if e.keycode == 86: self.paste_clipboard(); return "break"
            if e.keycode == 67: self._copy(widget); return "break"
            if e.keycode == 88: self._copy(widget);
            if e.keycode == 65: self._select_all(widget); return "break"
        widget.bind("<Control-KeyPress>", on_key)

    def paste_clipboard(self):
        try:
            data = self.root.clipboard_get()
        except Exception:
            self.info.config(text="Буфер пуст", fg=DANGER); return
        try:
            self.txt.delete("sel.first", "sel.last")
        except Exception:
            pass
        self.txt.insert("insert", data)
        self.refresh_from_box()

    def refresh_from_box(self):
        """Всегда строим список серверов из вставленных ключей (страны + пинг)."""
        t = self.txt.get("1.0", "end").strip()
        lines = [l.strip() for l in t.splitlines()
                 if "://" in l and not l.strip().startswith("http")]
        if lines:
            self.links = lines
            if self.selected_idx >= len(self.links):
                self.selected_idx = 0
            self.render_servers()
            self.do_ping()
        else:
            self.links = []
            self.server_box.pack_forget()

    def _copy(self, widget):
        try:
            self.root.clipboard_clear()
            self.root.clipboard_append(widget.get("sel.first", "sel.last"))
        except Exception:
            pass

    def _select_all(self, widget):
        widget.tag_add("sel", "1.0", "end-1c")
        return "break"

    # ── Обновление приложения ──
    def check_update(self):
        def worker():
            try:
                import ssl
                ctx = ssl.create_default_context()
                ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
                req = urllib.request.Request(VERSION_URL, headers={"User-Agent": "JeffTUN"})
                latest = urllib.request.urlopen(req, timeout=10, context=ctx).read().decode().strip()
                if latest and self._newer(latest, APP_VERSION):
                    self.root.after(0, lambda: self._show_update(latest))
            except Exception:
                pass
        threading.Thread(target=worker, daemon=True).start()

    @staticmethod
    def _newer(a, b):
        try:
            return [int(x) for x in a.split(".")] > [int(x) for x in b.split(".")]
        except Exception:
            return a != b

    def _show_update(self, latest):
        # Показываем зелёную плашку с кнопкой прямо в окне
        self._update_lbl.config(text=f"🎉 Доступно обновление {latest} (у тебя {APP_VERSION})")
        self.update_bar.pack(fill="x", padx=26, pady=(0, 12), before=self.txt.master)

    # ── Окно настроек ──
    def open_settings(self):
        win = tk.Toplevel(self.root)
        win.title("Настройки")
        win.configure(bg=BG)
        win.geometry("420x560")
        win.resizable(False, False)
        win.transient(self.root)

        tk.Label(win, text="Настройки", bg=BG, fg=TEXT,
                 font=("Segoe UI", 18, "bold")).pack(pady=(18, 10))

        def section(title):
            tk.Label(win, text=title, bg=BG, fg=MUTED,
                     font=("Segoe UI", 8, "bold")).pack(anchor="w", padx=24, pady=(14, 4))
            card = tk.Frame(win, bg=CARD, highlightthickness=1, highlightbackground=BORDER)
            card.pack(fill="x", padx=20)
            return card

        def toggle_row(card, text, var, cmd):
            row = tk.Frame(card, bg=CARD); row.pack(fill="x", padx=14, pady=10)
            tk.Label(row, text=text, bg=CARD, fg=TEXT, font=("Segoe UI", 11)).pack(side="left")
            b = tk.Checkbutton(row, variable=var, command=cmd, bg=CARD, fg=ACC,
                               selectcolor=CARD2, activebackground=CARD, bd=0,
                               highlightthickness=0)
            b.pack(side="right")

        def link_row(card, text, value, cmd, color=TEXT):
            row = tk.Frame(card, bg=CARD, cursor="hand2"); row.pack(fill="x", padx=14, pady=10)
            tk.Label(row, text=text, bg=CARD, fg=color, font=("Segoe UI", 11)).pack(side="left")
            tk.Label(row, text=value, bg=CARD, fg=MUTED, font=("Segoe UI", 10)).pack(side="right")
            for w in (row,) + tuple(row.winfo_children()):
                w.bind("<Button-1>", lambda e: cmd())

        # ИНТЕРФЕЙС
        c1 = section("ИНТЕРФЕЙС")
        self._autostart_var = tk.BooleanVar(value=get_autostart())
        toggle_row(c1, "Автозапуск с Windows", self._autostart_var,
                   lambda: set_autostart(self._autostart_var.get()))
        self._autoconnect_var = tk.BooleanVar(value=self.autoconnect)
        def save_ac():
            self.autoconnect = self._autoconnect_var.get(); self.save(silent=True)
        toggle_row(c1, "Автоподключение при запуске", self._autoconnect_var, save_ac)

        # ТУННЕЛЬ / ДАННЫЕ
        c2 = section("ДАННЫЕ")
        link_row(c2, "Пинг выбранного сервера", "▶", lambda: (self.do_ping()))
        link_row(c2, "Обновить подписку", "⬆", lambda: self.update_sub())
        link_row(c2, "Сбросить ключ", "", self._reset_key, color=DANGER)

        # ПОДРОБНЕЕ
        c3 = section("ПОДРОБНЕЕ")
        link_row(c3, "Проверить обновление", f"v{APP_VERSION}", self.do_self_update)
        link_row(c3, "Telegram-канал", "@jeffvpn",
                 lambda: __import__("webbrowser").open(TELEGRAM_URL), color=ACC)
        link_row(c3, "О приложении", "", lambda: self._about())

        tk.Label(win, text=f"JeffTUN VPN v{APP_VERSION}", bg=BG, fg="#3a4256",
                 font=("Segoe UI", 8)).pack(side="bottom", pady=10)

    def _reset_key(self):
        if not messagebox.askyesno(APP_NAME, "Удалить сохранённый ключ и серверы?"):
            return
        self.txt.delete("1.0", "end")
        self.links = []; self.sub_url = ""; self.selected_idx = 0
        self.server_box.pack_forget()
        try: os.remove(CONFIG_FILE)
        except Exception: pass
        self.info.config(text="Ключ сброшен", fg=MUTED)

    def _about(self):
        messagebox.showinfo("О приложении",
            f"JeffTUN VPN v{APP_VERSION}\n\n"
            "Быстрый VPN с обходом блокировок.\n"
            "Протоколы: VLESS (Reality), VMess, Trojan, Shadowsocks.\n\n"
            "Telegram: t.me/jeffvpn")

    def do_self_update(self):
        """Скачивает новую версию и заменяет программу автоматически."""
        # На macOS .dmg заменить на лету нельзя — открываем страницу
        if sys.platform == "darwin":
            import webbrowser; webbrowser.open(RELEASES_URL); return

        if not getattr(sys, "frozen", False):
            import webbrowser; webbrowser.open(RELEASES_URL); return  # запуск из исходников

        asset = "JeffTUN.exe" if os.name == "nt" else "JeffTUN-linux"
        url = f"{DOWNLOAD_BASE}/{asset}"
        cur = sys.executable
        new = cur + ".new"

        self._update_lbl.config(text="⏳ Скачиваю обновление...")
        self.root.update()

        def worker():
            try:
                import ssl
                ctx = ssl.create_default_context()
                ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
                req = urllib.request.Request(url, headers={"User-Agent": "JeffTUN"})
                with urllib.request.urlopen(req, timeout=120, context=ctx) as r, open(new, "wb") as f:
                    f.write(r.read())
                self.root.after(0, lambda: self._apply_update(cur, new))
            except Exception as e:
                self.root.after(0, lambda: self._update_lbl.config(text=f"Ошибка загрузки: {e}"))
        threading.Thread(target=worker, daemon=True).start()

    def _apply_update(self, cur, new):
        if self.connected:
            self.disconnect()
        try:
            if os.name == "nt":
                # bat ждёт выхода приложения, подменяет exe и запускает заново
                bat = cur + "_upd.bat"
                with open(bat, "w") as f:
                    f.write(
                        "@echo off\r\n"
                        "timeout /t 2 /nobreak >nul\r\n"
                        f'move /y "{new}" "{cur}" >nul\r\n'
                        f'start "" "{cur}"\r\n'
                        f'del "%~f0"\r\n'
                    )
                subprocess.Popen(["cmd", "/c", bat],
                                 creationflags=subprocess.CREATE_NO_WINDOW)
            else:
                os.chmod(new, 0o755)
                sh = cur + "_upd.sh"
                with open(sh, "w") as f:
                    f.write(f'#!/bin/sh\nsleep 2\nmv -f "{new}" "{cur}"\nchmod +x "{cur}"\nnohup "{cur}" >/dev/null 2>&1 &\nrm -- "$0"\n')
                os.chmod(sh, 0o755)
                subprocess.Popen(["/bin/sh", sh])
            self.root.after(300, self.on_close)
        except Exception as e:
            self._update_lbl.config(text=f"Не удалось обновить: {e}")

    # ── Сохранение / загрузка ──
    def save(self, silent=False):
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump({"key": self.txt.get("1.0", "end").strip(),
                           "sub_url": self.sub_url,
                           "autoconnect": self.autoconnect}, f)
            if not silent:
                self.info.config(text="Сохранено ✓", fg=OK)
        except Exception as e:
            if not silent:
                self.info.config(text=f"Ошибка сохранения: {e}", fg=DANGER)

    def load_saved(self):
        try:
            with open(CONFIG_FILE, encoding="utf-8") as f:
                d = json.load(f)
                if d.get("key"):
                    self.txt.insert("1.0", d["key"])
                self.sub_url = d.get("sub_url", "")
                self.autoconnect = bool(d.get("autoconnect", False))
        except Exception:
            pass

    def load_sub(self):
        url = self.txt.get("1.0", "end").strip().splitlines()[0] if self.txt.get("1.0", "end").strip() else ""
        if not url.startswith("http"):
            messagebox.showinfo(APP_NAME, "Вставь ссылку-подписку (https://...) в поле, затем нажми эту кнопку.")
            return
        self.sub_url = url
        self._pull_sub()

    def update_sub(self):
        if not self.sub_url:
            messagebox.showinfo(APP_NAME, "Сначала загрузи подписку — вставь ссылку https://... и нажми «Загрузить подписку».")
            return
        self._pull_sub(reconnect=True)

    def _pull_sub(self, reconnect=False):
        self.info.config(text="Обновление подписки...", fg=MUTED); self.root.update()
        try:
            self.links = fetch_subscription(self.sub_url)
            if not self.links:
                self.info.config(text="Подписка пустая", fg=DANGER); return
            self.selected_idx = 0
            self.render_servers()
            self.info.config(text=f"Серверов: {len(self.links)} ✓", fg=OK)
            self.do_ping()
            if reconnect and self.connected:
                self.disconnect(); self.connect()
        except Exception as e:
            self.info.config(text=f"Ошибка: {e}", fg=DANGER)

    def render_servers(self):
        """Строит красивый список серверов с флагами и протоколом."""
        for w in self.server_list.winfo_children():
            w.destroy()
        self.server_rows = []
        for i, ln in enumerate(self.links):
            name = unquote(ln.split("#", 1)[1]) if "#" in ln else f"Сервер {i+1}"
            code, flag = country_of(name)
            sel = (i == self.selected_idx)
            row = tk.Frame(self.server_list, bg=(CARD if sel else CARD2),
                           highlightthickness=1,
                           highlightbackground=(ACC if sel else BORDER))
            row.pack(fill="x", pady=3)
            # цветной бейдж с кодом страны (флаги на Windows не рисуются)
            badge = tk.Label(row, text=code, bg=ACC, fg="white",
                             font=("Segoe UI", 11, "bold"), width=4, pady=8)
            badge.pack(side="left", padx=(8, 10), pady=8)
            mid = tk.Frame(row, bg=row["bg"]); mid.pack(side="left", fill="x", expand=True)
            tk.Label(mid, text=name, bg=row["bg"], fg=TEXT,
                     font=("Segoe UI", 12, "bold"), anchor="w").pack(anchor="w")
            tk.Label(mid, text=proto_line(ln), bg=row["bg"], fg=MUTED,
                     font=("Segoe UI", 8), anchor="w").pack(anchor="w")
            arrow = tk.Label(row, text=("✓" if sel else "›"), bg=row["bg"],
                             fg=(OK if sel else MUTED), font=("Segoe UI", 14, "bold"))
            arrow.pack(side="right", padx=12)
            # клик по любому элементу строки
            for w in (row, mid, arrow) + tuple(mid.winfo_children()):
                w.bind("<Button-1>", lambda e, idx=i: self.select_server(idx))
            self.server_rows.append(row)
        self.server_box.pack(fill="x", before=self.ping_lbl)

    def select_server(self, idx):
        self.selected_idx = idx
        self.render_servers()
        self.do_ping()
        if self.connected:
            self.disconnect(); self.connect()

    # ── Пинг ──
    def do_ping(self):
        link = self._current_link()
        if not link or link.startswith("http"):
            self.ping_lbl.config(text="")
            return
        host, port = link_host_port(link)
        if not host:
            return
        self.ping_lbl.config(text="Пинг...", fg=MUTED); self.root.update()
        def worker():
            ms = tcp_ping(host, port)
            def show():
                if ms is None:
                    self.ping_lbl.config(text="📶 Сервер недоступен", fg=DANGER)
                else:
                    col = OK if ms < 150 else (WARN if ms < 400 else DANGER)
                    self.ping_lbl.config(text=f"📶 {ms} мс", fg=col)
            self.root.after(0, show)
        threading.Thread(target=worker, daemon=True).start()

    # ── Подключение ──
    def toggle(self):
        self.disconnect() if self.connected else self.connect()

    def _current_link(self):
        if self.links and 0 <= self.selected_idx < len(self.links):
            return self.links[self.selected_idx]
        t = self.txt.get("1.0", "end").strip()
        return t.splitlines()[0] if t else ""

    def connect(self):
        link = self._current_link()
        if not link:
            self.info.config(text="Вставь ключ", fg=DANGER); return
        if link.startswith("http"):
            self.info.config(text="Это подписка — нажми «Загрузить подписку» и выбери сервер", fg=DANGER); return
        try:
            outbound = parse_link(link)
        except Exception as e:
            self.info.config(text=f"Неверный ключ: {e}", fg=DANGER); return

        xray = resource_path("xray.exe" if os.name == "nt" else "xray")
        if not os.path.exists(xray):
            self.info.config(text="Не найден xray.exe рядом с программой", fg=DANGER); return

        cfg_path = os.path.join(os.path.dirname(CONFIG_FILE), ".jeffton_xray.json")
        with open(cfg_path, "w", encoding="utf-8") as f:
            json.dump(build_xray_config(outbound), f)

        try:
            flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            self.proc = subprocess.Popen([xray, "run", "-config", cfg_path],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags)
        except Exception as e:
            self.info.config(text=f"Не удалось запустить ядро: {e}", fg=DANGER); return

        try:
            set_system_proxy(True)
        except Exception as e:
            self.info.config(text=f"Прокси не установлен: {e}", fg=DANGER)

        self.connected = True
        self.status.config(text="● Подключено", fg=OK)
        self.btn.config(text="Отключиться", bg=DANGER, activebackground="#c0392b")
        self.info.config(text="VPN активен. Весь трафик идёт через сервер.", fg=OK)

    def disconnect(self):
        try: set_system_proxy(False)
        except Exception: pass
        if self.proc:
            try: self.proc.terminate()
            except Exception: pass
            self.proc = None
        self.connected = False
        self.status.config(text="● Отключено", fg=MUTED)
        self.btn.config(text="Подключиться", bg=ACC, activebackground=ACC2)
        self.info.config(text="VPN выключен.", fg=MUTED)

    def on_close(self):
        if self.connected:
            self.disconnect()
        self.root.destroy()


def main():
    root = tk.Tk()
    try:
        style = ttk.Style(); style.theme_use("clam")
        style.configure("TCombobox", fieldbackground=CARD, background=CARD,
                        foreground=TEXT, arrowcolor=TEXT, bordercolor=BORDER,
                        selectbackground=ACC, padding=8)
    except Exception:
        pass
    JeffTUN(root)
    root.mainloop()


if __name__ == "__main__":
    main()
