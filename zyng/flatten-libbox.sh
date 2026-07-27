#!/bin/bash
# Приводит Libbox.xcframework к виду, который требует iOS.
#
# gomobile оставляет после себя два изъяна:
#   1. бандл в формате macOS — каталог Versions/Current/ и символьные ссылки
#      в корне. iOS принимает только плоские бандлы;
#   2. пустой Info.plist. Xcode на этапе встраивания говорит
#      «Info.plist of framework … was empty».
#
# Скрипт чинит и то, и другое. Он идемпотентный — запускать можно сколько угодно.
# Вызывается автоматически из build-libbox.sh, но можно и отдельно:
#   ./flatten-libbox.sh
set -e

cd "$(dirname "$0")"
XCFW="$PWD/Frameworks/Libbox.xcframework"

# Должно совпадать с deploymentTarget из project.yml.
MIN_IOS="17.0"

if [ ! -d "$XCFW" ]; then
  echo "❌ Не найден $XCFW — сначала собери ядро: ./build-libbox.sh"
  exit 1
fi

# --- 1. Выпрямление бандла ---------------------------------------------------

flatten() {
  local FW="$1"
  [ -d "$FW/Versions" ] || return 0

  local CURRENT="$FW/Versions/Current"
  if [ ! -d "$CURRENT" ]; then
    echo "  ⚠️  нет Versions/Current, пропускаю выпрямление"
    return 0
  fi

  local TMP
  TMP="$(mktemp -d)"

  # -L разыменовывает ссылки: получаем настоящие файлы, а не ссылки на каталог
  # Versions, который мы собираемся удалить.
  cp -RL "$CURRENT/." "$TMP/"

  # В плоском бандле ресурсы лежат в корне, а не в Resources/.
  if [ -d "$TMP/Resources" ]; then
    shopt -s dotglob nullglob
    for item in "$TMP/Resources"/*; do
      mv -f "$item" "$TMP/"
    done
    shopt -u dotglob nullglob
    rm -rf "$TMP/Resources"
  fi

  rm -rf "$FW"
  mkdir -p "$FW"
  cp -R "$TMP/." "$FW/"
  rm -rf "$TMP"

  echo "  • бандл выпрямлен"
}

# --- 2. Info.plist -----------------------------------------------------------

write_plist() {
  local FW="$1"
  local PLATFORM="$2"   # iPhoneOS или iPhoneSimulator

  cat > "$FW/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>en</string>
	<key>CFBundleExecutable</key>
	<string>Libbox</string>
	<key>CFBundleIdentifier</key>
	<string>io.sagernet.libbox</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>Libbox</string>
	<key>CFBundlePackageType</key>
	<string>FMWK</string>
	<key>CFBundleShortVersionString</key>
	<string>1.0</string>
	<key>CFBundleVersion</key>
	<string>1</string>
	<key>CFBundleSupportedPlatforms</key>
	<array>
		<string>${PLATFORM}</string>
	</array>
	<key>MinimumOSVersion</key>
	<string>${MIN_IOS}</string>
	<key>UIDeviceFamily</key>
	<array>
		<integer>1</integer>
		<integer>2</integer>
	</array>
</dict>
</plist>
PLIST

  plutil -lint "$FW/Info.plist" >/dev/null
  echo "  • Info.plist записан (${PLATFORM})"
}

# --- 3. Заголовок ------------------------------------------------------------

fix_header() {
  local FW="$1"
  local HEADER="$FW/Headers/Libbox.objc.h"
  [ -f "$HEADER" ] || return 0

  # gomobile объявляет init как nullable у классов, где базовый NSObject
  # объявляет его nonnull. Clang справедливо ругается:
  #   «conflicting nullability specifier on return types».
  # На работу это не влияет, но засоряет сборку предупреждениями.
  if grep -q '^- (nullable instancetype)init;' "$HEADER"; then
    sed -i '' 's/^- (nullable instancetype)init;/- (nonnull instancetype)init;/' "$HEADER"
    echo "  • заголовок поправлен (nullability у init)"
  fi
}

# --- Обход слайсов -----------------------------------------------------------

found=0

for FW in "$XCFW"/*/Libbox.framework; do
  [ -d "$FW" ] || continue
  found=1

  slice="$(basename "$(dirname "$FW")")"
  echo "→ Слайс $slice"

  flatten "$FW"

  # Имя каталога слайса говорит, для чего он собран.
  case "$slice" in
    *simulator*) platform="iPhoneSimulator" ;;
    *)           platform="iPhoneOS" ;;
  esac

  write_plist "$FW" "$platform"

  if [ ! -f "$FW/Libbox" ]; then
    echo "  ❌ нет бинарника Libbox — фреймворк собран неправильно"
    exit 1
  fi

  fix_header "$FW"
done

if [ "$found" -eq 0 ]; then
  echo "❌ Внутри $XCFW нет ни одного Libbox.framework"
  exit 1
fi

echo ""
echo "✅ Фреймворк приведён в порядок."
echo "   Дальше:  rm -rf Zyng.xcodeproj && ./setup.sh"
