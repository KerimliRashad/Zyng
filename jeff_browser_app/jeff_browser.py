#!/usr/bin/env python3
"""Jeff Browser — собственный браузер на движке Chromium (Qt WebEngine).
Свой интерфейс: вкладки, адресная строка, Speed Dial, тёмная тема, обновления."""
import sys
import os
import json
import threading
import urllib.request
from PyQt5.QtCore import QUrl, Qt, pyqtSignal
from PyQt5.QtGui import QIcon, QDesktopServices
from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QTabWidget, QToolBar, QLineEdit,
    QAction, QLabel, QPushButton, QWidget, QHBoxLayout, QMenu
)
from PyQt5.QtWebEngineWidgets import QWebEngineView

APP_NAME = "Jeff Browser"
APP_VERSION = "0.2"
MANIFEST_URL = "https://raw.githubusercontent.com/kerimlirashad/kerimlirashad/claude/icq-messenger-b0bt2n/jeff_browser_app/BROWSER_APP_RELEASE.json"
RELEASES = "https://github.com/kerimlirashad/kerimlirashad/releases/tag/jeffbrowser"

# ── Speed Dial ───────────────────────────────────────────────────────────────
HOME_HTML = """<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Jeff</title>
<style>
:root{--bg:#0f1116;--card:#22262d;--card2:#2d323b;--bd:#363c46;--tx:#e6e8ec;--mut:#8a9099;--acc:#5c6675}
html,body{height:100%;margin:0;font-family:'Segoe UI',Arial,sans-serif;
 background:radial-gradient(1200px 700px at 50% -12%,#1b2230,var(--bg));color:var(--tx)}
.wrap{min-height:100%;display:flex;flex-direction:column;align-items:center;gap:26px;padding:66px 16px 40px}
.logo{font-size:70px;font-weight:900;letter-spacing:2px;color:#e8332a;-webkit-text-stroke:3px #111;
 text-shadow:0 3px 0 #111,0 0 14px rgba(232,51,42,.45)}
form{display:flex;width:min(660px,92%);background:var(--card);border:1px solid var(--bd);border-radius:30px;overflow:hidden;
 box-shadow:0 8px 30px rgba(0,0,0,.35)}
input{flex:1;border:0;background:transparent;color:var(--tx);font-size:17px;padding:17px 24px;outline:none}
button{border:0;background:var(--acc);color:#fff;font-size:15px;font-weight:700;padding:0 28px;cursor:pointer}
.dial{display:grid;grid-template-columns:repeat(5,1fr);gap:18px;width:min(660px,94%)}
@media(max-width:540px){.dial{grid-template-columns:repeat(3,1fr)}}
.tile{display:flex;flex-direction:column;align-items:center;gap:9px;text-decoration:none;color:var(--tx)}
.ico{width:62px;height:62px;border-radius:18px;background:var(--card);border:1px solid var(--bd);
 display:flex;align-items:center;justify-content:center;font-size:27px;font-weight:800;transition:.15s}
.tile:hover .ico{background:var(--card2);transform:translateY(-2px)}
.tile span{font-size:12px;color:var(--mut)}
</style></head><body><div class="wrap">
<div class="logo">Jeff</div>
<form action="https://www.google.com/search" method="GET">
<input name="q" placeholder="Поиск в Google…" autofocus><button type="submit">Найти</button></form>
<div class="dial">
<a class="tile" href="https://www.google.com"><div class="ico" style="color:#4285F4">G</div><span>Google</span></a>
<a class="tile" href="https://www.youtube.com"><div class="ico" style="color:#FF0000">&#9654;</div><span>YouTube</span></a>
<a class="tile" href="https://mail.google.com"><div class="ico" style="color:#EA4335">&#9993;</div><span>Gmail</span></a>
<a class="tile" href="https://yandex.ru"><div class="ico" style="color:#FC3F1D">Я</div><span>Yandex</span></a>
<a class="tile" href="https://vk.com"><div class="ico" style="color:#0077FF">VK</div><span>ВКонтакте</span></a>
<a class="tile" href="https://web.telegram.org"><div class="ico" style="color:#2AABEE">&#9992;</div><span>Telegram</span></a>
<a class="tile" href="https://github.com"><div class="ico">&#8983;</div><span>GitHub</span></a>
<a class="tile" href="https://ru.wikipedia.org"><div class="ico">W</div><span>Wikipedia</span></a>
<a class="tile" href="https://translate.google.com"><div class="ico" style="color:#4285F4">&#25991;</div><span>Перевод</span></a>
<a class="tile" href="https://www.google.com/maps"><div class="ico" style="color:#34A853">&#128506;</div><span>Карты</span></a>
</div></div></body></html>"""

