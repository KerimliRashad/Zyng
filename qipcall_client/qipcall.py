"""
JeffTUN VPN — десктопный клиент (Windows/Linux) в стиле Happ.
Слева иконки, посередине серверы с поиском, справа круглая кнопка включения.
UI: CustomTkinter. Ядро: xray-core. Системный прокси.
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
from tkinter import messagebox
import customtkinter as ctk

APP_NAME = "JeffTUN VPN"
APP_VERSION = "3.8"
VERSION_URL = "https://raw.githubusercontent.com/kerimlirashad/kerimlirashad/claude/icq-messenger-b0bt2n/qipcall_client/version.txt"
RELEASES_URL = "https://github.com/kerimlirashad/kerimlirashad/releases/tag/qipcall-latest"
DOWNLOAD_BASE = "https://github.com/kerimlirashad/kerimlirashad/releases/download/qipcall-latest"
TELEGRAM_URL = "https://t.me/jeffvpn"
SOCKS_PORT = 10808
HTTP_PORT = 10809
CONFIG_FILE = os.path.join(os.path.expanduser("~"), ".jeffton_config.json")

# Тёмно-индиго палитра в стиле Happ
BG      = "#171636"   # общий фон (глубокий индиго)
SIDE    = "#171636"
PANEL   = "#171636"
CARD    = "#242349"   # нижняя панель / карточки серверов
CARD2   = "#2e2d5a"   # выбранная/вторичная
BORDER  = "#332f63"   # тонкие рамки
ACC     = "#7b6cff"   # фиолетовый акцент
ACC_D   = "#6a5bf0"
TEXT    = "#eceef7"
MUTED   = "#9a97c4"
OK      = "#34d17a"
WARN    = "#f5c451"
DANGER  = "#ff6b6b"
# Спец-цвета
SUBCARD   = "#1e1d44"
SUBBORDER = "#3a3780"
UPDCARD   = "#12291b"
POWER_OFF   = "#3b378f"   # круг питания (выкл) — насыщенный фиолет
POWER_HOVER = "#443fa0"
POWER_RING  = "#252350"   # внешнее кольцо-подложка


def resource_path(name):
    cands = []
    if hasattr(sys, "_MEIPASS"):
        cands.append(os.path.join(sys._MEIPASS, name))
    cands.append(os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), name))
    cands.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), name))
    for c in cands:
        if os.path.exists(c):
            return c
    return name


# ══ ПАРСИНГ КЛЮЧЕЙ ═══════════════════════════════════════════════════════════
def parse_link(link):
    link = link.strip()
    if link.startswith("vless://"):  return _parse_vless(link)
    if link.startswith("vmess://"):  return _parse_vmess(link)
    if link.startswith("trojan://"): return _parse_trojan(link)
    if link.startswith("ss://"):     return _parse_ss(link)
    raise ValueError("Нужен ключ vless / vmess / trojan / ss")


def link_host_port(link):
    link = link.strip()
    try:
        if link.startswith("vmess://"):
            raw = link[8:]; raw += "=" * (-len(raw) % 4)
            obj = json.loads(base64.b64decode(raw).decode())
            return obj.get("add"), int(obj.get("port", 443))
        u = urlparse(link)
        return u.hostname, u.port or 443
    except Exception:
        return None, None


COUNTRY_CODES = {
    "france": "FR", "germany": "DE", "finland": "FI", "usa": "US", "america": "US",
    "united states": "US", "malaysia": "MY", "netherlands": "NL", "holland": "NL",
    "russia": "RU", "moscow": "RU", "uk": "GB", "london": "GB", "england": "GB",
    "poland": "PL", "sweden": "SE", "turkey": "TR", "turkiye": "TR", "japan": "JP",
    "singapore": "SG", "canada": "CA", "spain": "ES", "italy": "IT", "ukraine": "UA",
    "latvia": "LV", "estonia": "EE", "lithuania": "LT", "switzerland": "CH",
    "austria": "AT", "hongkong": "HK", "hong kong": "HK", "korea": "KR", "india": "IN",
    "uae": "AE", "dubai": "AE", "kazakhstan": "KZ", "georgia": "GE",
    "malayzia": "MY", "malaysia": "MY",
}

# Флаги-эмодзи по коду страны
FLAGS = {
    "FR": "🇫🇷", "DE": "🇩🇪", "FI": "🇫🇮", "US": "🇺🇸", "MY": "🇲🇾", "NL": "🇳🇱",
    "RU": "🇷🇺", "GB": "🇬🇧", "PL": "🇵🇱", "SE": "🇸🇪", "TR": "🇹🇷", "JP": "🇯🇵",
    "SG": "🇸🇬", "CA": "🇨🇦", "ES": "🇪🇸", "IT": "🇮🇹", "UA": "🇺🇦", "LV": "🇱🇻",
    "EE": "🇪🇪", "LT": "🇱🇹", "CH": "🇨🇭", "AT": "🇦🇹", "HK": "🇭🇰", "KR": "🇰🇷",
    "IN": "🇮🇳", "AE": "🇦🇪", "KZ": "🇰🇿", "GE": "🇬🇪",
}


def country_of(name):
    low = (name or "").lower()
    for k, c in COUNTRY_CODES.items():
        if k in low:
            return c
    letters = "".join(ch for ch in (name or "?") if ch.isalpha())
    return (letters[:2] or "VP").upper()


def clean_name(name):
    """Убирает дублирующий код страны в начале: 'frFrance - быстрый' → 'France - быстрый'."""
    import re
    return re.sub(r"^[a-zA-Z]{2}(?=[A-ZА-Я])", "", (name or "").strip()).strip()


def proto_line(link):
    try:
        scheme = link.split("://", 1)[0].upper()
        if link.startswith("vmess://"):
            raw = link[8:]; raw += "=" * (-len(raw) % 4)
            obj = json.loads(base64.b64decode(raw).decode())
            return f"VMESS | {obj.get('net','tcp').upper()} | {'TLS' if obj.get('tls') else '—'} | JSON"
        p = parse_qs(urlparse(link).query)
        net = p.get("type", ["tcp"])[0].upper()
        sec = p.get("security", ["none"])[0]
        sec = {"reality": "Reality", "tls": "TLS", "none": "—"}.get(sec, sec.title())
        return f"{scheme} | {net} | {sec} | JSON"
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
            "spiderX": params.get("spx", [""])[0]}
    elif security == "tls":
        ss["security"] = "tls"
        ss["tlsSettings"] = {
            "serverName": params.get("sni", [params.get("host", [""])[0]])[0],
            "fingerprint": params.get("fp", ["chrome"])[0],
            "allowInsecure": params.get("allowInsecure", ["0"])[0] in ("1", "true")}
    if net == "ws":
        ss["wsSettings"] = {"path": params.get("path", ["/"])[0],
                            "headers": {"Host": params.get("host", [""])[0]} if params.get("host") else {}}
    elif net == "grpc":
        ss["grpcSettings"] = {"serviceName": params.get("serviceName", [""])[0]}
    return ss


def _parse_vless(link):
    u = urlparse(link); p = parse_qs(u.query)
    net = p.get("type", ["tcp"])[0]; sec = p.get("security", ["none"])[0]
    vnext = {"address": u.hostname, "port": u.port or 443,
             "users": [{"id": unquote(u.username or ""), "encryption": "none", "flow": p.get("flow", [""])[0]}]}
    return {"protocol": "vless", "settings": {"vnext": [vnext]}, "streamSettings": _stream(p, net, sec), "tag": "proxy"}


def _parse_vmess(link):
    raw = link[8:]; raw += "=" * (-len(raw) % 4)
    obj = json.loads(base64.b64decode(raw).decode())
    net = obj.get("net", "tcp"); sec = "tls" if obj.get("tls") in ("tls", True, "true") else "none"
    p = {"path": [obj.get("path", "/")], "host": [obj.get("host", "")],
         "sni": [obj.get("sni", obj.get("host", ""))], "serviceName": [obj.get("path", "")]}
    vnext = {"address": obj.get("add"), "port": int(obj.get("port", 443)),
             "users": [{"id": obj.get("id"), "alterId": int(obj.get("aid", 0)), "security": "auto"}]}
    return {"protocol": "vmess", "settings": {"vnext": [vnext]}, "streamSettings": _stream(p, net, sec), "tag": "proxy"}


def _parse_trojan(link):
    u = urlparse(link); p = parse_qs(u.query)
    net = p.get("type", ["tcp"])[0]; sec = p.get("security", ["tls"])[0]
    return {"protocol": "trojan", "settings": {"servers": [{"address": u.hostname, "port": u.port or 443,
            "password": unquote(u.username or "")}]}, "streamSettings": _stream(p, net, sec), "tag": "proxy"}


def _parse_ss(link):
    body = link[5:]
    if "#" in body: body = body.split("#", 1)[0]
    if "@" in body:
        ui, server = body.split("@", 1); ui += "=" * (-len(ui) % 4)
        try: method, password = base64.b64decode(ui).decode().split(":", 1)
        except Exception: method, password = unquote(ui).split(":", 1)
    else:
        body += "=" * (-len(body) % 4)
        creds, server = base64.b64decode(body).decode().split("@", 1)
        method, password = creds.split(":", 1)
    host, port = server.split(":"); port = int(port.split("/")[0].split("?")[0])
    return {"protocol": "shadowsocks", "settings": {"servers": [{"address": host, "port": port,
            "method": method, "password": password}]}, "tag": "proxy"}


def build_xray_config(outbound):
    return {"log": {"loglevel": "warning"},
            "inbounds": [{"tag": "socks", "port": SOCKS_PORT, "listen": "127.0.0.1", "protocol": "socks", "settings": {"udp": True}},
                         {"tag": "http", "port": HTTP_PORT, "listen": "127.0.0.1", "protocol": "http"}],
            "outbounds": [outbound, {"protocol": "freedom", "tag": "direct"}]}


# ══ СИСТЕМНЫЙ ПРОКСИ ═════════════════════════════════════════════════════════
def set_system_proxy(enable):
    if sys.platform == "darwin": _set_mac_proxy(enable); return
    if os.name != "nt": _set_linux_proxy(enable); return
    import winreg, ctypes
    key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
        r"Software\Microsoft\Windows\CurrentVersion\Internet Settings", 0, winreg.KEY_ALL_ACCESS)
    if enable:
        winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, 1)
        winreg.SetValueEx(key, "ProxyServer", 0, winreg.REG_SZ, f"127.0.0.1:{HTTP_PORT}")
        winreg.SetValueEx(key, "ProxyOverride", 0, winreg.REG_SZ, "localhost;127.*;10.*;172.16.*;192.168.*;<local>")
    else:
        winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, 0)
    winreg.CloseKey(key)
    inet = ctypes.windll.Wininet; inet.InternetSetOptionW(0, 39, 0, 0); inet.InternetSetOptionW(0, 37, 0, 0)


def _set_mac_proxy(enable):
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
                for m in ("-setwebproxystate", "-setsecurewebproxystate", "-setsocksfirewallproxystate"):
                    subprocess.run(["networksetup", m, svc, "off"], check=False)
        except Exception:
            pass


def _set_linux_proxy(enable):
    def g(*a):
        try: subprocess.run(["gsettings"] + list(a), check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception: pass
    if enable:
        g("set", "org.gnome.system.proxy", "mode", "manual")
        for pr in ("http", "https"):
            g("set", f"org.gnome.system.proxy.{pr}", "host", "127.0.0.1")
            g("set", f"org.gnome.system.proxy.{pr}", "port", str(HTTP_PORT))
        g("set", "org.gnome.system.proxy.socks", "host", "127.0.0.1")
        g("set", "org.gnome.system.proxy.socks", "port", str(SOCKS_PORT))
    else:
        g("set", "org.gnome.system.proxy", "mode", "none")


def set_autostart(enable):
    if os.name != "nt" or not getattr(sys, "frozen", False): return
    import winreg
    key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_ALL_ACCESS)
    if enable: winreg.SetValueEx(key, "JeffTUN", 0, winreg.REG_SZ, f'"{sys.executable}"')
    else:
        try: winreg.DeleteValue(key, "JeffTUN")
        except Exception: pass
    winreg.CloseKey(key)


def get_autostart():
    if os.name != "nt": return False
    try:
        import winreg
        k = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run")
        winreg.QueryValueEx(k, "JeffTUN"); winreg.CloseKey(k); return True
    except Exception:
        return False


def fetch_subscription(url):
    """Возвращает (список_ключей, инфо_подписки)."""
    ctx = None
    try:
        import ssl
        ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    except Exception:
        pass
    req = urllib.request.Request(url, headers={"User-Agent": "JeffTUN"})
    with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
        data = r.read().decode().strip()
        title = r.headers.get("Profile-Title", "")
        userinfo = r.headers.get("Subscription-Userinfo", "")
    try:
        dec = base64.b64decode(data + "=" * (-len(data) % 4)).decode()
        if "://" in dec: data = dec
    except Exception:
        pass
    links = [ln.strip() for ln in data.splitlines() if "://" in ln]
    info = _parse_userinfo(userinfo, title)
    return links, info


def _decode_title(title):
    """Некоторые панели отдают Profile-Title в base64 (с префиксом 'base64:')."""
    t = (title or "").strip()
    if t.lower().startswith("base64:"):
        t = t.split(":", 1)[1]
    try:
        dec = base64.b64decode(t + "=" * (-len(t) % 4)).decode("utf-8")
        if dec.isprintable() or any(ord(c) > 127 for c in dec):
            return dec.strip()
    except Exception:
        pass
    return (title or "").strip()


def _parse_userinfo(userinfo, title):
    """Разбирает 'upload=..; download=..; total=..; expire=..' в понятный вид."""
    d = {"title": _decode_title(title) or "JeffTUN VPN"}
    parts = {}
    for kv in userinfo.replace(",", ";").split(";"):
        if "=" in kv:
            k, v = kv.split("=", 1)
            try: parts[k.strip()] = int(v.strip())
            except Exception: pass
    used = parts.get("upload", 0) + parts.get("download", 0)
    total = parts.get("total", 0)
    exp = parts.get("expire", 0)
    def gb(b): return b / (1024**3)
    if total:
        d["traffic"] = f"{gb(used):.1f} / {gb(total):.0f} ГБ"
        d["left_gb"] = f"осталось {gb(total-used):.1f} ГБ"
    elif used:
        d["traffic"] = f"{gb(used):.1f} ГБ / ∞"
        d["left_gb"] = "безлимит"
    else:
        d["traffic"] = "∞"
        d["left_gb"] = "безлимит"
    if exp:
        days = int((exp - time.time()) / 86400)
        d["expire"] = f"осталось {days} дн." if days >= 0 else "истекла"
    else:
        d["expire"] = "бессрочно"
    return d


def tcp_ping(host, port, timeout=3.0):
    try:
        s = time.time(); c = socket.create_connection((host, port), timeout=timeout); c.close()
        return int((time.time() - s) * 1000)
    except Exception:
        return None


FONT = "SF Pro Display"


# ══ ПРИЛОЖЕНИЕ ═══════════════════════════════════════════════════════════════
class JeffTUN:
    def __init__(self, root):
        self.root = root
        self.proc = None
        self.connected = False
        self.links = []
        self.sub_url = ""
        self.autoconnect = False
        self.prefs = {}
        self.selected_idx = 0
        self.sub_info = {}
        self._flag_cache = {}
        self.pings = {}
        self._ping_lbls = {}

        root.title(APP_NAME); root.geometry("430x780"); root.minsize(400, 680)
        try:
            if os.name == "nt":
                ico = resource_path("icon.ico")
                if os.path.exists(ico): root.iconbitmap(ico)
        except Exception:
            pass

        # Одноколоночный макет «телефона» как в Happ
        root.grid_columnconfigure(0, weight=1)
        root.grid_rowconfigure(0, weight=0)   # верхняя панель (шестерёнка / +)
        root.grid_rowconfigure(1, weight=0)   # кнопка питания
        root.grid_rowconfigure(2, weight=1)   # нижняя карточка со списком

        # ── ВЕРХНЯЯ ПАНЕЛЬ: ⚙ слева, ＋ справа ──
        top = ctk.CTkFrame(root, fg_color="transparent")
        top.grid(row=0, column=0, sticky="ew", padx=18, pady=(14, 0))
        top.grid_columnconfigure(1, weight=1)
        ctk.CTkButton(top, text="⚙", width=42, height=42, corner_radius=21,
                      fg_color="transparent", hover_color=CARD, text_color=TEXT,
                      font=ctk.CTkFont(FONT, 22), command=self.open_settings).grid(row=0, column=0, sticky="w")
        ctk.CTkButton(top, text="＋", width=42, height=42, corner_radius=21,
                      fg_color="transparent", hover_color=CARD, text_color=TEXT,
                      font=ctk.CTkFont(FONT, 24), command=self.add_menu).grid(row=0, column=2, sticky="e")

        # ── КНОПКА ПИТАНИЯ (по центру, кольцо-подложка) ──
        pwrap = ctk.CTkFrame(root, fg_color="transparent")
        pwrap.grid(row=1, column=0, pady=(6, 10))
        ring = ctk.CTkFrame(pwrap, width=210, height=210, corner_radius=105,
                            fg_color=POWER_RING); ring.pack(padx=6, pady=6); ring.pack_propagate(False)
        self._icon_off = self._power_icon("#cfcbff", 70)
        self._icon_on = self._power_icon("#ffffff", 70)
        self.power = ctk.CTkButton(ring, text="", image=self._icon_off,
                                   width=160, height=160, corner_radius=80,
                                   fg_color=POWER_OFF, hover_color=POWER_HOVER,
                                   border_width=0, command=self.toggle)
        self.power.place(relx=0.5, rely=0.5, anchor="center")
        self.status = ctk.CTkLabel(pwrap, text="Отключено",
                                   font=ctk.CTkFont(FONT, 14, "bold"), text_color=MUTED)
        self.status.pack(pady=(4, 0))

        # ── НИЖНЯЯ КАРТОЧКА: заголовок + инфо + серверы ──
        card = ctk.CTkFrame(root, fg_color=CARD, corner_radius=22)
        card.grid(row=2, column=0, sticky="nsew", padx=12, pady=(4, 12))
        card.grid_columnconfigure(0, weight=1)
        card.grid_rowconfigure(3, weight=1)

        # шапка: логотип JEFFvpn 🦈 + иконки (обновить / пинг / …)
        head = ctk.CTkFrame(card, fg_color="transparent")
        head.grid(row=0, column=0, sticky="ew", padx=16, pady=(14, 4))
        head.grid_columnconfigure(0, weight=1)
        tt = ctk.CTkFrame(head, fg_color="transparent"); tt.grid(row=0, column=0, sticky="w")
        self._logo_ref = None
        try:
            from PIL import Image
            lp = resource_path("logo_white.png")
            if os.path.exists(lp):
                im = Image.open(lp); ratio = im.width / im.height
                img = ctk.CTkImage(im, size=(int(30 * ratio), 30))
                ctk.CTkLabel(tt, image=img, text="").pack(side="left")
                self._logo_ref = img
        except Exception:
            pass
        if self._logo_ref is None:
            ctk.CTkLabel(tt, text="JEFFvpn 🦈", font=ctk.CTkFont(FONT, 20, "bold"),
                         text_color=TEXT).pack(side="left")
        icons = ctk.CTkFrame(head, fg_color="transparent"); icons.grid(row=0, column=1, sticky="e")
        def hicon(txt, cmd):
            ctk.CTkButton(icons, text=txt, width=34, height=34, corner_radius=17,
                          fg_color="transparent", hover_color=CARD2, text_color=MUTED,
                          font=ctk.CTkFont(FONT, 17), command=cmd).pack(side="left", padx=1)
        hicon("↻", self.update_sub)     # обновить подписку
        hicon("◔", self.do_ping)        # пинг
        hicon("⋯", self.add_menu)       # меню

        self.sub_sub = ctk.CTkLabel(card, text="Автообновление подписки",
                                    font=ctk.CTkFont(FONT, 10), text_color=MUTED, anchor="w")
        self.sub_sub.grid(row=1, column=0, sticky="w", padx=18, pady=(0, 6))

        # инфо-строка: (i) · трафик · telegram
        info = ctk.CTkFrame(card, fg_color=SUBCARD, corner_radius=14)
        info.grid(row=2, column=0, sticky="ew", padx=12, pady=(0, 8))
        info.grid_columnconfigure(1, weight=1)
        ctk.CTkButton(info, text="ⓘ", width=34, height=34, corner_radius=17, fg_color="transparent",
                      hover_color=CARD2, text_color=ACC, font=ctk.CTkFont(FONT, 18),
                      command=self._about).grid(row=0, column=0, padx=(6, 0), pady=6)
        self.traffic_lbl = ctk.CTkLabel(info, text="∞", font=ctk.CTkFont(FONT, 13, "bold"), text_color=TEXT)
        self.traffic_lbl.grid(row=0, column=1)
        ctk.CTkButton(info, text="✈", width=34, height=34, corner_radius=17, fg_color="transparent",
                      hover_color=CARD2, text_color=ACC, font=ctk.CTkFont(FONT, 18),
                      command=self._open_tg).grid(row=0, column=2, padx=(0, 6), pady=6)

        # список серверов (прокрутка)
        self.search = None  # поиск не используется в компактном макете
        self.server_list = ctk.CTkScrollableFrame(card, fg_color="transparent")
        self.server_list.grid(row=3, column=0, sticky="nsew", padx=8, pady=(0, 8))

        # плашка обновления (поверх, сверху по центру)
        self.update_bar = None

        self.load_saved()
        # применяем сохранённую тему
        _t = self.prefs.get("theme", "Тёмная")
        ctk.set_appearance_mode({"Светлая": "light", "Тёмная": "dark", "Системная": "system"}.get(_t, "dark"))
        self.render_servers()
        self.check_update()
        if self.links:
            self.root.after(400, self.do_ping)
        if self.autoconnect and self.links:
            self.root.after(800, self.connect)
        root.protocol("WM_DELETE_WINDOW", self.on_close)

    # ── Добавление ключа/подписки ──
    def add_key(self):
        dlg = ctk.CTkInputDialog(text="Вставь ключ (vless/vmess/trojan/ss):", title="Добавить ключ")
        v = dlg.get_input()
        if v and "://" in v:
            self.links = [l.strip() for l in (self.links + [v.strip()]) if "://" in l]
            self.selected_idx = 0; self.render_servers(); self.save(silent=True); self.do_ping()

    def paste_key(self):
        try: data = self.root.clipboard_get()
        except Exception: self._flash("Буфер пуст", DANGER); return
        lines = [l.strip() for l in data.splitlines() if "://" in l and not l.strip().startswith("http")]
        subs = [l.strip() for l in data.splitlines() if l.strip().startswith("http")]
        if subs:
            self.sub_url = subs[0]; self._pull_sub(); return
        if not lines:
            self._flash("В буфере нет ключа", DANGER); return
        self.links = lines; self.selected_idx = 0
        self.render_servers(); self.save(silent=True); self.do_ping()
        self._flash(f"Добавлено серверов: {len(lines)}", OK)

    def add_sub(self):
        dlg = ctk.CTkInputDialog(text="Вставь ссылку-подписку (https://…):", title="Подписка")
        v = dlg.get_input()
        if v and v.startswith("http"):
            self.sub_url = v.strip(); self._pull_sub()

    def add_menu(self):
        """Всплывающее меню под кнопкой ＋ (как в Happ)."""
        if getattr(self, "_menu", None) is not None:
            try: self._menu.destroy()
            except Exception: pass
            self._menu = None; return
        m = ctk.CTkToplevel(self.root); self._menu = m
        m.overrideredirect(True); m.configure(fg_color=CARD)
        m.attributes("-topmost", True)
        x = self.root.winfo_rootx() + self.root.winfo_width() - 250
        y = self.root.winfo_rooty() + 60
        m.geometry(f"236x250+{x}+{y}")
        frame = ctk.CTkFrame(m, fg_color=CARD, corner_radius=18, border_width=1, border_color=SUBBORDER)
        frame.pack(fill="both", expand=True)
        def item(icon, text, cmd):
            def run():
                try: m.destroy()
                except Exception: pass
                self._menu = None; cmd()
            b = ctk.CTkButton(frame, text=f"  {icon}   {text}", anchor="w", height=44,
                              corner_radius=0, fg_color="transparent", hover_color=CARD2,
                              text_color=TEXT, font=ctk.CTkFont(FONT, 14), command=run)
            b.pack(fill="x", padx=6, pady=1)
        item("🔗", "URL подписки", self.add_sub)
        item("📋", "Вставить из буфера", self.paste_key)
        item("✍", "Ручной ввод", self.add_key)
        item("📄", "Копировать JSON", self.copy_json)
        m.bind("<FocusOut>", lambda e: (m.destroy(), setattr(self, "_menu", None)))
        m.after(200, lambda: (m.lift(), m.focus_force()))

    def copy_json(self):
        link = self._current_link()
        if not link:
            self._flash("Нет выбранного сервера", DANGER); return
        try:
            cfg = build_xray_config(parse_link(link))
            self.root.clipboard_clear()
            self.root.clipboard_append(json.dumps(cfg, ensure_ascii=False, indent=2))
            self._flash("JSON скопирован ✓", OK)
        except Exception as e:
            self._flash(f"Ошибка: {e}", DANGER)

    def _open_tg(self):
        import webbrowser; webbrowser.open(TELEGRAM_URL)

    def _flash(self, txt, color=MUTED):
        self.status.configure(text=txt, text_color=color)
        self.root.after(2500, lambda: self.status.configure(
            text=("Подключено" if self.connected else "Отключено"),
            text_color=(OK if self.connected else MUTED)))

    def _power_icon(self, color, size=72):
        """Рисует символ питания (кольцо с разрывом + вертикальная черта)."""
        try:
            from PIL import Image, ImageDraw
            S = size * 4  # рисуем крупно и уменьшаем — сглаживание
            im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            w = int(S * 0.09)
            pad = int(S * 0.22)
            d.arc([pad, pad, S - pad, S - pad], start=120, end=60, fill=color, width=w)
            cx = S // 2
            d.line([(cx, int(S * 0.16)), (cx, int(S * 0.5))], fill=color, width=w)
            im = im.resize((size, size), Image.LANCZOS)
            return ctk.CTkImage(im, size=(size, size))
        except Exception:
            return None

    def _flag_image(self, code):
        if code in self._flag_cache:
            return self._flag_cache[code]
        img = None
        try:
            path = resource_path(os.path.join("flags", code.lower() + ".png"))
            if os.path.exists(path):
                from PIL import Image
                img = ctk.CTkImage(Image.open(path), size=(26, 18))
        except Exception:
            img = None
        self._flag_cache[code] = img
        return img

    # ── Список серверов ──
    def render_servers(self):
        for w in self.server_list.winfo_children():
            w.destroy()
        self._ping_lbls = {}
        # обновляем шапку из данных подписки
        si = self.sub_info or {}
        if hasattr(self, "traffic_lbl"):
            self.traffic_lbl.configure(text=si.get("traffic", "∞"))
        if hasattr(self, "sub_sub"):
            sub = si.get("expire", "Автообновление подписки")
            self.sub_sub.configure(text=si.get("title", "JEFFvpn") + ("  ·  " + sub if si else ""))
        if not self.links:
            ctk.CTkLabel(self.server_list,
                text="Добавь ключ или подписку —\nкнопка  ＋  сверху справа",
                font=ctk.CTkFont(FONT, 12), text_color=MUTED).pack(pady=40)
            return
        for i, ln in enumerate(self.links):
            raw = unquote(ln.split("#", 1)[1]) if "#" in ln else f"Сервер {i+1}"
            name = clean_name(raw)
            code = country_of(raw); sel = (i == self.selected_idx)
            row = ctk.CTkFrame(self.server_list, fg_color=(CARD2 if sel else "transparent"),
                               corner_radius=14)
            row.pack(fill="x", pady=2)
            flag = self._flag_image(code)
            if flag:
                badge = ctk.CTkLabel(row, image=flag, text="", width=32, height=24)
            else:
                badge = ctk.CTkLabel(row, text=code, width=32, height=24, corner_radius=6,
                                     fg_color=ACC, text_color="white", font=ctk.CTkFont(FONT, 11, "bold"))
            badge.pack(side="left", padx=(12, 10), pady=10)
            m = ctk.CTkFrame(row, fg_color="transparent"); m.pack(side="left", fill="x", expand=True)
            ctk.CTkLabel(m, text=name, font=ctk.CTkFont(FONT, 14, "bold"),
                         text_color=TEXT, anchor="w").pack(anchor="w")
            ctk.CTkLabel(m, text=proto_line(ln), font=ctk.CTkFont(FONT, 10),
                         text_color=MUTED, anchor="w").pack(anchor="w")
            ms = self.pings.get(i)
            ptxt, pcol = self._ping_text(ms)
            pl = ctk.CTkLabel(row, text=ptxt, font=ctk.CTkFont(FONT, 11, "bold"), text_color=pcol)
            pl.pack(side="right", padx=(0, 12))
            self._ping_lbls[i] = pl
            for w in (row, m, badge) + tuple(m.winfo_children()):
                w.bind("<Button-1>", lambda e, idx=i: self.select_server(idx))

    @staticmethod
    def _ping_text(ms):
        if ms is None: return "", MUTED
        if ms == "x": return "—", DANGER
        col = OK if ms < 150 else (WARN if ms < 400 else DANGER)
        return f"{ms} мс", col

    def select_server(self, idx):
        self.selected_idx = idx; self.render_servers()
        self.do_ping()
        if self.connected: self.disconnect(); self.connect()

    def _current_link(self):
        if self.links and 0 <= self.selected_idx < len(self.links):
            return self.links[self.selected_idx]
        return ""

    # ── Пинг ── (замеряет все серверы разом, как в Happ)
    def do_ping(self):
        if not self.links:
            return
        for i, ln in enumerate(self.links):
            host, port = link_host_port(ln)
            if not host:
                continue
            def worker(idx=i, h=host, p=port):
                ms = tcp_ping(h, p)
                self.pings[idx] = ms if ms is not None else "x"
                self.root.after(0, lambda: self._update_ping_lbl(idx))
            threading.Thread(target=worker, daemon=True).start()

    def _update_ping_lbl(self, idx):
        lbl = self._ping_lbls.get(idx)
        if lbl is not None and lbl.winfo_exists():
            txt, col = self._ping_text(self.pings.get(idx))
            lbl.configure(text=txt, text_color=col)

    # ── Подключение ──
    def toggle(self):
        self.disconnect() if self.connected else self.connect()

    def connect(self):
        link = self._current_link()
        if not link:
            self._flash("Добавь и выбери сервер", DANGER); return
        try:
            outbound = parse_link(link)
        except Exception as e:
            self._flash(f"Неверный ключ: {e}", DANGER); return
        xray = resource_path("xray.exe" if os.name == "nt" else "xray")
        if not os.path.exists(xray):
            self._flash("Не найден xray", DANGER); return
        cfg = os.path.join(os.path.dirname(CONFIG_FILE), ".jeffton_xray.json")
        with open(cfg, "w", encoding="utf-8") as f:
            json.dump(build_xray_config(outbound), f)
        try:
            flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            self.proc = subprocess.Popen([xray, "run", "-config", cfg],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags)
        except Exception as e:
            self._flash(f"Ядро: {e}", DANGER); return
        try: set_system_proxy(True)
        except Exception: pass
        self.connected = True
        self.power.configure(fg_color=OK, hover_color="#28b866", image=self._icon_on)
        nm = clean_name(unquote(link.split("#", 1)[1])) if "#" in link else "Сервер"
        self.status.configure(text=f"Подключено · {nm}", text_color=OK)

    def disconnect(self):
        try: set_system_proxy(False)
        except Exception: pass
        if self.proc:
            try: self.proc.terminate()
            except Exception: pass
            self.proc = None
        self.connected = False
        self.power.configure(fg_color=POWER_OFF, hover_color=POWER_HOVER, image=self._icon_off)
        self.status.configure(text="Отключено", text_color=MUTED)

    # ── Сохранение ──
    def save(self, silent=False):
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump({"links": self.links, "sub_url": self.sub_url,
                           "autoconnect": self.autoconnect, "prefs": self.prefs}, f)
            if not silent: self._flash("Сохранено ✓", OK)
        except Exception:
            pass

    def load_saved(self):
        try:
            with open(CONFIG_FILE, encoding="utf-8") as f:
                d = json.load(f)
                self.links = d.get("links", []) or []
                self.sub_url = d.get("sub_url", "")
                self.autoconnect = bool(d.get("autoconnect", False))
                self.prefs = d.get("prefs", {}) or {}
        except Exception:
            pass

    def update_sub(self):
        if not self.sub_url:
            self._flash("Нет подписки", DANGER); return
        self._pull_sub(reconnect=True)

    def _pull_sub(self, reconnect=False):
        self._flash("Обновление подписки…", MUTED); self.root.update()
        try:
            self.links, self.sub_info = fetch_subscription(self.sub_url)
            if not self.links:
                self._flash("Подписка пустая", DANGER); return
            self.selected_idx = 0; self.render_servers(); self.save(silent=True); self.do_ping()
            self._flash(f"Серверов: {len(self.links)} ✓", OK)
            if reconnect and self.connected: self.disconnect(); self.connect()
        except Exception as e:
            self._flash(f"Ошибка: {e}", DANGER)

    # ── Обновление приложения ──
    def check_update(self):
        def worker():
            try:
                import ssl
                ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
                req = urllib.request.Request(VERSION_URL, headers={"User-Agent": "JeffTUN"})
                latest = urllib.request.urlopen(req, timeout=10, context=ctx).read().decode().strip()
                if latest and self._newer(latest, APP_VERSION):
                    self.root.after(0, lambda: self._show_update(latest))
            except Exception:
                pass
        threading.Thread(target=worker, daemon=True).start()

    @staticmethod
    def _newer(a, b):
        try: return [int(x) for x in a.split(".")] > [int(x) for x in b.split(".")]
        except Exception: return a != b

    def _show_update(self, latest):
        self._latest = latest
        if self.update_bar: return
        self.update_bar = ctk.CTkFrame(self.root, fg_color=UPDCARD, corner_radius=14, border_width=1, border_color=OK)
        self.update_bar.place(relx=0.5, rely=0.02, anchor="n")
        self._ulbl = ctk.CTkLabel(self.update_bar, text=f"🎉 Новая версия {latest}",
                                  font=ctk.CTkFont(FONT, 12, "bold"), text_color="#1a8f43")
        self._ulbl.pack(side="left", padx=14, pady=8)
        ctk.CTkButton(self.update_bar, text="Обновить", width=90, height=28, corner_radius=14,
                      fg_color=OK, hover_color="#28b14a", text_color="#08160c",
                      font=ctk.CTkFont(FONT, 12, "bold"), command=self.do_self_update).pack(side="right", padx=8, pady=6)

    def do_self_update(self):
        if sys.platform == "darwin" or not getattr(sys, "frozen", False):
            import webbrowser; webbrowser.open(RELEASES_URL); return
        asset = "JeffTUN.exe" if os.name == "nt" else "JeffTUN-linux"
        url = f"{DOWNLOAD_BASE}/{asset}"; cur = sys.executable; new = cur + ".new"
        def setl(t):
            if hasattr(self, "_ulbl"):
                self.root.after(0, lambda: self._ulbl.configure(text=t))
        setl("⏳ Скачиваю… 0%")
        def worker():
            try:
                import ssl
                ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
                req = urllib.request.Request(url, headers={"User-Agent": "JeffTUN"})
                try:
                    if os.path.exists(new): os.remove(new)
                except Exception: pass
                with urllib.request.urlopen(req, timeout=60, context=ctx) as r:
                    total = int(r.headers.get("Content-Length", 0)); done = 0
                    with open(new, "wb") as f:
                        while True:
                            chunk = r.read(65536)
                            if not chunk: break
                            f.write(chunk); done += len(chunk)
                            if total: setl(f"⏳ Скачиваю… {done*100//total}%")
                size = os.path.getsize(new)
                # СТРОГАЯ проверка целостности — иначе будет битый exe
                if size < 1_000_000:
                    raise Exception("файл слишком мал")
                if total and size != total:
                    raise Exception("скачан не полностью")
                with open(new, "rb") as f:
                    head = f.read(2)
                if os.name == "nt" and head != b"MZ":
                    raise Exception("не Windows-программа")
                if os.name != "nt" and head != b"\x7fE":
                    raise Exception("не Linux-программа")
                setl("✅ Применяю…")
                self.root.after(0, lambda: self._apply_update(cur, new))
            except Exception as e:
                try:
                    if os.path.exists(new): os.remove(new)
                except Exception: pass
                setl(f"Ошибка — жми ещё раз")
        threading.Thread(target=worker, daemon=True).start()

    def _apply_update(self, cur, new):
        if self.connected: self.disconnect()
        try:
            if os.name == "nt":
                old = cur + ".old"
                bat = cur + "_upd.bat"
                # Работающий exe нельзя удалить, но МОЖНО переименовать → так безопасно
                with open(bat, "w") as f:
                    f.write("@echo off\r\nping 127.0.0.1 -n 5 >nul\r\n"
                            ":retry\r\n"
                            f'if exist "{cur}" (move /y "{cur}" "{old}" >nul 2>&1)\r\n'
                            f'move /y "{new}" "{cur}" >nul 2>&1\r\n'
                            f'if not exist "{cur}" (ping 127.0.0.1 -n 2 >nul & goto retry)\r\n'
                            f'start "" "{cur}"\r\n'
                            f'ping 127.0.0.1 -n 2 >nul\r\n'
                            f'del /f /q "{old}" >nul 2>&1\r\n'
                            f'del /f /q "{new}" >nul 2>&1\r\n'
                            f'del "%~f0"\r\n')
                subprocess.Popen(["cmd", "/c", bat], creationflags=subprocess.CREATE_NO_WINDOW)
            else:
                os.chmod(new, 0o755); sh = cur + "_upd.sh"
                with open(sh, "w") as f:
                    f.write(f'#!/bin/sh\nsleep 2\nmv -f "{new}" "{cur}"\nchmod +x "{cur}"\nnohup "{cur}" >/dev/null 2>&1 &\nrm -- "$0"\n')
                os.chmod(sh, 0o755); subprocess.Popen(["/bin/sh", sh])
            self.root.after(300, self.on_close)
        except Exception:
            pass

    # ── Настройки ──
    def open_settings(self):
        win = ctk.CTkToplevel(self.root); win.title("Настройки"); win.geometry("420x600")
        win.configure(fg_color=BG)
        win.after(250, lambda: (win.lift(), win.focus_force()))
        ctk.CTkLabel(win, text="Настройки", font=ctk.CTkFont(FONT, 20, "bold"), text_color=TEXT).pack(pady=(16, 8))
        sc = ctk.CTkScrollableFrame(win, fg_color="transparent"); sc.pack(fill="both", expand=True, padx=10)
        def section(t):
            ctk.CTkLabel(sc, text=t, font=ctk.CTkFont(FONT, 10, "bold"), text_color=MUTED).pack(anchor="w", padx=10, pady=(14, 4))
            c = ctk.CTkFrame(sc, fg_color=CARD, corner_radius=16, border_width=1, border_color=BORDER); c.pack(fill="x"); return c
        def sw(card, text, key, default=False, cmd=None):
            row = ctk.CTkFrame(card, fg_color="transparent"); row.pack(fill="x", padx=14, pady=8)
            ctk.CTkLabel(row, text=text, font=ctk.CTkFont(FONT, 13), text_color=TEXT).pack(side="left")
            v = ctk.StringVar(value="on" if self.prefs.get(key, default) else "off")
            def on():
                self.prefs[key] = (v.get() == "on"); self.save(silent=True)
                if cmd: cmd(v.get() == "on")
            ctk.CTkSwitch(row, text="", variable=v, onvalue="on", offvalue="off", command=on, progress_color=ACC).pack(side="right")
        def choice(card, text, key, opts, default, on_change=None):
            row = ctk.CTkFrame(card, fg_color="transparent"); row.pack(fill="x", padx=14, pady=8)
            ctk.CTkLabel(row, text=text, font=ctk.CTkFont(FONT, 13), text_color=TEXT).pack(side="left")
            var = ctk.StringVar(value=self.prefs.get(key, default))
            def _cb(v):
                self.prefs[key] = v; self.save(silent=True)
                if on_change: on_change(v)
            ctk.CTkOptionMenu(row, values=opts, variable=var, width=130, fg_color=CARD2,
                              text_color=TEXT, button_color=ACC, button_hover_color=ACC_D,
                              command=_cb).pack(side="right")
        def link(card, text, cmd, color=TEXT):
            ctk.CTkButton(card, text=text, anchor="w", height=38, corner_radius=0, fg_color="transparent",
                          hover_color=CARD2, text_color=color, font=ctk.CTkFont(FONT, 13), command=cmd).pack(fill="x", padx=4, pady=1)

        c = section("ИНТЕРФЕЙС")
        def _theme(v):
            ctk.set_appearance_mode({"Светлая": "light", "Тёмная": "dark", "Системная": "system"}.get(v, "light"))
        choice(c, "Тема", "theme", ["Тёмная", "Светлая", "Системная"], "Тёмная", on_change=_theme)
        c = section("ЗАПУСК")
        srow = ctk.CTkFrame(c, fg_color="transparent"); srow.pack(fill="x", padx=14, pady=8)
        ctk.CTkLabel(srow, text="Автозапуск с Windows", font=ctk.CTkFont(FONT, 13), text_color=TEXT).pack(side="left")
        asv = ctk.StringVar(value="on" if get_autostart() else "off")
        ctk.CTkSwitch(srow, text="", variable=asv, onvalue="on", offvalue="off",
                      command=lambda: set_autostart(asv.get() == "on"), progress_color=ACC).pack(side="right")
        arow = ctk.CTkFrame(c, fg_color="transparent"); arow.pack(fill="x", padx=14, pady=8)
        ctk.CTkLabel(arow, text="Автоподключение", font=ctk.CTkFont(FONT, 13)).pack(side="left")
        acv = ctk.StringVar(value="on" if self.autoconnect else "off")
        ctk.CTkSwitch(arow, text="", variable=acv, onvalue="on", offvalue="off",
                      command=lambda: (setattr(self, "autoconnect", acv.get() == "on"), self.save(silent=True)),
                      progress_color=ACC).pack(side="right")
        c = section("ТУННЕЛЬ")
        choice(c, "Тип IP", "ip_type", ["IPv4", "IPv6", "Авто"], "IPv4")
        sw(c, "Фрагментирование", "fragment", False)
        sw(c, "Разрешить LAN", "lan", False)
        c = section("ДАННЫЕ")
        link(c, "🗑 Сброс (удалить ключи)", self._reset_key, color=DANGER)
        c = section("ПОДРОБНЕЕ")
        link(c, f"⬆ Проверить обновление (v{APP_VERSION})", self.do_self_update)
        link(c, "❓ FAQ", self._faq)
        link(c, "✈ Telegram  @jeffvpn", lambda: __import__("webbrowser").open(TELEGRAM_URL), color=ACC)
        link(c, "ℹ О приложении", self._about)

    def _reset_key(self):
        if not messagebox.askyesno(APP_NAME, "Удалить все ключи?"): return
        self.links = []; self.sub_url = ""; self.selected_idx = 0; self.render_servers()
        try: os.remove(CONFIG_FILE)
        except Exception: pass

    def _about(self):
        messagebox.showinfo("О приложении", f"JeffTUN VPN v{APP_VERSION}\n\nБыстрый VPN с обходом блокировок.\n"
            "VLESS (Reality), VMess, Trojan, Shadowsocks.\n\nTelegram: t.me/jeffvpn")

    def _stats(self):
        st = "Подключено" if self.connected else "Отключено"
        messagebox.showinfo("Статистика", f"Статус: {st}\nСерверов: {len(self.links)}\n"
            f"SOCKS 127.0.0.1:{SOCKS_PORT} · HTTP :{HTTP_PORT}")

    def _faq(self):
        messagebox.showinfo("FAQ", "• ＋ сверху справа — добавь ключ/подписку.\n• Выбери страну в списке.\n"
            "• Нажми круглую кнопку — подключение.\n• ↻ — обновить подписку, ◔ — пинг.\n\nt.me/jeffvpn")

    def on_close(self):
        if self.connected: self.disconnect()
        self.root.destroy()


def main():
    try:
        ctk.set_appearance_mode("dark"); ctk.set_default_color_theme("blue")
        root = ctk.CTk(); root.configure(fg_color=BG)
        JeffTUN(root); root.mainloop()
    except Exception:
        # Ни при каких сбоях (в т.ч. после самообновления) не показываем
        # окно «Failed to execute script» — тихо логируем в файл рядом с exe.
        try:
            import traceback
            log = os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), "jefftun_error.log")
            with open(log, "a", encoding="utf-8") as f:
                f.write(traceback.format_exc() + "\n")
        except Exception:
            pass


if __name__ == "__main__":
    main()
