import Foundation

/// Превращает ссылку-ключ (vless://, vmess://, trojan://, ss:// и т.д.)
/// в готовый JSON-конфиг sing-box.
///
/// Живёт в Shared/ и компилируется в оба таргета: приложению нужно проверить,
/// что ключ вообще разбирается, расширению — построить конфиг для ядра.
enum SingBoxConfig {

    enum ParseError: LocalizedError {
        case emptyKey
        case unsupportedScheme(String)
        case malformed(String)

        var errorDescription: String? {
            switch self {
            case .emptyKey:
                return "Ключ пустой"
            case .unsupportedScheme(let s):
                return "Протокол «\(s)» не поддерживается"
            case .malformed(let why):
                return "Ключ повреждён: \(why)"
            }
        }
    }

    /// Куда попадает разобранный ключ в конфиге.
    ///
    /// Почти все протоколы — это обычный outbound. WireGuard с версии 1.12
    /// описывается отдельной секцией `endpoints`: у него собственный
    /// интерфейс с адресами и списком пиров, а не просто исходящее соединение.
    enum Proxy {
        case outbound([String: Any])
        case endpoint([String: Any])
    }

    // MARK: - Точка входа

    /// Полный конфиг sing-box для одного сервера.
    ///
    /// `dns` — адрес резолвера из настроек приложения. Через него пойдут
    /// запросы внутри туннеля.
    static func makeConfig(from key: String, dns: String = "1.1.1.1") throws -> String {
        let proxy = try makeProxy(from: key)

        let config: [String: Any] = [
            // info, а не warn: иначе в логе не видно, на чём именно ядро
            // споткнулось при установке соединения.
            "log": ["level": "info", "timestamp": false],

            // Формат DNS начиная с 1.12: сервер задаётся полями type/server,
            // а не строкой address, как было раньше.
            "dns": [
                "servers": [
                    [
                        "type": "udp",
                        "tag": "dns-remote",
                        "server": dns,
                        "detour": "proxy"
                    ],
                    [
                        // Без detour запрос идёт напрямую, мимо туннеля —
                        // именно это и нужно, чтобы разрешить адрес сервера.
                        // Указывать detour на пустой direct-выход в 1.13 нельзя:
                        // «detour to an empty direct outbound makes no sense».
                        "type": "udp",
                        "tag": "dns-direct",
                        "server": "8.8.8.8"
                    ]
                ],
                "rules": [
                    // Отсекаем AAAA: за прокси IPv6, как правило, нет, а система
                    // предпочитает его при наличии записи — соединения повисали
                    // бы до таймаута вместо того, чтобы сразу пойти по IPv4.
                    ["query_type": ["AAAA"], "action": "reject"]
                ],
                "final": "dns-remote"
            ],

            "inbounds": [[
                "type": "tun",
                "tag": "tun-in",
                // Только IPv4. С IPv6-адресом и маршрутом туннель забирает на
                // себя весь IPv6-трафик, которому потом некуда идти.
                "address": ["172.19.0.1/30"],
                "mtu": 9000,
                "auto_route": true,
                "strict_route": false,
                // gvisor — пользовательский стек. На iOS обязателен: системный
                // внутри расширения недоступен.
                "stack": "gvisor"
            ]],

            // Пустой direct-выход больше не нужен: прямые соединения ядро
            // делает само, когда обходной путь не задан.
            "outbounds": {
                if case .outbound(let out) = proxy { return [out] }
                return []
            }(),

            "endpoints": {
                if case .endpoint(let end) = proxy { return [end] }
                return []
            }(),

            "route": [
                "rules": [
                    ["action": "sniff"],
                    ["protocol": "dns", "action": "hijack-dns"]
                ],
                "final": "proxy",
                "auto_detect_interface": true,
                // Обязательно с 1.12. Адрес сервера из ключа — обычно домен,
                // и разрешать его нужно НЕ через прокси: иначе замкнутый круг —
                // чтобы подключиться, нужен DNS, а DNS идёт через подключение.
                "default_domain_resolver": "dns-direct"
            ]
        ]

        let data = try JSONSerialization.data(
            withJSONObject: config,
            options: [.prettyPrinted, .sortedKeys]
        )
        return String(decoding: data, as: UTF8.self)
    }

    // MARK: - Разбор ключа в outbound

