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
APP_VERSION = "5.5"
VERSION_URL = "https://raw.githubusercontent.com/kerimlirashad/kerimlirashad/claude/icq-messenger-b0bt2n/qipcall_client/version.txt"
RELEASES_URL = "https://github.com/kerimlirashad/kerimlirashad/releases/tag/jefftun"
DOWNLOAD_BASE = "https://github.com/kerimlirashad/kerimlirashad/releases/download/jefftun"
TELEGRAM_URL = "https://t.me/jeffvpn"
SOCKS_PORT = 10808
HTTP_PORT = 10809
CONFIG_FILE = os.path.join(os.path.expanduser("~"), ".jeffton_config.json")

# Тёмная iOS-палитра (по умолчанию)
BG      = "#0f1116"   # общий фон
SIDE    = "#161922"   # левая панель
PANEL   = "#13151c"   # средняя панель
CARD    = "#1c1f29"   # карточки
CARD2   = "#262a37"   # выбранная/вторичная
BORDER  = "#2b2f3c"   # тонкие рамки
ACC     = "#6c7bff"   # индиго
ACC_D   = "#5867ec"
TEXT    = "#eceef4"
MUTED   = "#8b8f9e"
OK      = "#34d17a"
WARN    = "#f5c451"
DANGER  = "#ff5c5c"
# Спец-цвета карточек (адаптированы под тёмную)
SUBCARD   = "#1a1f36"
SUBBORDER = "#2e3660"
UPDCARD   = "#12291b"
POWER_HOVER = "#242836"


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
    n = (name or "").strip()
    # убираем ведущие эмодзи-флаги и служебные символы
    n = re.sub(r"^[\U0001F1E6-\U0001F1FF\s\-_|·•]+", "", n)
    # 'frFrance' → 'France': только СТРОЧНЫЙ код-префикс перед заглавной буквой
    # (не трогаем 'USA', 'UK' и т.п. — они уже заглавные)
    n = re.sub(r"^[a-z]{2}(?=[A-ZА-Я])", "", n)
    return n.strip() or (name or "").strip()


def proto_line(link):
    try:
        scheme = link.split("://", 1)[0].upper()
        if link.startswith("vmess://"):
            raw = link[8:]; raw += "=" * (-len(raw) % 4)
            obj = json.loads(base64.b64decode(raw).decode())
            return f"VMESS · {obj.get('net','tcp').upper()} · {'TLS' if obj.get('tls') else '—'}"
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


def _linux_autostart_path():
    d = os.path.join(os.path.expanduser("~"), ".config", "autostart")
    return os.path.join(d, "jefftun.desktop")


def set_autostart(enable):
    if not getattr(sys, "frozen", False): return
    if os.name == "nt":
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_ALL_ACCESS)
        if enable: winreg.SetValueEx(key, "JeffTUN", 0, winreg.REG_SZ, f'"{sys.executable}"')
        else:
            try: winreg.DeleteValue(key, "JeffTUN")
            except Exception: pass
        winreg.CloseKey(key)
    elif sys.platform != "darwin":
        # Linux: файл .desktop в ~/.config/autostart
        path = _linux_autostart_path()
        try:
            if enable:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    f.write("[Desktop Entry]\nType=Application\nName=JeffTUN VPN\n"
                            f"Exec=\"{sys.executable}\"\nX-GNOME-Autostart-enabled=true\nTerminal=false\n")
            elif os.path.exists(path):
                os.remove(path)
        except Exception:
            pass


def get_autostart():
    if os.name == "nt":
        try:
            import winreg
            k = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run")
            winreg.QueryValueEx(k, "JeffTUN"); winreg.CloseKey(k); return True
        except Exception:
            return False
    if sys.platform != "darwin":
        return os.path.exists(_linux_autostart_path())
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


def _sub_title(url):
    try:
        h = urlparse(url).hostname or url
        return h.replace("www.", "")[:22]
    except Exception:
        return "Подписка"


