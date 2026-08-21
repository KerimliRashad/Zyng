import Foundation

#if canImport(LibXray)
import LibXray
#endif

/// Мост к ядру Xray.
///
/// Зачем оно вообще нужно, если есть sing-box.
///
/// Транспорт xhttp (он же splithttp) придуман в Xray и существует только там.
/// В sing-box его нет ни в одной версии — я проверил исходники 1.13.19: слов
/// «xhttp» и «splithttp» там нет во всём репозитории, транспортов ровно пять:
/// http, ws, quic, grpc, httpupgrade. Поэтому ключи с xhttp невозможно было
/// «починить» — их нечем было исполнить.
///
/// Как устроено соединение.
///
/// Туннель по-прежнему держит sing-box: он забирает пакеты устройства, ведёт
/// TCP/IP-стек и DNS. Меняется только то, куда он отдаёт трафик. Для обычного
/// ключа — прямо на сервер, как раньше. Для ключа с xhttp — в локальный SOCKS
/// на 127.0.0.1, который поднимает Xray, а уже он говорит с сервером на своём
/// транспорте.
///
/// Такое разделение выбрано не от красоты: у libXray нет и не было работы с
/// файловым дескриптором туннеля — в его исходниках нет ни одного упоминания
/// tun или fd. Xray умеет принимать соединения, но не умеет забирать пакеты у
/// системы. У sing-box ровно наоборот всё на месте. Каждый делает то, что
/// умеет, и главное — путь обычных ключей не меняется вовсе: если с Xray
/// что-то не так, это не может сломать то, что работало.
enum XrayBridge {

    /// Порт локального SOCKS между двумя ядрами.
    ///
    /// Фиксированный, а не запрошенный у системы: оба конца поднимаются внутри
    /// одного процесса расширения, слушается только петля, и наружу этот порт
    /// не виден. Число из верхней части диапазона — там не встретишь ничего
    /// стандартного.
    static let socksPort = 10808

    enum Failure: LocalizedError {
        case unavailable
        case rejected(String)

        var errorDescription: String? {
            switch self {
            case .unavailable:
                return tr("Ядро Xray не собрано. Выполни ./build-libxray.sh",
                          "The Xray core is not built. Run ./build-libxray.sh")
            case .rejected(let why):
                return tr("Xray отверг конфигурацию: \(why)",
                          "Xray rejected the configuration: \(why)")
            }
        }
    }

    /// Собрано ли ядро. Фреймворк в git не хранится — он большой и
    /// пересобирается скриптом, поэтому его может не быть.
    ///
    /// Списком поддерживаемых транспортов это НЕ управляет, и намеренно.
    /// Фреймворк слинкован только с расширением туннеля, а список читает ещё и
    /// приложение — там canImport дал бы false, и один и тот же ключ считался
    /// бы поддержанным в одном процессе и нет в другом. Пусть лучше при
    /// подключении будет внятная ошибка «ядро не собрано», чем сервер, молча
    /// пропавший из списка.
    static var isAvailable: Bool {
        #if canImport(LibXray)
        return true
        #else
        return false
        #endif
    }

    // MARK: - Вызовы

    /// Весь API libXray — одна функция, принимающая JSON и возвращающая JSON.
    /// Здесь она обёрнута так, чтобы наружу торчали обычные ошибки Swift.
    @discardableResult
    private static func invoke(method: String, payload: [String: Any]) throws -> Any? {
        #if canImport(LibXray)
        let request: [String: Any] = [
            // Версию проверяет само ядро и отвергает чужую. Держим её здесь
            // одним числом: когда libXray её поднимет, править одно место.
            "apiVersion": 2,
            "method": method,
            "payload": payload
        ]

        let data = try JSONSerialization.data(withJSONObject: request)
        let answer = LibXrayInvoke(String(decoding: data, as: UTF8.self))

        guard let raw = answer.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: raw) as? [String: Any] else {
            throw Failure.rejected(tr("непонятный ответ ядра", "unreadable core answer"))
        }

        guard object["success"] as? Bool == true else {
            let message = object["error"] as? String ?? ""
            throw Failure.rejected(message.isEmpty
                                   ? tr("без объяснения", "no reason given")
                                   : message)
        }
        return object["data"]
        #else
        throw Failure.unavailable
        #endif
    }

    /// Превращает ссылку вида `vless://…` в набор outbound'ов Xray.
    ///
    /// Разбирает сам libXray, а не мы. Он знает все поля Xray, включая те, что
    /// есть только там — как раз xhttp с его mode, extra и прочим. Повторять
    /// этот разбор своими руками означало бы вечно догонять чужой формат.
    static func outbounds(fromShareLink link: String) throws -> [[String: Any]] {
        let data = try invoke(method: "convertShareLinksToXrayJson",
                              payload: ["text": link])

        guard let config = data as? [String: Any],
              let outbounds = config["outbounds"] as? [[String: Any]],
              !outbounds.isEmpty else {
            throw Failure.rejected(tr("в ссылке не нашлось сервера",
                                      "no server found in the link"))
        }
        return outbounds
    }

    /// Полный конфиг Xray: локальный SOCKS внутрь, сервер наружу.
    static func makeConfig(from link: String) throws -> String {
        var outbounds = try outbounds(fromShareLink: link)

        // Первый outbound — наш сервер. Тег задаём свой: у ссылок он приходит
        // произвольным, а маршрут ниже ссылается на него по имени.
        outbounds[0]["tag"] = "proxy"

        let config: [String: Any] = [
            // Как и у sing-box, уровень warning: на info ядро пишет каждое
            // соединение вместе с адресом назначения, то есть историю
            // посещений, и она осела бы в файле журнала.
            "log": ["loglevel": "warning"],

            "inbounds": [[
                "tag": "socks-in",
                "listen": "127.0.0.1",
                "port": socksPort,
                "protocol": "socks",
                "settings": [
                    // Пароль не нужен: слушаем только петлю внутри своего же
                    // процесса, снаружи сюда не достучаться.
                    "auth": "noauth",
                    "udp": true
                ]
            ]],

            "outbounds": outbounds,

            "routing": ["rules": [[
                "type": "field",
                "inboundTag": ["socks-in"],
                "outboundTag": "proxy"
            ]]]
        ]

        let data = try JSONSerialization.data(withJSONObject: config, options: [.sortedKeys])
        return String(decoding: data, as: UTF8.self)
    }

    // MARK: - Управление ядром

    static func start(link: String) throws {
        let config = try makeConfig(from: link)

        // Проверяем до запуска: иначе ошибка всплыла бы уже внутри ядра, а
        // туннель завис бы в состоянии «подключение» без объяснений.
        try invoke(method: "testXray", payload: ["xrayJson": config])
        try invoke(method: "runXray", payload: ["xrayJson": config])
    }

    static func stop() {
        // При остановке разбираться уже не с чем: если ядро не запускалось,
        // ответ будет об ошибке, и это ровно то, что нам подходит.
        _ = try? invoke(method: "stopXray", payload: [:])
    }

    static var version: String {
        guard let data = try? invoke(method: "xrayVersion", payload: [:]),
              let object = data as? [String: Any],
              let version = object["version"] as? String else {
            return "—"
        }
        return version
    }
}