DARK_QSS = """
QMainWindow, QWidget { background: #16181c; color: #e6e8ec; }
QTabWidget::pane { border: 0; top: -1px; }
QTabBar { background: #16181c; }
QTabBar::tab { background: #22262d; color: #b9c0c9; padding: 9px 18px; margin: 4px 2px 0 2px;
    border-top-left-radius: 12px; border-top-right-radius: 12px; font-size: 13px; }
QTabBar::tab:selected { background: #2d323b; color: #ffffff; }
QTabBar::tab:hover { background: #2a2f38; }
QToolBar { background: #16181c; border: 0; spacing: 3px; padding: 6px 8px; }
QToolButton { color: #e6e8ec; background: transparent; border: 0; padding: 6px 10px; font-size: 17px; border-radius: 10px; }
QToolButton:hover { background: #262b33; }
QLineEdit { background: #22262d; color: #e6e8ec; border: 1px solid #363c46; border-radius: 18px;
    padding: 8px 16px; font-size: 14px; selection-background-color: #5c6675; }
QLineEdit:focus { border: 1px solid #5c6675; }
QMenu { background: #22262d; color: #e6e8ec; border: 1px solid #363c46; }
QMenu::item:selected { background: #2d323b; }
"""

UPDATE_QSS = "background:#1d3326;color:#dff3e6;"


def resource(name):
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, name)


