"""
QipCall VPN — десктопный клиент для Windows.
Вставь ключ (vless:// / vmess:// / trojan:// / ss://) или ссылку-подписку,
нажми «Подключиться» — трафик пойдёт через VPN (системный прокси + xray-core).
"""
import os
import sys
import json
import base64
import threading
import subprocess
import urllib.request
from urllib.parse import urlparse, parse_qs, unquote

import tkinter as tk
from tkinter import ttk, messagebox

APP_NAME = "QipCall VPN"
SOCKS_PORT = 10808
HTTP_PORT = 10809
CONFIG_FILE = os.path.join(os.path.expanduser("~"), ".qipcall_config.json")

# ── Тёмная тема ───────────────────────────────────────────────────────────────
BG = "#0a0e17"
CARD = "#131926"
ACC = "#5b8def"
ACC2 = "#7c5cff"
TEXT = "#e8edf5"
MUTED = "#8a97ad"
OK = "#3fce6a"
DANGER = "#f87171"


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
    raise ValueError("Неизвестный формат ключа. Поддерживаются vless / vmess / trojan / ss.")


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
    u = urlparse(link)
    p = parse_qs(u.query)
    net = p.get("type", ["tcp"])[0]
    security = p.get("security", ["none"])[0]
    vnext = {
        "address": u.hostname,
        "port": u.port or 443,
        "users": [{
            "id": unquote(u.username or ""),
            "encryption": "none",
            "flow": p.get("flow", [""])[0],
        }],
    }
    return {
        "protocol": "vless",
        "settings": {"vnext": [vnext]},
        "streamSettings": _stream(p, net, security),
        "tag": "proxy",
    }


def _parse_vmess(link):
    raw = link[len("vmess://"):]
    raw += "=" * (-len(raw) % 4)
    obj = json.loads(base64.b64decode(raw).decode())
    net = obj.get("net", "tcp")
    security = "tls" if obj.get("tls") in ("tls", True, "true") else "none"
    p = {
        "path": [obj.get("path", "/")],
        "host": [obj.get("host", "")],
        "sni": [obj.get("sni", obj.get("host", ""))],
        "serviceName": [obj.get("path", "")],
    }
    vnext = {
        "address": obj.get("add"),
        "port": int(obj.get("port", 443)),
        "users": [{"id": obj.get("id"), "alterId": int(obj.get("aid", 0)), "security": "auto"}],
    }
    return {
        "protocol": "vmess",
        "settings": {"vnext": [vnext]},
        "streamSettings": _stream(p, net, security),
        "tag": "proxy",
    }


def _parse_trojan(link):
    u = urlparse(link)
    p = parse_qs(u.query)
    net = p.get("type", ["tcp"])[0]
    security = p.get("security", ["tls"])[0]
    return {
        "protocol": "trojan",
        "settings": {"servers": [{
            "address": u.hostname, "port": u.port or 443,
            "password": unquote(u.username or ""),
        }]},
        "streamSettings": _stream(p, net, security),
        "tag": "proxy",
    }


def _parse_ss(link):
    body = link[len("ss://"):]
    name = ""
    if "#" in body:
        body, name = body.split("#", 1)
    if "@" in body:
        userinfo, server = body.split("@", 1)
        userinfo += "=" * (-len(userinfo) % 4)
        try:
            method, password = base64.b64decode(userinfo).decode().split(":", 1)
        except Exception:
            method, password = userinfo.split(":", 1)
    else:
        body += "=" * (-len(body) % 4)
        decoded = base64.b64decode(body).decode()
        creds, server = decoded.split("@", 1)
        method, password = creds.split(":", 1)
    host, port = server.split(":")
    port = int(port.split("/")[0].split("?")[0])
    return {
        "protocol": "shadowsocks",
        "settings": {"servers": [{
            "address": host, "port": port, "method": method, "password": password,
        }]},
        "tag": "proxy",
    }


def build_xray_config(outbound: dict) -> dict:
    return {
        "log": {"loglevel": "warning"},
        "inbounds": [
            {"tag": "socks", "port": SOCKS_PORT, "listen": "127.0.0.1",
             "protocol": "socks", "settings": {"udp": True}},
            {"tag": "http", "port": HTTP_PORT, "listen": "127.0.0.1",
             "protocol": "http"},
        ],
        "outbounds": [outbound, {"protocol": "freedom", "tag": "direct"}],
    }


