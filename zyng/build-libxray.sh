#!/bin/bash
# Собирает LibXray.xcframework — ядро Xray для iOS.
#
# Запускать один раз (и потом только при обновлении ядра):
#   ./build-libxray.sh
#
# Зачем оно нужно, когда есть sing-box: транспорт xhttp существует только в
# Xray. В sing-box его нет ни в одной версии — подробности в Shared/XrayBridge.swift.
# Туннель по-прежнему держит sing-box, Xray работает под ним как локальный SOCKS.
#
# Занимает 5–15 минут. Результат кладётся в Frameworks/LibXray.xcframework
# и в git не попадает — он большой и пересобирается этой командой.
set -e

cd "$(dirname "$0")"
ROOT="$PWD"
OUT="$ROOT/Frameworks"

# ВАЖНО: здесь оригинальный gomobile, а НЕ форк SagerNet.
#
# Для sing-box нужен именно форк — он прописан в его go.mod. libXray же
# собирается обычным golang.org/x/mobile, и подсовывать ему форк не нужно.
GOMOBILE_PKG="golang.org/x/mobile"

# --- Проверки инструментов -------------------------------------------------

if ! command -v go >/dev/null 2>&1; then
  echo "❌ Нужен Go. Поставь: brew install go"
  exit 1
fi

export PATH="$PATH:$(go env GOPATH)/bin"

DEVDIR="$(xcode-select -p 2>/dev/null || true)"
if [[ "$DEVDIR" != *"Xcode.app"* ]]; then
  echo "❌ Сейчас выбраны Command Line Tools, а нужен полный Xcode."
  echo "   Выполни:  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  exit 1
fi

# --- Исходники -------------------------------------------------------------

SRC="$ROOT/.build/libXray"
mkdir -p "$ROOT/.build"

if [ -d "$SRC/.git" ]; then
  echo "→ Обновляю libXray…"
  git -C "$SRC" fetch --quiet --depth 1 origin main
  git -C "$SRC" reset --quiet --hard origin/main
else
  rm -rf "$SRC"
  echo "→ Клонирую libXray…"
  git clone --quiet --depth 1 https://github.com/XTLS/libXray "$SRC"
fi

cd "$SRC"

XRAY_VERSION="$(go list -m -f '{{.Version}}' github.com/xtls/xray-core 2>/dev/null || echo '?')"
echo "→ Версия Xray-core: $XRAY_VERSION"

# --- gomobile --------------------------------------------------------------

echo "→ Устанавливаю gomobile…"
go install -v "$GOMOBILE_PKG/cmd/gomobile@latest"
go install -v "$GOMOBILE_PKG/cmd/gobind@latest"
export PATH="$PATH:$(go env GOPATH)/bin"
hash -r

echo "→ Инициализирую gomobile…"
gomobile init

# --- Сборка ----------------------------------------------------------------

echo "→ Собираю LibXray.xcframework (это надолго, 5–15 минут)…"

mkdir -p "$OUT"

# Только ios и iossimulator: maccatalyst gomobile собирать не умеет.
#
# -libname=Xray даёт на выходе LibXray.xcframework — gomobile сам добавляет
# приставку «Lib», как и в случае с Libbox.
gomobile bind -v \
  -target ios,iossimulator \
  -libname=Xray \
  -trimpath -ldflags="-s -w" \
  -o "$OUT/LibXray.xcframework" \
  .

# gomobile отдаёт фреймворк в формате macOS (Versions/Current/…), а iOS требует
# плоский бандл. Скрипт тот же, что и для Libbox, — ему передаётся имя.
if [ -x "$ROOT/flatten-libbox.sh" ]; then
  "$ROOT/flatten-libbox.sh" LibXray || true
fi

echo ""
echo "✅ Готово: $OUT/LibXray.xcframework"
echo "   Версия Xray-core: $XRAY_VERSION"
echo ""
echo "Дальше:  xcodegen && open Zyng.xcodeproj"
echo ""
echo "Если сборка расширения упадёт на неизвестном имени LibXrayInvoke —"
echo "пришли мне вывод команды, там будет точное имя функции:"
echo ""
echo "  grep -n 'Invoke' \$(find Frameworks/LibXray.xcframework -name 'LibXray.objc.h' | head -1)"
echo ""
