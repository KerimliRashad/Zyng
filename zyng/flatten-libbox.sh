#!/bin/bash
# Приводит Libbox.xcframework к «плоскому» виду, который требует iOS.
#
# gomobile собирает фреймворк в формате macOS — с каталогом Versions/Current/
# и символьными ссылками в корне. iOS такие бандлы не принимает: Xcode падает с
#   «contains Versions/Current/Resources/Info.plist, expected Info.plist
#    at the root level since the platform uses shallow bundles».
#
# Скрипт идемпотентный: на уже плоском фреймворке ничего не делает.
# Вызывается автоматически из build-libbox.sh, но можно запустить и отдельно:
#   ./flatten-libbox.sh
set -e

cd "$(dirname "$0")"
XCFW="$PWD/Frameworks/Libbox.xcframework"

if [ ! -d "$XCFW" ]; then
  echo "❌ Не найден $XCFW — сначала собери ядро: ./build-libbox.sh"
  exit 1
fi

changed=0

for FW in "$XCFW"/*/Libbox.framework; do
  [ -d "$FW" ] || continue

  if [ ! -d "$FW/Versions" ]; then
    continue   # уже плоский
  fi

  slice="$(basename "$(dirname "$FW")")"
  echo "→ Выпрямляю слайс $slice…"

  CURRENT="$FW/Versions/Current"
  if [ ! -d "$CURRENT" ]; then
    echo "  ⚠️  нет Versions/Current, пропускаю"
    continue
  fi

  TMP="$(mktemp -d)"

  # -L разыменовывает символьные ссылки: получаем настоящие файлы, а не ссылки
  # на каталог Versions, который мы собираемся удалить.
  cp -RL "$CURRENT/." "$TMP/"

  # В плоском бандле ресурсы лежат в корне, а не в Resources/.
  if [ -d "$TMP/Resources" ]; then
    # Точечные файлы тоже переносим, поэтому включаем dotglob.
    shopt -s dotglob nullglob
    for item in "$TMP/Resources"/*; do
      mv -f "$item" "$TMP/"
    done
    shopt -u dotglob nullglob
    rmdir "$TMP/Resources" 2>/dev/null || rm -rf "$TMP/Resources"
  fi

  rm -rf "$FW"
  mkdir -p "$FW"
  cp -R "$TMP/." "$FW/"
  rm -rf "$TMP"

  if [ ! -f "$FW/Info.plist" ]; then
    echo "  ❌ после выпрямления нет Info.plist в корне — что-то не так"
    exit 1
  fi

  changed=1
done

if [ "$changed" -eq 0 ]; then
  echo "✅ Фреймворк уже в плоском формате, ничего менять не нужно."
else
  echo "✅ Готово. Теперь пересоздай проект:  rm -rf Zyng.xcodeproj && ./setup.sh"
fi