# ══ СИСТЕМНЫЙ ПРОКСИ WINDOWS ═════════════════════════════════════════════════
def set_system_proxy(enable: bool):
    if os.name != "nt":
        return
    import winreg
    import ctypes
    key = winreg.OpenKey(
        winreg.HKEY_CURRENT_USER,
        r"Software\Microsoft\Windows\CurrentVersion\Internet Settings",
        0, winreg.KEY_ALL_ACCESS,
    )
    if enable:
        winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, 1)
        winreg.SetValueEx(key, "ProxyServer", 0, winreg.REG_SZ, f"127.0.0.1:{HTTP_PORT}")
        winreg.SetValueEx(key, "ProxyOverride", 0, winreg.REG_SZ, "localhost;127.*;10.*;172.16.*;192.168.*;<local>")
    else:
        winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, 0)
    winreg.CloseKey(key)
    # Уведомить систему об изменении настроек
    INTERNET_OPTION_SETTINGS_CHANGED = 39
    INTERNET_OPTION_REFRESH = 37
    internet = ctypes.windll.Wininet
    internet.InternetSetOptionW(0, INTERNET_OPTION_SETTINGS_CHANGED, 0, 0)
    internet.InternetSetOptionW(0, INTERNET_OPTION_REFRESH, 0, 0)


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
    req = urllib.request.Request(url, headers={"User-Agent": "QipCall"})
    with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
        data = r.read().decode().strip()
    # подписка обычно base64
    try:
        decoded = base64.b64decode(data + "=" * (-len(data) % 4)).decode()
        if "://" in decoded:
            data = decoded
    except Exception:
        pass
    return [ln.strip() for ln in data.splitlines() if "://" in ln]


