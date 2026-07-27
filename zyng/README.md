# Zyng — iOS VPN

## Запуск с нуля

```bash
mkdir -p ~/Developer
cd ~/Developer
git clone https://github.com/KerimliRashad/KerimliRashad.git
cd KerimliRashad/zyng
./setup.sh
open Zyng.xcodeproj
```

Дальше в Xcode один раз:

1. Таргет **Zyng** → Signing & Capabilities → **Team** = твой платный аккаунт
2. Таргет **ZyngTunnel** → Signing & Capabilities → **тот же Team**
3. `⌘R`

Всё. Capabilities, entitlements, вложение расширения, Bundle ID — уже настроены.

---

## Почему именно так

Раньше проект собирался в Xcode вручную, и каждый раз что-то расходилось:
пропадали `.entitlements`, слетали capabilities, ломались пути. Теперь весь
проект описан в `project.yml`, а `.xcodeproj` генерируется из него командой.

**Если Xcode-проект сломается — просто пересоздай его:**

```bash
rm -rf Zyng.xcodeproj && ./setup.sh
```

Это безопасно. Твой код лежит в `Zyng/` и `ZyngTunnel/` и не трогается.

---

## Не клади проект на Рабочий стол

macOS защищает `~/Desktop`, `~/Documents` и папки iCloud. Xcode не может там
создавать файлы — отсюда ошибка **«Operation not permitted (1)»**, из-за которой
не создавались entitlements.

Держи проект в `~/Developer`. `setup.sh` проверяет это и предупредит.

---

## Что уже работает

- UI: список серверов, импорт ключей, подключение, таймер сессии
- Парсинг ключей: VLESS, VMESS, TROJAN, Shadowsocks, Hysteria2, TUIC, WireGuard, SOCKS
- Поднятие системного VPN-туннеля через NetworkExtension
- Корректная обработка статусов и ошибок VPN

## Чего ещё нет

**За туннелем нет транспорта.** Пакеты читаются из `packetFlow` и никуда не
отправляются — движок (libXray / sing-box) пока не подключён.

Поэтому в `ZyngTunnel/PacketTunnelProvider.swift` стоит:

```swift
private static let routesAllTraffic = false
```

Туннель поднимается на узком маршруте: видно, что расширение грузится и живёт,
но интернет на устройстве не пропадает. После интеграции движка флаг
переключается в `true`.

Это следующий и самый большой шаг. До него приложение — рабочий каркас, а не
рабочий VPN, и в таком виде отправлять в App Store нельзя.

---

## Структура

```
zyng/
├── project.yml          описание проекта (заменяет ручную настройку в Xcode)
├── setup.sh             генерация Zyng.xcodeproj
├── Zyng/                приложение
│   ├── ZyngApp.swift
│   ├── ContentView.swift
│   ├── VPNController.swift
│   ├── Zyng.entitlements
│   └── Info.plist
└── ZyngTunnel/          расширение (packet tunnel)
    ├── PacketTunnelProvider.swift
    ├── ZyngTunnel.entitlements
    └── Info.plist
```

## Идентификаторы

| | |
|---|---|
| Приложение | `online.zyng.Zyng` |
| Расширение | `online.zyng.Zyng.ZyngTunnel` |
| App Group | `group.online.zyng.Zyng` |

Bundle ID расширения обязан начинаться с Bundle ID приложения.
