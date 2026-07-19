// Мини-кнопка обновлений Jeff Browser.
// Сравнивает встроенную версию с манифестом на GitHub; если вышла новая —
// ставит зелёный значок на кнопке. Клик открывает страницу загрузки.

const CURRENT = "1.0";  // версия текущей сборки браузера
const MANIFEST_URL = "https://raw.githubusercontent.com/kerimlirashad/kerimlirashad/claude/icq-messenger-b0bt2n/jeff_browser/BROWSER_RELEASE.json";
const FALLBACK_PAGE = "https://github.com/kerimlirashad/kerimlirashad/releases/tag/jeffbrowser";

let downloadUrl = FALLBACK_PAGE;
let hasUpdate = false;

async function check() {
  try {
    const r = await fetch(MANIFEST_URL + "?t=" + Date.now(), { cache: "no-store" });
    const d = await r.json();
    const latest = String(d.version || "").trim();
    downloadUrl = d.url || FALLBACK_PAGE;
    if (latest && latest !== CURRENT) {
      hasUpdate = true;
      browser.browserAction.setBadgeText({ text: "!" });
      browser.browserAction.setBadgeBackgroundColor({ color: "#2ea043" });
      browser.browserAction.setTitle({ title: "Доступно обновление Jeff " + latest });
    } else {
      hasUpdate = false;
      browser.browserAction.setBadgeText({ text: "" });
      browser.browserAction.setTitle({ title: "Jeff Browser — актуальная версия (" + CURRENT + ")" });
    }
  } catch (e) {
    // нет сети — просто оставляем кнопку без значка
  }
}

browser.browserAction.onClicked.addListener(() => {
  browser.tabs.create({ url: downloadUrl });
});

check();
setInterval(check, 6 * 60 * 60 * 1000);  // перепроверка раз в 6 часов