class Browser(QMainWindow):
    update_found = pyqtSignal(str, str)   # (версия, url)

    def __init__(self):
        super().__init__()
        self.setWindowTitle(APP_NAME)
        self.resize(1180, 760)
        self._upd_url = RELEASES
        try:
            ico = resource("jeff.ico")
            if os.path.exists(ico):
                self.setWindowIcon(QIcon(ico))
        except Exception:
            pass

        self.tabs = QTabWidget()
        self.tabs.setDocumentMode(True)
        self.tabs.setTabsClosable(True)
        self.tabs.setMovable(True)
        self.tabs.tabCloseRequested.connect(self.close_tab)
        self.tabs.currentChanged.connect(self.on_tab_changed)
        self.setCentralWidget(self.tabs)

        nav = QToolBar(); nav.setMovable(False); self.addToolBar(nav)
        self._add_btn(nav, "←", self.back, "Назад")
        self._add_btn(nav, "→", self.forward, "Вперёд")
        self._add_btn(nav, "⟳", self.reload, "Обновить")
        self._add_btn(nav, "⌂", self.go_home, "Домой")

        self.url_bar = QLineEdit()
        self.url_bar.setPlaceholderText("Поиск в Google или адрес сайта…")
        self.url_bar.returnPressed.connect(self.navigate)
        nav.addWidget(self.url_bar)

        self._add_btn(nav, "＋", lambda: self.add_tab(), "Новая вкладка")
        self._add_btn(nav, "⋮", self.open_menu, "Меню")

        # баннер обновления (скрыт по умолчанию)
        self.update_bar = QToolBar(); self.update_bar.setMovable(False)
        self.addToolBar(Qt.BottomToolBarArea, self.update_bar)
        holder = QWidget(); lay = QHBoxLayout(holder); lay.setContentsMargins(12, 4, 12, 4)
        self.upd_label = QLabel("🔔 Доступно обновление Jeff Browser")
        self.upd_label.setStyleSheet("color:#dff3e6;font-weight:bold;")
        btn = QPushButton("Скачать"); btn.clicked.connect(lambda: QDesktopServices.openUrl(QUrl(self._upd_url)))
        btn.setStyleSheet("background:#2ea043;color:#fff;border:0;border-radius:12px;padding:6px 18px;font-weight:bold;")
        close = QPushButton("✕"); close.clicked.connect(self.update_bar.hide)
        close.setStyleSheet("background:transparent;color:#dff3e6;border:0;padding:6px 10px;")
        lay.addWidget(self.upd_label); lay.addStretch(1); lay.addWidget(btn); lay.addWidget(close)
        holder.setStyleSheet(UPDATE_QSS)
        self.update_bar.addWidget(holder)
        self.update_bar.hide()

        self.setStyleSheet(DARK_QSS)
        self.add_tab()

        # проверка обновлений в фоне
        self.update_found.connect(self._show_update_banner)
        threading.Thread(target=self._check_update, daemon=True).start()

    def _add_btn(self, bar, text, slot, tip=""):
        act = QAction(text, self)
        act.triggered.connect(lambda: slot())
        if tip: act.setToolTip(tip)
        bar.addAction(act)

    # ── Вкладки ──
    def add_tab(self, url=None):
        view = QWebEngineView()
        if url:
            view.setUrl(QUrl(url))
        else:
            view.setHtml(HOME_HTML, QUrl("https://jeff.home/"))
        i = self.tabs.addTab(view, "Новая вкладка"); self.tabs.setCurrentIndex(i)
        view.urlChanged.connect(lambda u, v=view: self.on_url_changed(u, v))
        view.titleChanged.connect(lambda t, v=view: self.on_title_changed(t, v))
        return view

    def close_tab(self, i):
        if self.tabs.count() <= 1:
            self.add_tab()
        w = self.tabs.widget(i); self.tabs.removeTab(i)
        if w: w.deleteLater()

    def current(self):
        return self.tabs.currentWidget()

    # ── Навигация ──
    def navigate(self):
        text = self.url_bar.text().strip()
        if not text: return
        if "." in text and " " not in text:
            url = text if "://" in text else "https://" + text
        else:
            from urllib.parse import quote
            url = "https://www.google.com/search?q=" + quote(text)
        v = self.current()
        if v: v.setUrl(QUrl(url))

    def back(self):
        v = self.current();  v and v.back()

    def forward(self):
        v = self.current();  v and v.forward()

    def reload(self):
        v = self.current();  v and v.reload()

    def go_home(self):
        v = self.current()
        if v: v.setHtml(HOME_HTML, QUrl("https://jeff.home/"))

    def open_menu(self):
        m = QMenu(self)
        m.addAction("Новая вкладка", lambda: self.add_tab())
        m.addAction("Домой", self.go_home)
        m.addSeparator()
        m.addAction("Проверить обновление", lambda: threading.Thread(target=self._check_update, daemon=True).start())
        m.addAction(f"О программе — Jeff Browser {APP_VERSION}",
                    lambda: QDesktopServices.openUrl(QUrl(RELEASES)))
        m.exec_(self.cursor().pos())

    # ── UI-синхронизация ──
    def on_tab_changed(self, i):
        v = self.tabs.widget(i)
        if v: self._set_url(v.url().toString())

    def on_url_changed(self, u, view):
        if view is self.current(): self._set_url(u.toString())

    def _set_url(self, s):
        self.url_bar.setText("" if s.startswith("https://jeff.home") or s.startswith("data:") else s)

    def on_title_changed(self, title, view):
        i = self.tabs.indexOf(view)
        if i >= 0:
            t = (title or "Новая вкладка").strip()
            self.tabs.setTabText(i, (t[:22] + "…") if len(t) > 23 else t)

    # ── Обновления ──
    def _check_update(self):
        try:
            import ssl, time as _t
            ctx = ssl.create_default_context()
            req = urllib.request.Request(MANIFEST_URL + "?t=%d" % int(_t.time()),
                                         headers={"User-Agent": "JeffBrowser"})
            d = json.loads(urllib.request.urlopen(req, timeout=8, context=ctx).read().decode())
            latest = str(d.get("version", "")).strip()
            if latest and latest != APP_VERSION:
                self.update_found.emit(latest, d.get("url", RELEASES))
        except Exception:
            pass

    def _show_update_banner(self, version, url):
        self._upd_url = url
        self.upd_label.setText(f"🔔 Доступно обновление Jeff Browser {version} — нажми «Скачать»")
        self.update_bar.show()


def main():
    try:
        QApplication.setAttribute(Qt.AA_ShareOpenGLContexts, True)
    except Exception:
        pass
    QApplication.setApplicationName(APP_NAME)
    app = QApplication(sys.argv)
    win = Browser(); win.show()
    sys.exit(app.exec_())


if __name__ == "__main__":
    main()