    /// Адрес и порт сервера — для замера задержки, без построения конфига.
    static func serverEndpoint(from key: String) throws -> (host: String, port: Int) {
        switch try makeProxy(from: key) {
        case .outbound(let out):
            guard let host = out["server"] as? String,
                  let port = out["server_port"] as? Int else {
                throw ParseError.malformed("нет адреса сервера")
            }
            return (host, port)

        case .endpoint(let end):
            guard let peers = end["peers"] as? [[String: Any]],
                  let peer = peers.first,
                  let host = peer["address"] as? String,
                  let port = peer["port"] as? Int else {
                throw ParseError.malformed("нет адреса пира")
            }
            return (host, port)
        }
    }

    static func makeProxy(from key: String) throws -> Proxy {
        let raw = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { throw ParseError.emptyKey }

        guard let schemeEnd = raw.range(of: "://") else {
            throw ParseError.malformed("нет схемы вида «vless://»")
        }
        let scheme = String(raw[raw.startIndex..<schemeEnd.lowerBound]).lowercased()

        switch scheme {
        case "vless":                 return .outbound(try vless(raw))
        case "vmess":                 return .outbound(try vmess(raw))
        case "trojan":                return .outbound(try trojan(raw))
        case "ss", "shadowsocks":     return .outbound(try shadowsocks(raw))
        case "hysteria2", "hy2":      return .outbound(try hysteria2(raw))
        case "tuic":                  return .outbound(try tuic(raw))
        case "socks", "socks5":       return .outbound(try socks(raw))
        case "wireguard", "wg":       return .endpoint(try wireguard(raw))
        default:                      throw ParseError.unsupportedScheme(scheme)
        }
    }

    // MARK: - VLESS

    private static func vless(_ raw: String) throws -> [String: Any] {
        let u = try url(raw)
        let q = query(u)

        var out: [String: Any] = [
            "type": "vless",
            "tag": "proxy",
            "server": try host(u),
            "server_port": try port(u),
            "uuid": try user(u)
        ]

        if let flow = q["flow"], !flow.isEmpty {
            out["flow"] = flow
        }
        if let tls = tlsBlock(q, defaultSNI: try host(u)) {
            out["tls"] = tls
        }
        if let transport = transportBlock(q) {
            out["transport"] = transport
        }
        return out
    }

    // MARK: - VMESS
    //
    // vmess:// — это base64 от JSON, а не обычный URL.

    private static func vmess(_ raw: String) throws -> [String: Any] {
        let payload = String(raw.dropFirst("vmess://".count))
        guard let data = base64Decode(payload),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw ParseError.malformed("не удалось раскодировать base64-содержимое vmess")
        }

        // В vmess-ссылках числа приходят то числом, то строкой.
        func str(_ k: String) -> String? {
            if let s = json[k] as? String { return s }
            if let n = json[k] as? NSNumber { return n.stringValue }
            return nil
        }
        func int(_ k: String) -> Int? {
            if let n = json[k] as? NSNumber { return n.intValue }
            if let s = json[k] as? String { return Int(s) }
            return nil
        }

        guard let add = str("add"), !add.isEmpty else {
            throw ParseError.malformed("в vmess нет адреса сервера")
        }
        guard let p = int("port") else {
            throw ParseError.malformed("в vmess нет порта")
        }
        guard let id = str("id"), !id.isEmpty else {
            throw ParseError.malformed("в vmess нет UUID")
        }

        var out: [String: Any] = [
            "type": "vmess",
            "tag": "proxy",
            "server": add,
            "server_port": p,
            "uuid": id,
            "alter_id": int("aid") ?? 0,
            "security": str("scy") ?? "auto"
        ]

        if (str("tls") ?? "").lowercased() == "tls" {
            var tls: [String: Any] = ["enabled": true]
            let sni = str("sni") ?? str("host") ?? add
            if !sni.isEmpty { tls["server_name"] = sni }
            out["tls"] = tls
        }

        // net: tcp | ws | grpc | h2
        switch (str("net") ?? "tcp").lowercased() {
        case "ws":
            var t: [String: Any] = ["type": "ws", "path": str("path") ?? "/"]
            if let h = str("host"), !h.isEmpty { t["headers"] = ["Host": h] }
            out["transport"] = t
        case "grpc":
            out["transport"] = ["type": "grpc", "service_name": str("path") ?? ""]
        case "h2", "http":
            var t: [String: Any] = ["type": "http", "path": str("path") ?? "/"]
            if let h = str("host"), !h.isEmpty { t["host"] = [h] }
            out["transport"] = t
        default:
            break
        }