def tcp_ping(host, port, timeout=3.0):
    """Берём лучший из 3 замеров TCP-хендшейка — стабильнее и точнее."""
    best = None
    for _ in range(3):
        try:
            s = time.time()
            c = socket.create_connection((host, port), timeout=timeout); c.close()
            ms = int((time.time() - s) * 1000)
            if best is None or ms < best:
                best = ms
        except Exception:
            pass
    return best


FONT = "SF Pro Display"


# ══ ПРИЛОЖЕНИЕ ═══════════════════════════════════════════════════════════════
class JeffTUN:
    def __init__(self, root):
        self.root = root
        self.proc = None
        self.connected = False
        self.links = []            # текущий отображаемый список (по активной вкладке)
        self.manual_links = []     # ключи, добавленные вручную
        self.subs = []             # [{"url","title"}] — несколько подписок
        self.sub_cache = {}        # url -> {"links":[...], "info":{...}}
        self.active_tab = "all"    # "all" | "manual" | url подписки
        self.sub_url = ""          # совместимость (последняя подписка)
        self.autoconnect = False
        self.prefs = {}
        self.selected_idx = 0
        self.sub_info = {}
        self._flag_cache = {}
        self.pings = {}
        self._ping_lbls = {}
        self.side_collapsed = False

        root.title(APP_NAME); root.geometry("780x520"); root.minsize(740, 480)
        try:
            if os.name == "nt":
                ico = resource_path("icon.ico")
                if os.path.exists(ico): root.iconbitmap(ico)
        except Exception:
            pass

        root.grid_columnconfigure(1, weight=1)
        root.grid_columnconfigure(2, weight=1)
        root.grid_rowconfigure(0, weight=1)

        # ── ЛЕВАЯ ПАНЕЛЬ ИКОНОК ──
        side = ctk.CTkFrame(root, width=64, fg_color=SIDE, corner_radius=0)
        side.grid(row=0, column=0, sticky="nsw"); side.grid_propagate(False)
        def sicon(txt, cmd, active=False):
            ctk.CTkButton(side, text=txt, width=40, height=40, corner_radius=12,
                          fg_color=(CARD if active else "transparent"), hover_color=CARD,
                          text_color=(ACC if active else MUTED), font=ctk.CTkFont(FONT, 17),
                          command=cmd).pack(pady=5)
        ctk.CTkLabel(side, text="", height=8).pack()
        sicon("🌐", lambda: None, active=True)
        sicon("＋", self.add_key)
        sicon("🗑", self.clear_servers)
        ctk.CTkLabel(side, text="", height=1).pack(expand=True, fill="y")
        sicon("ℹ", self._about)
        self.side = side

        # ── СРЕДНЯЯ ПАНЕЛЬ: СЕРВЕРЫ ──
        mid = ctk.CTkFrame(root, fg_color=PANEL, corner_radius=0)
        mid.grid(row=0, column=1, sticky="nsew")
        mid.grid_rowconfigure(3, weight=1); mid.grid_columnconfigure(0, weight=1)
        # заголовок + кнопка «свернуть боковую панель»
        hrow = ctk.CTkFrame(mid, fg_color="transparent"); hrow.grid(row=0, column=0, sticky="ew", padx=18, pady=(18, 6))
        hrow.grid_columnconfigure(1, weight=1)
        ctk.CTkButton(hrow, text="⟨", width=34, height=34, corner_radius=10, fg_color=CARD,
                      hover_color=CARD2, text_color=TEXT, font=ctk.CTkFont(FONT, 16),
                      command=self.toggle_side).grid(row=0, column=0, sticky="w", padx=(4, 8))
        ctk.CTkLabel(hrow, text="Серверы", font=ctk.CTkFont(FONT, 22, "bold"),
                     text_color=TEXT).grid(row=0, column=1, sticky="w")
        srow = ctk.CTkFrame(mid, fg_color="transparent"); srow.grid(row=1, column=0, sticky="ew", padx=18)
        self.search = ctk.CTkEntry(srow, placeholder_text="Поиск…", height=38, corner_radius=12,
                                   fg_color=CARD, border_width=0, text_color=TEXT)
        self.search.pack(side="left", fill="x", expand=True)
        self.search.bind("<KeyRelease>", lambda e: self.render_servers())
        ctk.CTkButton(srow, text="⟳", width=38, height=38, corner_radius=12, fg_color=CARD,
                      hover_color=CARD2, text_color=ACC, border_width=0,
                      command=self.update_sub).pack(side="left", padx=(6, 0))
        # ── ВКЛАДКИ подписок ──
        self.tabs_frame = ctk.CTkFrame(mid, fg_color="transparent")
        self.tabs_frame.grid(row=2, column=0, sticky="ew", padx=14, pady=(8, 0))
        self.server_list = ctk.CTkScrollableFrame(mid, fg_color="transparent",
                                                  scrollbar_button_color=PANEL,
                                                  scrollbar_button_hover_color=PANEL)
        # полностью прячем полосу прокрутки (та самая «синяя линия»); колесо мыши работает
        try:
            self.server_list._scrollbar.grid_forget()
        except Exception:
            pass
        self.server_list.grid(row=3, column=0, sticky="nsew", padx=14, pady=8)
        self.empty_lbl = ctk.CTkLabel(self.server_list,
            text="Добавь ключ или подписку —\nкнопка ＋ слева или «Вставить» ниже",
            font=ctk.CTkFont(FONT, 12), text_color=MUTED)
        brow = ctk.CTkFrame(mid, fg_color="transparent"); brow.grid(row=4, column=0, sticky="ew", padx=18, pady=(4, 16))
        ctk.CTkButton(brow, text="📋 Вставить", height=36, corner_radius=18, fg_color=ACC, hover_color=ACC_D,
                      text_color="white", font=ctk.CTkFont(FONT, 12, "bold"), command=self.paste_key).pack(side="left", fill="x", expand=True, padx=(0, 5))
        ctk.CTkButton(brow, text="🔗 Подписка", height=36, corner_radius=18, fg_color=CARD, hover_color=CARD2,
                      text_color=TEXT, border_width=0,
                      font=ctk.CTkFont(FONT, 12, "bold"), command=self.add_sub).pack(side="left", fill="x", expand=True, padx=(5, 0))

        # ── ПРАВАЯ ПАНЕЛЬ: КНОПКА ВКЛ ──
        right = ctk.CTkFrame(root, fg_color=BG, corner_radius=0)
        right.grid(row=0, column=2, sticky="nsew")
        right.grid_rowconfigure(0, weight=1); right.grid_rowconfigure(3, weight=1)
        right.grid_columnconfigure(0, weight=1)
        # логотип-заголовок (картинка It's Jeff! + подпись)
        h = ctk.CTkFrame(right, fg_color="transparent"); h.grid(row=0, column=0, pady=(20, 0), sticky="n")
        self._logo_ref = None
        try:
            from PIL import Image
            lp = resource_path("logo_white.png")
            if os.path.exists(lp):
                im = Image.open(lp)
                ratio = im.width / im.height
                # крупный логотип, фон уже под цвет приложения
                H = 120
                img = ctk.CTkImage(im, size=(int(H * ratio), H))
                ctk.CTkLabel(h, image=img, text="").pack()
                self._logo_ref = img
        except Exception:
            pass
        if self._logo_ref is None:
            row = ctk.CTkFrame(h, fg_color="transparent"); row.pack()
            ctk.CTkLabel(row, text="Jeff", font=ctk.CTkFont(FONT, 22, "bold"), text_color=TEXT).pack(side="left")
            ctk.CTkLabel(row, text="TUN", font=ctk.CTkFont(FONT, 22, "bold"), text_color=ACC).pack(side="left")
        # чистая круглая кнопка питания (без кольца — чтобы не было «овала»)
        self._icon_off = self._power_icon(MUTED, 64)
        self._icon_on = self._power_icon("#ffffff", 64)
        self.power = ctk.CTkButton(right, text="", image=self._icon_off,
                                   width=132, height=132, corner_radius=66,
                                   fg_color=CARD, hover_color=POWER_HOVER, border_width=2,
                                   border_color=BORDER, command=self.toggle)
        self.power.grid(row=1, column=0, pady=16)
        self.status = ctk.CTkLabel(right, text="Отключено", font=ctk.CTkFont(FONT, 15, "bold"), text_color=MUTED)
        self.status.grid(row=2, column=0, pady=(2, 2))
        self.cur_lbl = ctk.CTkLabel(right, text="", font=ctk.CTkFont(FONT, 12), text_color=MUTED)
        self.cur_lbl.grid(row=3, column=0, sticky="n")
        bottom = ctk.CTkFrame(right, fg_color="transparent"); bottom.grid(row=4, column=0, pady=(0, 20))
        ctk.CTkButton(bottom, text="Тест пинга", width=180, height=38, corner_radius=19,
                      fg_color=ACC, hover_color=ACC_D, text_color="white",
                      font=ctk.CTkFont(FONT, 13, "bold"), command=self.do_ping).pack(pady=(0, 6))
        self.ping_lbl = ctk.CTkLabel(bottom, text="", font=ctk.CTkFont(FONT, 13, "bold"), text_color=MUTED)
        self.ping_lbl.pack(pady=(0, 6))
        ctk.CTkButton(bottom, text="Обновить подписку", width=180, height=38, corner_radius=19,
                      fg_color=CARD, hover_color=CARD2, text_color=TEXT, border_width=1,
                      border_color=BORDER, font=ctk.CTkFont(FONT, 13, "bold"),
                      command=self.update_sub).pack()
        ctk.CTkLabel(right, text=f"v{APP_VERSION} · t.me/jeffvpn", font=ctk.CTkFont(FONT, 9),
                     text_color="#48484e").grid(row=5, column=0, pady=(0, 8))

        # плашка обновления (поверх, снизу справа при апдейте)
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
    def _add_manual(self, keys):
        existing = set(self.manual_links)
        added = [k for k in keys if "://" in k and k not in existing]
        self.manual_links += added
        self.active_tab = "all"
        self.selected_idx = 0
        self._rebuild_links(); self.render_servers(); self.save(silent=True); self.do_ping()
        return len(added)

    def add_key(self):
        dlg = ctk.CTkInputDialog(text="Вставь ключ (vless/vmess/trojan/ss):", title="Добавить ключ")
        v = dlg.get_input()
        if v and "://" in v:
            self._add_manual([v.strip()])

    def paste_key(self):
        try: data = self.root.clipboard_get()
        except Exception: self._flash("Буфер пуст", DANGER); return
        lines = [l.strip() for l in data.splitlines() if "://" in l and not l.strip().startswith("http")]
        subs = [l.strip() for l in data.splitlines() if l.strip().startswith("http")]
        if subs:
            self._add_sub_url(subs[0]); return
        if not lines:
            self._flash("В буфере нет ключа", DANGER); return
        n = self._add_manual(lines)
        self._flash(f"Добавлено серверов: {n}", OK)

    def add_sub(self):
        dlg = ctk.CTkInputDialog(text="Вставь ссылку-подписку (https://…):", title="Подписка")
        v = dlg.get_input()
        if v and v.startswith("http"):
            self._add_sub_url(v.strip())

    def _add_sub_url(self, url):
        if any(s["url"] == url for s in self.subs):
            self._flash("Подписка уже добавлена", WARN)
        else:
            self.subs.append({"url": url, "title": _sub_title(url)})
        self.sub_url = url
        self._flash("Загружаю подписку…", MUTED); self.root.update()
        try:
            links, info = fetch_subscription(url)
            self.sub_cache[url] = {"links": links, "info": info}
            for s in self.subs:
                if s["url"] == url and info.get("title"):
                    s["title"] = info["title"]
            self.active_tab = url; self.selected_idx = 0
            self._rebuild_links(); self.render_servers(); self.save(silent=True); self.do_ping()
            self._flash(f"Серверов: {len(links)} ✓", OK if links else DANGER)
        except Exception as e:
            self._flash(f"Ошибка: {e}", DANGER)

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
            # разрыв кольца — СВЕРХУ (270°), там же вертикальная черта
            d.arc([pad, pad, S - pad, S - pad], start=-60, end=240, fill=color, width=w)
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

    def toggle_side(self):
        self.side_collapsed = not self.side_collapsed
        if self.side_collapsed:
            self.side.grid_remove()
        else:
            self.side.grid()

    def render_tabs(self):
        for w in self.tabs_frame.winfo_children():
            w.destroy()
        # вкладки показываем только если есть что переключать
        if not self.subs and not self.manual_links:
            return
        tabs = [("all", "Все")]
        if self.manual_links:
            tabs.append(("manual", "Мои ключи"))
        for s in self.subs:
            tabs.append((s["url"], s.get("title") or "Подписка"))
        if len(tabs) <= 1:
            return
        for key, label in tabs:
            act = (self.active_tab == key)
            ctk.CTkButton(self.tabs_frame, text=label, height=28, corner_radius=14,
                          fg_color=(ACC if act else CARD), hover_color=(ACC_D if act else CARD2),
                          text_color=("white" if act else MUTED), font=ctk.CTkFont(FONT, 11, "bold"),
                          command=lambda k=key: self.switch_tab(k)).pack(side="left", padx=(0, 6), pady=2)

    # ── Список серверов ──
    def render_servers(self):
        self.render_tabs()
        for w in self.server_list.winfo_children():
            w.destroy()
        q = (self.search.get() if hasattr(self, "search") else "").lower().strip()
        # Карточка подписки (тариф/остаток/дни)
        if self.sub_info:
            si = self.sub_info
            card = ctk.CTkFrame(self.server_list, fg_color=SUBCARD, corner_radius=12,
                                border_width=0)
            card.pack(fill="x", pady=(0, 8))
            ctk.CTkLabel(card, text=si.get("title", "JeffTUN VPN"),
                         font=ctk.CTkFont(FONT, 14, "bold"), text_color=ACC, anchor="w").pack(anchor="w", padx=14, pady=(10, 2))
            ctk.CTkLabel(card, text=f"{si.get('traffic','')}   ·   {si.get('expire','')}",
                         font=ctk.CTkFont(FONT, 11), text_color=MUTED, anchor="w").pack(anchor="w", padx=14, pady=(0, 10))
        if not self.links:
            self.empty_lbl = ctk.CTkLabel(self.server_list,
                text="Добавь ключ или подписку —\nкнопка ＋ или «Вставить»",
                font=ctk.CTkFont(FONT, 12), text_color=MUTED)
            self.empty_lbl.pack(pady=40)
            return
        self._ping_lbls = {}
        for i, ln in enumerate(self.links):
            raw = unquote(ln.split("#", 1)[1]) if "#" in ln else f"Сервер {i+1}"
            name = clean_name(raw)
            if q and q not in name.lower():
                continue
            code = country_of(raw); sel = (i == self.selected_idx)
            row = ctk.CTkFrame(self.server_list, fg_color=(CARD2 if sel else CARD),
                               corner_radius=14, border_width=0)
            row.pack(fill="x", pady=3)
            flag = self._flag_image(code)
            if flag:
                badge = ctk.CTkLabel(row, image=flag, text="", width=32, height=24)
            else:
                badge = ctk.CTkLabel(row, text=code, width=32, height=24, corner_radius=6,
                                     fg_color=ACC, text_color="white", font=ctk.CTkFont(FONT, 11, "bold"))
            badge.pack(side="left", padx=(14, 10), pady=11)
            m = ctk.CTkFrame(row, fg_color="transparent"); m.pack(side="left", fill="x", expand=True)
            ctk.CTkLabel(m, text=name, font=ctk.CTkFont(FONT, 14, "bold"), text_color=TEXT, anchor="w").pack(anchor="w")
            ctk.CTkLabel(m, text=proto_line(ln), font=ctk.CTkFont(FONT, 10), text_color=MUTED, anchor="w").pack(anchor="w")
            # пинг сервера справа
            ptxt, pcol = self._ping_text(self.pings.get(i))
            pl = ctk.CTkLabel(row, text=ptxt, font=ctk.CTkFont(FONT, 11, "bold"), text_color=pcol)
            pl.pack(side="right", padx=(0, 8))
            self._ping_lbls[i] = pl
            # кнопка удаления сервера
            ctk.CTkButton(row, text="✕", width=26, height=26, corner_radius=13,
                          fg_color="transparent", hover_color=DANGER, text_color=MUTED,
                          font=ctk.CTkFont(FONT, 13, "bold"),
                          command=lambda idx=i: self.delete_server(idx)).pack(side="right", padx=(2, 8))
            ctk.CTkLabel(row, text=("✓" if sel else "›"), text_color=(OK if sel else MUTED),
                         font=ctk.CTkFont(FONT, 15, "bold")).pack(side="right", padx=(4, 4))
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
        nm = clean_name(unquote(self.links[idx].split("#", 1)[1])) if "#" in self.links[idx] else f"Сервер {idx+1}"
        self.cur_lbl.configure(text=nm)
        self.do_ping()
        if self.connected: self.disconnect(); self.connect()

    def delete_server(self, idx):
        # Мгновенное удаление без модальных окон — надёжно и без ошибок
        try:
            if not (0 <= idx < len(self.links)):
                return
            was_current = (idx == self.selected_idx)
            link = self.links[idx]
            # удаляем это значение из источника (ручные ключи и все подписки)
            self.manual_links = [l for l in self.manual_links if l != link]
            for url, c in self.sub_cache.items():
                c["links"] = [l for l in c.get("links", []) if l != link]
            self.pings = {}
            if was_current and self.connected:
                self.disconnect()
            self._rebuild_links()
            self.render_servers()
            self.save(silent=True); self.do_ping()
            self._flash("Сервер удалён", MUTED)
        except Exception as e:
            self._flash(f"Не удалось удалить: {e}", DANGER)

    def clear_servers(self):
        try:
            if not self.links:
                self._flash("Список уже пуст", MUTED); return
            if self.connected: self.disconnect()
            # чистим ТОЛЬКО активную вкладку, чтобы можно было удалять по подпискам
            tab = self.active_tab
            if tab == "manual":
                self.manual_links = []
            elif tab != "all" and tab in self.sub_cache:
                self.subs = [s for s in self.subs if s["url"] != tab]
                self.sub_cache.pop(tab, None)
                self.active_tab = "all"
            else:
                self.manual_links = []; self.subs = []; self.sub_cache = {}
            self.pings = {}; self.selected_idx = 0
            self._rebuild_links(); self.render_servers()
            self.save(silent=True)
            self._flash("Очищено", MUTED)
        except Exception as e:
            self._flash(f"Ошибка: {e}", DANGER)

    def _current_link(self):
        if self.links and 0 <= self.selected_idx < len(self.links):
            return self.links[self.selected_idx]
        return ""

    # ── Пинг ── (меряем все серверы разом и показываем в каждой строке)
    def do_ping(self):
        link = self._current_link()
        if link:
            host, port = link_host_port(link)
            if host:
                self.ping_lbl.configure(text="Проверка…", text_color=MUTED)
                def w0(h=host, p=port):
                    ms = tcp_ping(h, p)
                    def show():
                        if ms is None: self.ping_lbl.configure(text="Сервер недоступен", text_color=DANGER)
                        else:
                            col = OK if ms < 150 else (WARN if ms < 400 else DANGER)
                            self.ping_lbl.configure(text=f"Пинг: {ms} мс", text_color=col)
                    self.root.after(0, show)
                threading.Thread(target=w0, daemon=True).start()
        # пингуем все серверы для списка
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
        self.power.configure(fg_color=OK, hover_color="#28b866", image=self._icon_on, border_color=OK)
        self.status.configure(text="Подключено", text_color=OK)
        nm = clean_name(unquote(link.split("#", 1)[1])) if "#" in link else "Сервер"
        self.cur_lbl.configure(text=nm)

    def disconnect(self):
        try: set_system_proxy(False)
        except Exception: pass
        if self.proc:
            try: self.proc.terminate()
            except Exception: pass
            self.proc = None
        self.connected = False
        self.power.configure(fg_color=CARD, hover_color=POWER_HOVER, image=self._icon_off, border_color=BORDER)
        self.status.configure(text="Отключено", text_color=MUTED)

    # ── Сохранение ──
    def save(self, silent=False):
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump({"manual_links": self.manual_links,
                           "subs": self.subs, "sub_cache": self.sub_cache,
                           "active_tab": self.active_tab,
                           "autoconnect": self.autoconnect, "prefs": self.prefs}, f)
            if not silent: self._flash("Сохранено ✓", OK)
        except Exception:
            pass

    def load_saved(self):
        try:
            with open(CONFIG_FILE, encoding="utf-8") as f:
                d = json.load(f)
                self.manual_links = d.get("manual_links", []) or []
                self.subs = d.get("subs", []) or []
                self.sub_cache = d.get("sub_cache", {}) or {}
                self.active_tab = d.get("active_tab", "all") or "all"
                self.autoconnect = bool(d.get("autoconnect", False))
                self.prefs = d.get("prefs", {}) or {}
                # миграция со старого формата (одна подписка + links)
                old_links = d.get("links", []) or []
                old_sub = d.get("sub_url", "")
                if old_sub and not self.subs:
                    self.subs = [{"url": old_sub, "title": _sub_title(old_sub)}]
                    self.sub_cache[old_sub] = {"links": old_links, "info": {}}
                elif old_links and not self.manual_links and not self.subs:
                    self.manual_links = old_links
        except Exception:
            pass
        self._rebuild_links()

    def _rebuild_links(self):
        """Собирает self.links по активной вкладке из ручных ключей и подписок."""
        tab = self.active_tab
        if tab == "manual":
            links = list(self.manual_links)
            self.sub_info = {}
        elif tab != "all" and any(s["url"] == tab for s in self.subs):
            links = list(self.sub_cache.get(tab, {}).get("links", []))
            self.sub_info = self.sub_cache.get(tab, {}).get("info", {})
        else:  # all
            links = list(self.manual_links)
            for s in self.subs:
                links += self.sub_cache.get(s["url"], {}).get("links", [])
            self.sub_info = self.sub_cache.get(self.subs[-1]["url"], {}).get("info", {}) if self.subs else {}
        self.links = links
        if self.selected_idx >= len(self.links):
            self.selected_idx = max(0, len(self.links) - 1)

    def switch_tab(self, tab):
        self.active_tab = tab
        self.selected_idx = 0
        self._rebuild_links(); self.render_servers(); self.do_ping(); self.save(silent=True)

    def update_sub(self):
        if not self.subs:
            self._flash("Нет подписок", DANGER); return
        self._pull_all_subs(reconnect=True)

    def _pull_all_subs(self, reconnect=False):
        self._flash("Обновление подписок…", MUTED); self.root.update()
        ok = 0
        for s in self.subs:
            try:
                links, info = fetch_subscription(s["url"])
                if links:
                    self.sub_cache[s["url"]] = {"links": links, "info": info}
                    if info.get("title"): s["title"] = info["title"]
                    ok += 1
            except Exception:
                pass
        self._rebuild_links(); self.render_servers(); self.save(silent=True); self.do_ping()
        self._flash(f"Обновлено подписок: {ok}", OK if ok else DANGER)
        if reconnect and self.connected: self.disconnect(); self.connect()

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
        if not getattr(sys, "frozen", False):
            import webbrowser; webbrowser.open(RELEASES_URL); return
        if os.name == "nt":
            asset = "JeffTUN.exe"
        elif sys.platform == "darwin":
            asset = "JeffTUN-mac"
        else:
            asset = "JeffTUN-linux"
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
                    head = f.read(4)
                if os.name == "nt" and head[:2] != b"MZ":
                    raise Exception("не Windows-программа")
                elif os.name != "nt" and sys.platform != "darwin" and head[:2] != b"\x7fE":
                    raise Exception("не Linux-программа")
                elif sys.platform == "darwin":
                    # macOS: Mach-O (0xFEEDFACE/CF, 0xCAFEBABE) — проверяем магию
                    if head not in (b"\xcf\xfa\xed\xfe", b"\xce\xfa\xed\xfe",
                                    b"\xca\xfe\xba\xbe", b"\xfe\xed\xfa\xcf"):
                        raise Exception("не macOS-программа")
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
                cdir = os.path.dirname(cur)
                with open(bat, "w") as f:
                    f.write("@echo off\r\nping 127.0.0.1 -n 5 >nul\r\n"
                            ":retry\r\n"
                            f'if exist "{cur}" (move /y "{cur}" "{old}" >nul 2>&1)\r\n'
                            f'move /y "{new}" "{cur}" >nul 2>&1\r\n'
                            f'if not exist "{cur}" (ping 127.0.0.1 -n 2 >nul & goto retry)\r\n'
                            # ВАЖНО: очищаем переменные PyInstaller, унаследованные от старого
                            # процесса. Иначе новый exe пытается грузить python3xx.dll из уже
                            # удалённой временной папки → «Failed to load Python DLL».
                            'set "_MEIPASS2="\r\n'
                            'set "_PYI_ARCHIVE_FILE="\r\n'
                            'set "_PYI_APPLICATION_HOME_DIR="\r\n'
                            'set "_PYI_PARENT_PROCESS_LEVEL="\r\n'
                            'set "_PYI_ONEDIR_MODE="\r\n'
                            f'start "" /d "{cdir}" "{cur}"\r\n'
                            f'ping 127.0.0.1 -n 2 >nul\r\n'
                            f'del /f /q "{old}" >nul 2>&1\r\n'
                            f'del /f /q "{new}" >nul 2>&1\r\n'
                            f'del "%~f0"\r\n')
                # запускаем bat в ЧИСТОМ окружении, без переменных PyInstaller
                clean_env = {k: v for k, v in os.environ.items()
                             if not (k.startswith("_MEIPASS") or k.startswith("_PYI"))}
                subprocess.Popen(["cmd", "/c", bat], creationflags=subprocess.CREATE_NO_WINDOW,
                                 env=clean_env)
            else:
                os.chmod(new, 0o755); sh = cur + "_upd.sh"
                with open(sh, "w") as f:
                    f.write(f'#!/bin/sh\nsleep 2\nmv -f "{new}" "{cur}"\nchmod +x "{cur}"\n'
                            f'xattr -dr com.apple.quarantine "{cur}" 2>/dev/null || true\n'
                            f'unset _MEIPASS2 _PYI_ARCHIVE_FILE _PYI_APPLICATION_HOME_DIR _PYI_PARENT_PROCESS_LEVEL\n'
                            f'nohup "{cur}" >/dev/null 2>&1 &\nrm -- "$0"\n')
                clean_env = {k: v for k, v in os.environ.items()
                             if not (k.startswith("_MEIPASS") or k.startswith("_PYI"))}
                os.chmod(sh, 0o755); subprocess.Popen(["/bin/sh", sh], env=clean_env)
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
        ctk.CTkLabel(srow, text="Автозапуск при входе", font=ctk.CTkFont(FONT, 13), text_color=TEXT).pack(side="left")
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
        self.links = []; self.manual_links = []; self.subs = []; self.sub_cache = {}
        self.sub_url = ""; self.active_tab = "all"; self.selected_idx = 0; self.render_servers()
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
        messagebox.showinfo("FAQ", "• ＋ или «Вставить» — добавь ключ/подписку.\n• Выбери страну слева.\n"
            "• Нажми круглую кнопку — подключение.\n• «Тест пинга» — скорость сервера.\n\nt.me/jeffvpn")

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
