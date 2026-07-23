#!/usr/bin/env python3
"""Jeff Browser — собственный браузер на движке Chromium (Qt WebEngine).
Полностью наш интерфейс: вкладки, адресная строка, Speed Dial, тёмная тема."""
import sys
import os
from PyQt5.QtCore import QUrl, Qt
from PyQt5.QtGui import QIcon
from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QTabWidget, QToolBar, QLineEdit,
    QAction, QStyle, QWidget
)
from PyQt5.QtWebEngineWidgets import QWebEngineView

APP_NAME = "Jeff Browser"
APP_VERSION = "0.1"

# ── Speed Dial (стартовая страница) ──────────────────────────────────────────
HOME_HTML = """<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Jeff</title>
<style>
:root{--bg:#0f1116;--card:#22262d;--card2:#2d323b;--bd:#363c46;--tx:#e6e8ec;--mut:#8a9099;--acc:#5c6675}
html,body{height:100%;margin:0;font-family:'Segoe UI',Arial,sans-serif;
 background:radial-gradient(1200px 700px at 50% -12%,#1b2230,var(--bg));color:var(--tx)}
.wrap{min-height:100%;display:flex;flex-direction:column;align-items:center;gap:26px;padding:70px 16px 40px}
.logo{font-size:66px;font-weight:900;letter-spacing:3px;color:#e8332a;-webkit-text-stroke:3px #111;
 text-shadow:0 3px 0 #111,0 0 12px rgba(232,51,42,.4)}
form{display:flex;width:min(640px,90%);background:var(--card);border:1px solid var(--bd);border-radius:28px;overflow:hidden}
input{flex:1;border:0;background:transparent;color:var(--tx);font-size:17px;padding:16px 22px;outline:none}
button{border:0;background:var(--acc);color:#fff;font-size:15px;font-weight:700;padding:0 26px;cursor:pointer}
.dial{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;width:min(640px,92%)}
@media(max-width:520px){.dial{grid-template-columns:repeat(3,1fr)}}
.tile{display:flex;flex-direction:column;align-items:center;gap:8px;text-decoration:none;color:var(--tx)}
.ico{width:60px;height:60px;border-radius:18px;background:var(--card);border:1px solid var(--bd);
 display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800}
.tile:hover .ico{background:var(--card2)}
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
QTabWidget::pane { border: 0; }
QTabBar::tab { background: #22262d; color: #b9c0c9; padding: 8px 16px; margin-right: 2px;
    border-top-left-radius: 10px; border-top-right-radius: 10px; }
QTabBar::tab:selected { background: #2d323b; color: #ffffff; }
QToolBar { background: #16181c; border: 0; spacing: 4px; padding: 4px; }
QToolButton { color: #e6e8ec; background: transparent; border: 0; padding: 6px 8px; font-size: 16px; border-radius: 8px; }
QToolButton:hover { background: #22262d; }
QLineEdit { background: #22262d; color: #e6e8ec; border: 1px solid #363c46; border-radius: 16px;
    padding: 7px 14px; font-size: 14px; selection-background-color: #5c6675; }
"""


def resource(name):
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, name)


class Browser(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(APP_NAME)
        self.resize(1180, 760)
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

        nav = QToolBar()
        nav.setMovable(False)
        self.addToolBar(nav)
        st = self.style()
        self._add_btn(nav, "◀", self.back, "Назад")
        self._add_btn(nav, "▶", self.forward, "Вперёд")
        self._add_btn(nav, "⟳", self.reload, "Обновить")
        self._add_btn(nav, "⌂", self.go_home, "Домой")

        self.url_bar = QLineEdit()
        self.url_bar.setPlaceholderText("Поиск в Google или адрес сайта…")
        self.url_bar.returnPressed.connect(self.navigate)
        nav.addWidget(self.url_bar)

        self._add_btn(nav, "＋", lambda: self.add_tab(), "Новая вкладка")

        self.setStyleSheet(DARK_QSS)
        self.add_tab()

    def _add_btn(self, bar, text, slot, tip=""):
        act = QAction(text, self)
        act.triggered.connect(lambda: slot())
        if tip:
            act.setToolTip(tip)
        bar.addAction(act)

    # ── Вкладки ──
    def add_tab(self, url=None):
        view = QWebEngineView()
        if url:
            view.setUrl(QUrl(url))
        else:
            view.setHtml(HOME_HTML, QUrl("https://jeff.home/"))
        i = self.tabs.addTab(view, "Новая вкладка")
        self.tabs.setCurrentIndex(i)
        view.urlChanged.connect(lambda u, v=view: self.on_url_changed(u, v))
        view.titleChanged.connect(lambda t, v=view: self.on_title_changed(t, v))
        view.loadFinished.connect(lambda ok, v=view: self.on_title_changed(v.title(), v))
        return view

    def close_tab(self, i):
        if self.tabs.count() <= 1:
            self.add_tab()
        w = self.tabs.widget(i)
        self.tabs.removeTab(i)
        if w:
            w.deleteLater()

    def current(self):
        return self.tabs.currentWidget()

    # ── Навигация ──
    def navigate(self):
        text = self.url_bar.text().strip()
        if not text:
            return
        if "." in text and " " not in text and not text.startswith("javascript:"):
            url = text if "://" in text else "https://" + text
        else:
            from urllib.parse import quote
            url = "https://www.google.com/search?q=" + quote(text)
        v = self.current()
        if v:
            v.setUrl(QUrl(url))

    def back(self):
        v = self.current()
        if v: v.back()

    def forward(self):
        v = self.current()
        if v: v.forward()

    def reload(self):
        v = self.current()
        if v: v.reload()

    def go_home(self):
        v = self.current()
        if v: v.setHtml(HOME_HTML, QUrl("https://jeff.home/"))

    # ── Синхронизация UI ──
    def on_tab_changed(self, i):
        v = self.tabs.widget(i)
        if v:
            u = v.url().toString()
            self.url_bar.setText("" if u.startswith("https://jeff.home") or u.startswith("data:") else u)

    def on_url_changed(self, u, view):
        if view is self.current():
            s = u.toString()
            self.url_bar.setText("" if s.startswith("https://jeff.home") or s.startswith("data:") else s)

    def on_title_changed(self, title, view):
        i = self.tabs.indexOf(view)
        if i >= 0:
            t = (title or "Новая вкладка").strip()
            self.tabs.setTabText(i, (t[:22] + "…") if len(t) > 23 else t)


def main():
    QApplication.setApplicationName(APP_NAME)
    try:
        from PyQt5.QtCore import QCoreApplication
        QCoreApplication.setAttribute(Qt.AA_ShareOpenGLContexts, True)
    except Exception:
        pass
    app = QApplication(sys.argv)
    win = Browser()
    win.show()
    sys.exit(app.exec_())


if __name__ == "__main__":
    main()
