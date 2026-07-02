"""
JeffTON VPN — десктопный клиент для Windows.
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

APP_NAME = "JeffTON VPN"
APP_VERSION = "2.0"
VERSION_URL = "https://raw.githubusercontent.com/kerimlirashad/kerimlirashad/claude/icq-messenger-b0bt2n/qipcall_client/version.txt"
RELEASES_URL = "https://github.com/kerimlirashad/kerimlirashad/releases/tag/qipcall-latest"
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
    if os.name != "nt":
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
    req = urllib.request.Request(url, headers={"User-Agent": "JeffTON"})
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
class JeffTON:
    def __init__(self, root):
        self.root = root
        self.proc = None
        self.connected = False
        self.links = []
        self.sub_url = ""

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
        tk.Label(logo, text="TON", bg=BG, fg=ACC, font=("Segoe UI", 26, "bold")).pack(side="left")
        tk.Label(header, text="VPN", bg=BG, fg=MUTED, font=("Segoe UI", 11, "bold")).pack(side="left", padx=(6, 0), pady=(12, 0))

        tk.Label(root, text="Вставь ключ или ссылку-подписку и подключись",
                 bg=BG, fg=MUTED, font=("Segoe UI", 10)).pack(padx=26, anchor="w", pady=(0, 12))

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

        # ── Выбор сервера ──
        self.server_var = tk.StringVar()
        self.server_menu = ttk.Combobox(root, textvariable=self.server_var, state="readonly", font=("Segoe UI", 10))
        self.server_menu.pack(fill="x", padx=26, pady=(14, 0))
        self.server_menu.bind("<<ComboboxSelected>>", lambda e: self.do_ping())
        self.server_menu.pack_forget()

        # ── Пинг ──
        self.ping_lbl = tk.Label(root, text="", bg=BG, fg=MUTED, font=("Segoe UI", 10, "bold"))
        self.ping_lbl.pack(pady=(14, 2))

        # ── Статус + кнопка ──
        self.status = tk.Label(root, text="● Отключено", bg=BG, fg=MUTED, font=("Segoe UI", 13, "bold"))
        self.status.pack(pady=(4, 10))

        self.btn = tk.Button(root, text="Подключиться", command=self.toggle,
                             bg=ACC, fg="white", relief="flat", cursor="hand2",
                             font=("Segoe UI", 15, "bold"), width=22, height=2,
                             activebackground=ACC2, activeforeground="white", bd=0)
        self.btn.pack(pady=4)

        # ── Нижние действия ──
        row = tk.Frame(root, bg=BG)
        row.pack(pady=14)
        self._chip(row, "🔄 Загрузить подписку", self.load_sub, CARD).pack(side="left", padx=4)
        self._chip(row, "📶 Пинг", self.do_ping, CARD).pack(side="left", padx=4)
        self._chip(row, "⬆ Обновить подписку", self.update_sub, CARD).pack(side="left", padx=4)

        self.info = tk.Label(root, text="", bg=BG, fg=MUTED, font=("Segoe UI", 9),
                             wraplength=410, justify="center")
        self.info.pack(pady=(6, 0))

        tk.Label(root, text=f"JeffTON v{APP_VERSION}", bg=BG, fg="#3a4256",
                 font=("Segoe UI", 8)).pack(side="bottom", pady=6)

        self.load_saved()
        self.check_update()
        root.protocol("WM_DELETE_WINDOW", self.on_close)

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
                req = urllib.request.Request(VERSION_URL, headers={"User-Agent": "JeffTON"})
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
        if messagebox.askyesno(APP_NAME,
                f"Доступна новая версия JeffTON {latest}!\nУ тебя {APP_VERSION}.\n\nСкачать обновление?"):
            import webbrowser
            webbrowser.open(RELEASES_URL)

    # ── Сохранение / загрузка ──
    def save(self):
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump({"key": self.txt.get("1.0", "end").strip(), "sub_url": self.sub_url}, f)
            self.info.config(text="Сохранено ✓", fg=OK)
        except Exception as e:
            self.info.config(text=f"Ошибка сохранения: {e}", fg=DANGER)

    def load_saved(self):
        try:
            with open(CONFIG_FILE, encoding="utf-8") as f:
                d = json.load(f)
                if d.get("key"):
                    self.txt.insert("1.0", d["key"])
                self.sub_url = d.get("sub_url", "")
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
            names = []
            for i, ln in enumerate(self.links):
                nm = unquote(ln.split("#", 1)[1]) if "#" in ln else f"Сервер {i+1}"
                names.append(nm)
            self.server_menu["values"] = names
            self.server_menu.current(0)
            self.server_menu.pack(fill="x", padx=26, pady=(14, 0))
            self.info.config(text=f"Серверов: {len(self.links)} ✓", fg=OK)
            self.do_ping()
            if reconnect and self.connected:
                self.disconnect(); self.connect()
        except Exception as e:
            self.info.config(text=f"Ошибка: {e}", fg=DANGER)

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
        if self.links and self.server_menu.get():
            return self.links[self.server_menu.current()]
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
    JeffTON(root)
    root.mainloop()


if __name__ == "__main__":
    main()
