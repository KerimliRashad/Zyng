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

if ! command -v gomobile >/dev/null 2>&1; then
  echo "→ Устанавливаю gomobile…"
  go install golang.org/x/mobile/cmd/gomobile@latest
  go install golang.org/x/mobile/cmd/gobind@latest
  export PATH="$PATH:$(go env GOPATH)/bin"
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

# --- Сборка ----------------------------------------------------------------

cd "$SRC"

echo "→ Инициализирую gomobile…"
gomobile init

echo "→ Собираю Libbox.xcframework (это надолго, 5–15 минут)…"

# Набор тегов = протоколы, которые попадут в ядро. Полный список из Makefile
# sing-box для мобильных сборок.
TAGS="with_gvisor,with_quic,with_wireguard,with_utls,with_clash_api"

gomobile bind -v \
  -target ios,iossimulator \
  -tags "$TAGS" \
  -trimpath -ldflags="-s -w" \
  -o "$OUT/Libbox.xcframework" \
  ./experimental/libbox

echo ""
echo "✅ Готово: $OUT/Libbox.xcframework"
echo "   Версия ядра: $SB_VERSION"
echo ""
echo "Теперь пришли мне сгенерированный заголовок, чтобы я написал связку"
echo "под точные сигнатуры:"
echo ""
echo "  cat $OUT/Libbox.xcframework/ios-arm64/Libbox.framework/Headers/Libbox.objc.h | head -400"
echo ""
