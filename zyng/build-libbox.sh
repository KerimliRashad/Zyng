#!/bin/bash
# Собирает Libbox.xcframework — ядро sing-box для iOS.
#
# Запускать один раз (и потом только при обновлении ядра):
#   ./build-libbox.sh
#
# Занимает 5–15 минут. Результат кладётся в Frameworks/Libbox.xcframework
# и в git не попадает — он большой и пересобирается этой командой.
set -e

cd "$(dirname "$0")"
ROOT="$PWD"
OUT="$ROOT/Frameworks"

# ВАЖНО: sing-box собирается форком gomobile от SagerNet, а не оригинальным
# golang.org/x/mobile. Оригинальный падает с «missing golang.org/x/mobile
# dependency», потому что в go.mod sing-box прописан именно форк.
GOMOBILE_PKG="github.com/sagernet/gomobile"
GOMOBILE_VERSION="${GOMOBILE_VERSION:-latest}"

# --- Проверки инструментов -------------------------------------------------

if ! command -v brew >/dev/null 2>&1; then
  echo "❌ Нужен Homebrew: https://brew.sh"
  exit 1
fi

if ! command -v go >/dev/null 2>&1; then
  echo "→ Устанавливаю Go…"
  brew install go
fi

export PATH="$PATH:$(go env GOPATH)/bin"

# Полный Xcode, а не Command Line Tools — иначе gomobile не найдёт iOS SDK.
DEVDIR="$(xcode-select -p 2>/dev/null || true)"
if [[ "$DEVDIR" != *"Xcode.app"* ]]; then
  echo "❌ Сейчас выбраны Command Line Tools, а нужен полный Xcode."
  echo "   Выполни:  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  exit 1
fi

# --- Сеть ------------------------------------------------------------------
# Если включён VPN без работающего транспорта, DNS отваливается и всё падает
# на клонировании. Проверяем заранее, чтобы причина была очевидна.

if ! git ls-remote --exit-code https://github.com/SagerNet/sing-box HEAD >/dev/null 2>&1; then
  echo "❌ Нет доступа к github.com."
  echo "   Чаще всего это включённый VPN — отключи Zyng и попробуй снова."
  exit 1
fi

# --- Версия ядра -----------------------------------------------------------
# По умолчанию берём последний стабильный тег (alpha/beta отбрасываем).
# Зафиксировать конкретную версию:  SB_VERSION=v1.12.0 ./build-libbox.sh

if [ -z "$SB_VERSION" ]; then
  echo "→ Определяю последнюю стабильную версию sing-box…"
  SB_VERSION=$(git ls-remote --tags --refs https://github.com/SagerNet/sing-box \
    | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1)
fi

if [ -z "$SB_VERSION" ]; then
  echo "❌ Не удалось определить версию. Задай вручную: SB_VERSION=v1.12.0 ./build-libbox.sh"
  exit 1
fi

echo "→ Версия ядра: $SB_VERSION"

# --- Исходники -------------------------------------------------------------

SRC="$ROOT/.build/sing-box"
mkdir -p "$ROOT/.build"

if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch --tags --quiet
else
  rm -rf "$SRC"
  echo "→ Клонирую sing-box…"
  git clone --quiet https://github.com/SagerNet/sing-box "$SRC"
fi

git -C "$SRC" checkout --quiet "$SB_VERSION"

cd "$SRC"

# --- gomobile (форк SagerNet) ----------------------------------------------
# Ставим из папки sing-box, чтобы подхватилась версия форка из его go.mod.

echo "→ Устанавливаю gomobile (форк SagerNet)…"
go install -v "$GOMOBILE_PKG/cmd/gomobile@$GOMOBILE_VERSION"
go install -v "$GOMOBILE_PKG/cmd/gobind@$GOMOBILE_VERSION"
export PATH="$PATH:$(go env GOPATH)/bin"
hash -r

echo "→ Инициализирую gomobile…"
gomobile init

# --- Сборка ----------------------------------------------------------------

echo "→ Собираю Libbox.xcframework (это надолго, 5–15 минут)…"

mkdir -p "$OUT"

# Набор тегов = протоколы, которые попадут в ядро. Соответствует мобильной
# сборке из Makefile sing-box.
TAGS="with_gvisor,with_quic,with_dhcp,with_wireguard,with_utls,with_clash_api"

# -libname=box даёт на выходе именно Libbox.xcframework (gomobile добавляет «Lib»).
gomobile bind -v \
  -target ios,iossimulator \
  -libname=box \
  -tags "$TAGS" \
  -trimpath -ldflags="-s -w" \
  -o "$OUT/Libbox.xcframework" \
  ./experimental/libbox

echo ""
echo "✅ Готово: $OUT/Libbox.xcframework"
echo "   Версия ядра: $SB_VERSION"
echo ""
echo "Теперь пришли мне сгенерированный заголовок:"
echo ""
echo "  find Frameworks -name 'Libbox.objc.h' | head -1"
echo ""
