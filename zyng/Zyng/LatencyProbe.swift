import Foundation
import Network
import Combine

/// Пропускает только первый вызов. Нужен там, где несколько обработчиков могут
/// завершить одну и ту же операцию.
private final class OnceFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var used = false

    func claim() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if used { return false }
        used = true
        return true
    }
}

/// Измеряет задержку до серверов из списка, не поднимая туннель.
///
/// Меряется время установки TCP-соединения с адресом и портом сервера —
/// это честный отклик самого сервера. ICMP-пинг на iOS обычным приложениям
/// недоступен, а TCP-соединение показывает ровно то, что важно: успеет ли
/// сервер ответить и как быстро.
@MainActor
final class LatencyProbe: ObservableObject {

    /// Задержка в миллисекундах по строке ключа. Значение nil означает,
    /// что сервер не ответил.
    @Published private(set) var results: [String: Int?] = [:]
    @Published private(set) var isRunning = false

    private static let timeout: TimeInterval = 3

    /// Меряет все переданные серверы. Параллельно, но не больше восьми разом,
    /// иначе на мобильной сети замеры мешают друг другу и врут.
    func measure(_ servers: [Server]) async {
        guard !isRunning, !servers.isEmpty else { return }
        isRunning = true
        defer { isRunning = false }

        await withTaskGroup(of: (String, Int?).self) { group in
            var index = 0
            let limit = 8

            func addNext() {
                guard index < servers.count else { return }
                let server = servers[index]
                index += 1
                group.addTask {
                    (server.raw, await Self.probe(server.raw))
                }
            }

            for _ in 0..<min(limit, servers.count) { addNext() }

            for await (raw, ms) in group {
                results[raw] = ms
                addNext()
            }
        }
    }

    func latency(for server: Server) -> Int?? {
        results[server.raw]
    }

    func clear() {
        results = [:]
    }

    // MARK: - Замер одного сервера

    /// Адрес и порт достаём тем же разборщиком, что строит конфиг ядра, —
    /// он уже умеет все форматы, включая base64 в vmess.
    private static func endpoint(of raw: String) -> (String, UInt16)? {
        guard let outbound = try? SingBoxConfig.makeOutbound(from: raw),
              let host = outbound["server"] as? String,
              let port = outbound["server_port"] as? Int,
              port > 0, port <= 65535,
              !host.isEmpty else {
            return nil
        }
        return (host, UInt16(port))
    }

    private static func probe(_ raw: String) async -> Int? {
        guard let (host, port) = endpoint(of: raw),
              let nwPort = NWEndpoint.Port(rawValue: port) else {
            return nil
        }

        let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(host), port: nwPort)

        let parameters = NWParameters.tcp
        // Нас интересует отклик сервера, а не работа через уже поднятый туннель.
        parameters.preferNoProxies = true

        return await withCheckedContinuation { continuation in
            let connection = NWConnection(to: endpoint, using: parameters)
            let started = Date()

            // Продолжение можно возобновить только один раз, а обработчик
            // состояния и таймаут могут сработать одновременно.
            let once = OnceFlag()

            func finish(_ value: Int?) {
                guard once.claim() else { return }
                connection.cancel()
                continuation.resume(returning: value)
            }

            connection.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    finish(Int(Date().timeIntervalSince(started) * 1000))
                case .failed, .cancelled:
                    finish(nil)
                default:
                    break
                }
            }

            connection.start(queue: .global(qos: .userInitiated))

            DispatchQueue.global().asyncAfter(deadline: .now() + timeout) {
                finish(nil)
            }
        }
    }
}