# ══ GUI ══════════════════════════════════════════════════════════════════════
class QipCallApp:
    def __init__(self, root):
        self.root = root
        self.proc = None
        self.connected = False
        self.links = []

        root.title(APP_NAME)
        root.geometry("440x560")
        root.configure(bg=BG)
        root.resizable(False, False)

        # Заголовок
        header = tk.Frame(root, bg=BG)
        header.pack(fill="x", padx=24, pady=(22, 6))
        tk.Label(header, text="QipCall", bg=BG, fg=ACC,
                 font=("Segoe UI", 24, "bold")).pack(side="left")
        tk.Label(header, text=" VPN", bg=BG, fg=TEXT,
                 font=("Segoe UI", 24, "bold")).pack(side="left")

        tk.Label(root, text="Вставь ключ или ссылку-подписку и подключись",
                 bg=BG, fg=MUTED, font=("Segoe UI", 10)).pack(padx=24, anchor="w")

        # Поле ввода ключа
        card = tk.Frame(root, bg=CARD)
        card.pack(fill="x", padx=24, pady=16)
        tk.Label(card, text="Ключ / подписка", bg=CARD, fg=MUTED,
                 font=("Segoe UI", 9)).pack(anchor="w", padx=14, pady=(12, 4))
        self.txt = tk.Text(card, height=5, bg="#0d121d", fg=TEXT, insertbackground=TEXT,
                           relief="flat", font=("Consolas", 9), wrap="word",
                           highlightthickness=1, highlightbackground="#242c3d")
        self.txt.pack(fill="x", padx=14, pady=(0, 12))

        # Выбор сервера (для подписок)
        self.server_var = tk.StringVar()
        self.server_menu = ttk.Combobox(root, textvariable=self.server_var, state="readonly")
        self.server_menu.pack(fill="x", padx=24)
        self.server_menu.pack_forget()

        # Большая круглая кнопка подключения
        self.status = tk.Label(root, text="Отключено", bg=BG, fg=MUTED,
                               font=("Segoe UI", 12, "bold"))
        self.status.pack(pady=(18, 8))

        self.btn = tk.Button(root, text="Подключиться", command=self.toggle,
                             bg=ACC, fg="white", relief="flat", cursor="hand2",
                             font=("Segoe UI", 14, "bold"), width=20, height=2,
                             activebackground=ACC2, activeforeground="white")
        self.btn.pack(pady=6)

        # Кнопки под ней
        row = tk.Frame(root, bg=BG)
        row.pack(pady=10)
        tk.Button(row, text="💾 Сохранить ключ", command=self.save, bg=CARD, fg=TEXT,
                  relief="flat", font=("Segoe UI", 9), cursor="hand2",
                  activebackground="#1c2333").pack(side="left", padx=4)
        tk.Button(row, text="🔄 Загрузить подписку", command=self.load_sub, bg=CARD, fg=TEXT,
                  relief="flat", font=("Segoe UI", 9), cursor="hand2",
                  activebackground="#1c2333").pack(side="left", padx=4)

        self.info = tk.Label(root, text="", bg=BG, fg=MUTED, font=("Segoe UI", 9),
                             wraplength=390, justify="center")
        self.info.pack(pady=(6, 0))

        self.load_saved()
        root.protocol("WM_DELETE_WINDOW", self.on_close)

    # ── Сохранение / загрузка ключа ──
    def save(self):
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump({"key": self.txt.get("1.0", "end").strip()}, f)
            self.info.config(text="Ключ сохранён ✓", fg=OK)
        except Exception as e:
            self.info.config(text=f"Ошибка сохранения: {e}", fg=DANGER)

    def load_saved(self):
        try:
            with open(CONFIG_FILE, encoding="utf-8") as f:
                key = json.load(f).get("key", "")
                if key:
                    self.txt.insert("1.0", key)
        except Exception:
            pass

    def load_sub(self):
        url = self.txt.get("1.0", "end").strip()
        if not url.startswith("http"):
            messagebox.showinfo(APP_NAME, "Вставь ссылку-подписку (https://...) в поле, затем нажми эту кнопку.")
            return
        self.info.config(text="Загрузка подписки...", fg=MUTED)
        self.root.update()
        try:
            self.links = fetch_subscription(url)
            if not self.links:
                self.info.config(text="Подписка пустая", fg=DANGER)
                return
            names = []
            for i, ln in enumerate(self.links):
                nm = unquote(ln.split("#", 1)[1]) if "#" in ln else f"Сервер {i+1}"
                names.append(nm)
            self.server_menu["values"] = names
            self.server_menu.current(0)
            self.server_menu.pack(fill="x", padx=24, pady=(0, 4))
            self.info.config(text=f"Загружено серверов: {len(self.links)} — выбери и подключись", fg=OK)
        except Exception as e:
            self.info.config(text=f"Ошибка загрузки: {e}", fg=DANGER)

    # ── Подключение ──
    def toggle(self):
        if self.connected:
            self.disconnect()
        else:
            self.connect()

    def _current_link(self):
        if self.links and self.server_menu.get():
            return self.links[self.server_menu.current()]
        return self.txt.get("1.0", "end").strip().splitlines()[0] if self.txt.get("1.0", "end").strip() else ""

    def connect(self):
        link = self._current_link()
        if not link:
            self.info.config(text="Вставь ключ", fg=DANGER)
            return
        if link.startswith("http"):
            self.info.config(text="Это подписка — нажми «Загрузить подписку», потом выбери сервер", fg=DANGER)
            return
        try:
            outbound = parse_link(link)
        except Exception as e:
            self.info.config(text=f"Неверный ключ: {e}", fg=DANGER)
            return

        xray = resource_path("xray.exe" if os.name == "nt" else "xray")
        if not os.path.exists(xray):
            self.info.config(text="Не найден xray.exe рядом с программой", fg=DANGER)
            return

        cfg = build_xray_config(outbound)
        cfg_path = os.path.join(os.path.dirname(CONFIG_FILE), ".qipcall_xray.json")
        with open(cfg_path, "w", encoding="utf-8") as f:
            json.dump(cfg, f)

        try:
            flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            self.proc = subprocess.Popen(
                [xray, "run", "-config", cfg_path],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=flags,
            )
        except Exception as e:
            self.info.config(text=f"Не удалось запустить ядро: {e}", fg=DANGER)
            return

        try:
            set_system_proxy(True)
        except Exception as e:
            self.info.config(text=f"Прокси не установлен: {e}", fg=DANGER)

        self.connected = True
        self.status.config(text="● Подключено", fg=OK)
        self.btn.config(text="Отключиться", bg=DANGER)
        self.info.config(text="VPN активен. Весь трафик идёт через сервер.", fg=OK)

    def disconnect(self):
        try:
            set_system_proxy(False)
        except Exception:
            pass
        if self.proc:
            try:
                self.proc.terminate()
            except Exception:
                pass
            self.proc = None
        self.connected = False
        self.status.config(text="Отключено", fg=MUTED)
        self.btn.config(text="Подключиться", bg=ACC)
        self.info.config(text="VPN выключен.", fg=MUTED)

    def on_close(self):
        if self.connected:
            self.disconnect()
        self.root.destroy()


def main():
    root = tk.Tk()
    try:
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("TCombobox", fieldbackground=CARD, background=CARD,
                        foreground=TEXT, arrowcolor=TEXT)
    except Exception:
        pass
    QipCallApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