        return out
    }

    // MARK: - Trojan

    private static func trojan(_ raw: String) throws -> [String: Any] {
        let u = try url(raw)
        let q = query(u)

        var out: [String: Any] = [
            "type": "trojan",
            "tag": "proxy",
            "server": try host(u),
            "server_port": try port(u),
            "password": try user(u)
        ]

        // У trojan шифрование включено всегда.
        out["tls"] = tlsBlock(q, defaultSNI: try host(u), forceEnabled: true)

        if let transport = transportBlock(q) {
            out["transport"] = transport
        }
        return out
    }

    // MARK: - Shadowsocks
    //
    // Два формата: ss://base64(method:password)@host:port
    //          и  ss://base64(method:password@host:port)

    private static func shadowsocks(_ raw: String) throws -> [String: Any] {
        let body = String(raw.dropFirst("ss://".count))
            .components(separatedBy: "#").first ?? ""
        let withoutQuery = body.components(separatedBy: "?").first ?? body

        var method = ""
        var password = ""
        var server = ""
        var serverPort = 0

        if let at = withoutQuery.lastIndex(of: "@") {
            // Формат 1: закодирована только пара method:password
            let credsPart = String(withoutQuery[withoutQuery.startIndex..<at])
            let hostPart  = String(withoutQuery[withoutQuery.index(after: at)...])

            let creds = base64Decode(credsPart).map { String(decoding: $0, as: UTF8.self) }
                ?? credsPart.removingPercentEncoding
                ?? credsPart

            guard let colon = creds.firstIndex(of: ":") else {
                throw ParseError.malformed("в ss нет пары метод:пароль")
            }
            method = String(creds[creds.startIndex..<colon])
            password = String(creds[creds.index(after: colon)...])

            guard let hostColon = hostPart.lastIndex(of: ":"),
                  let p = Int(hostPart[hostPart.index(after: hostColon)...]) else {
                throw ParseError.malformed("в ss нет порта")
            }
            server = String(hostPart[hostPart.startIndex..<hostColon])
            serverPort = p
        } else {
            // Формат 2: закодирована вся строка целиком
            guard let data = base64Decode(withoutQuery) else {
                throw ParseError.malformed("не удалось раскодировать base64 в ss")
            }
            let decoded = String(decoding: data, as: UTF8.self)

            guard let at = decoded.lastIndex(of: "@") else {
                throw ParseError.malformed("в ss нет разделителя @")
            }
            let creds = String(decoded[decoded.startIndex..<at])
            let hostPart = String(decoded[decoded.index(after: at)...])

            guard let colon = creds.firstIndex(of: ":") else {
                throw ParseError.malformed("в ss нет пары метод:пароль")
            }
            method = String(creds[creds.startIndex..<colon])
            password = String(creds[creds.index(after: colon)...])

            guard let hostColon = hostPart.lastIndex(of: ":"),
                  let p = Int(hostPart[hostPart.index(after: hostColon)...]) else {
                throw ParseError.malformed("в ss нет порта")
            }
            server = String(hostPart[hostPart.startIndex..<hostColon])
            serverPort = p
        }

        // IPv6 в ссылках пишут в скобках.
        server = server.trimmingCharacters(in: CharacterSet(charactersIn: "[]"))

        guard !server.isEmpty else { throw ParseError.malformed("в ss нет адреса сервера") }

        return [
            "type": "shadowsocks",
            "tag": "proxy",
            "server": server,
            "server_port": serverPort,
            "method": method,
            "password": password
        ]
    }

    // MARK: - Hysteria2

    private static func hysteria2(_ raw: String) throws -> [String: Any] {
        let u = try url(raw)
        let q = query(u)

        // Вычисляем заранее: внутри выражения с ?? бросающий вызов не годится.
        let server = try host(u)

        var out: [String: Any] = [
            "type": "hysteria2",
            "tag": "proxy",
            "server": server,
            "server_port": try port(u),
            "password": u.user?.removingPercentEncoding ?? ""
        ]

        var tls: [String: Any] = ["enabled": true]
        tls["server_name"] = q["sni"] ?? q["peer"] ?? server
        if q["insecure"] == "1" || q["allowInsecure"] == "1" {
            tls["insecure"] = true
        }
        if let alpn = q["alpn"], !alpn.isEmpty {
            tls["alpn"] = alpn.components(separatedBy: ",")
        }
        out["tls"] = tls

        if let obfs = q["obfs"], obfs == "salamander", let pw = q["obfs-password"] {
            out["obfs"] = ["type": "salamander", "password": pw]
        }
        return out
    }

    // MARK: - TUIC

    private static func tuic(_ raw: String) throws -> [String: Any] {
        let u = try url(raw)
        let q = query(u)

        // tuic://uuid:password@host:port
        let uuid = u.user?.removingPercentEncoding ?? ""
        let password = u.password?.removingPercentEncoding ?? ""

        guard !uuid.isEmpty else { throw ParseError.malformed("в tuic нет UUID") }

        let server = try host(u)

        var out: [String: Any] = [
            "type": "tuic",
            "tag": "proxy",
            "server": server,
            "server_port": try port(u),
            "uuid": uuid,
            "password": password,
            "congestion_control": q["congestion_control"] ?? "bbr"
        ]

        var tls: [String: Any] = ["enabled": true]
        tls["server_name"] = q["sni"] ?? server
        if q["allow_insecure"] == "1" || q["insecure"] == "1" {
            tls["insecure"] = true
        }
        if let alpn = q["alpn"], !alpn.isEmpty {
            tls["alpn"] = alpn.components(separatedBy: ",")
        }
        out["tls"] = tls

        return out
    }

    // MARK: - SOCKS

    private static func socks(_ raw: String) throws -> [String: Any] {
        let u = try url(raw)

        var out: [String: Any] = [
            "type": "socks",
            "tag": "proxy",
            "server": try host(u),
            "server_port": try port(u),
            "version": "5"
        ]
        if let user = u.user?.removingPercentEncoding, !user.isEmpty {
            out["username"] = user
            out["password"] = u.password?.removingPercentEncoding ?? ""
        }
        return out
    }

    // MARK: - WireGuard
    //
    // С версии 1.12 WireGuard описывается не outbound-ом, а секцией endpoints:
    // у него собственный сетевой интерфейс с адресами, а не просто исходящее
    // соединение.
    //
    // Единого стандарта ссылки нет. Разбираем распространённый вид:
    // wireguard://<приватный_ключ>@host:port?publickey=..&address=10.0.0.2/32
    //             &presharedkey=..&reserved=0,0,0&mtu=1408#Имя

    private static func wireguard(_ raw: String) throws -> [String: Any] {
        let u = try url(raw)
        let q = query(u)

        guard let privateKey = u.user?.removingPercentEncoding, !privateKey.isEmpty else {
            throw ParseError.malformed("в wireguard нет приватного ключа")
        }
        guard let publicKey = (q["publickey"] ?? q["public_key"] ?? q["pubkey"]),
              !publicKey.isEmpty else {
            throw ParseError.malformed("в wireguard нет публичного ключа пира")
        }

        // Локальные адреса интерфейса. Без маски подставляем /32 и /128 —
        // иначе ядро не разберёт префикс.
        let rawAddresses = (q["address"] ?? q["ip"] ?? "")
            .components(separatedBy: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .map { address -> String in
                guard !address.contains("/") else { return address }
                return address.contains(":") ? "\(address)/128" : "\(address)/32"
            }

        let addresses = rawAddresses.isEmpty ? ["172.16.0.2/32"] : rawAddresses

        var peer: [String: Any] = [
            "address": try host(u),
            "port": try port(u),
            "public_key": publicKey,
            // Весь трафик — в туннель: маршрутизацией занимается route.
            "allowed_ips": ["0.0.0.0/0", "::/0"]
        ]

        if let psk = (q["presharedkey"] ?? q["pre_shared_key"] ?? q["psk"]), !psk.isEmpty {
            peer["pre_shared_key"] = psk
        }

        // reserved=1,2,3 — приём, которым пользуются некоторые провайдеры
        // (в частности, WARP), чтобы пометить свои пакеты.
        if let reserved = q["reserved"], !reserved.isEmpty {
            let values = reserved.components(separatedBy: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
            if values.count == 3 { peer["reserved"] = values }
        }

        var endpoint: [String: Any] = [
            "type": "wireguard",
            "tag": "proxy",
            "address": addresses,
            "private_key": privateKey,
            "peers": [peer]
        ]

        if let mtu = q["mtu"], let value = Int(mtu), value > 0 {
            endpoint["mtu"] = value
        }

        return endpoint
    }

    // MARK: - Общие куски

    /// TLS-блок из query-параметров ссылки, включая Reality.
    private static func tlsBlock(_ q: [String: String],
                                 defaultSNI: String,
                                 forceEnabled: Bool = false) -> [String: Any]? {
        let security = (q["security"] ?? "").lowercased()
        let enabled = forceEnabled || security == "tls" || security == "reality" || security == "xtls"
        guard enabled else { return nil }

        var tls: [String: Any] = ["enabled": true]

        let sni = q["sni"] ?? q["peer"] ?? q["host"] ?? defaultSNI
        if !sni.isEmpty { tls["server_name"] = sni }

        if q["allowInsecure"] == "1" || q["insecure"] == "1" {
            tls["insecure"] = true
        }
        if let alpn = q["alpn"], !alpn.isEmpty {
            tls["alpn"] = alpn.components(separatedBy: ",")
        }
        if let fp = q["fp"], !fp.isEmpty {
            tls["utls"] = ["enabled": true, "fingerprint": fp]
        }
        if security == "reality", let pbk = q["pbk"], !pbk.isEmpty {
            var reality: [String: Any] = ["enabled": true, "public_key": pbk]
            if let sid = q["sid"], !sid.isEmpty { reality["short_id"] = sid }
            tls["reality"] = reality
            // Reality без utls не работает — подставляем отпечаток по умолчанию.
            if tls["utls"] == nil {
                tls["utls"] = ["enabled": true, "fingerprint": "chrome"]
            }
        }
        return tls
    }

    /// Транспорт (ws / grpc / http) из query-параметров.
    private static func transportBlock(_ q: [String: String]) -> [String: Any]? {
        switch (q["type"] ?? "tcp").lowercased() {
        case "ws":
            var t: [String: Any] = ["type": "ws"]
            t["path"] = q["path"]?.removingPercentEncoding ?? "/"
            if let h = q["host"], !h.isEmpty { t["headers"] = ["Host": h] }
            return t
        case "grpc":
            return ["type": "grpc", "service_name": q["serviceName"] ?? ""]
        case "http", "h2":
            var t: [String: Any] = ["type": "http"]
            t["path"] = q["path"]?.removingPercentEncoding ?? "/"
            if let h = q["host"], !h.isEmpty { t["host"] = h.components(separatedBy: ",") }
            return t
        case "httpupgrade":
            var t: [String: Any] = ["type": "httpupgrade"]
            t["path"] = q["path"]?.removingPercentEncoding ?? "/"
            if let h = q["host"], !h.isEmpty { t["host"] = h }
            return t
        case "quic":
            return ["type": "quic"]
        default:
            // tcp, а также xhttp и kcp, которых в sing-box нет: соединение
            // пойдёт без транспорта, как обычный TCP.
            return nil
        }
    }

    // MARK: - Мелкие помощники

    private static func url(_ raw: String) throws -> URLComponents {
        guard let u = URLComponents(string: raw) else {
            throw ParseError.malformed("ссылка не разбирается")
        }
        return u
    }

    private static func host(_ u: URLComponents) throws -> String {
        guard let h = u.host, !h.isEmpty else {
            throw ParseError.malformed("нет адреса сервера")
        }
        return h.trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
    }

    private static func port(_ u: URLComponents) throws -> Int {
        guard let p = u.port, p > 0 else {
            throw ParseError.malformed("нет порта")
        }
        return p
    }

    private static func user(_ u: URLComponents) throws -> String {
        guard let user = u.user?.removingPercentEncoding, !user.isEmpty else {
            throw ParseError.malformed("нет UUID/пароля")
        }
        return user
    }

    private static func query(_ u: URLComponents) -> [String: String] {
        var result: [String: String] = [:]
        for item in u.queryItems ?? [] {
            result[item.name] = item.value ?? ""
        }
        return result
    }

    /// base64 в ссылках бывает и обычный, и url-safe, и без хвостовых «=».
    private static func base64Decode(_ s: String) -> Data? {
        var t = s
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let remainder = t.count % 4
        if remainder > 0 {
            t += String(repeating: "=", count: 4 - remainder)
        }
        return Data(base64Encoded: t)
    }
}
