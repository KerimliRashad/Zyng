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

    /// Три секунды хватало не всегда: на сотовой сети первое обращение к серверу
    /// включает ещё и разрешение имени, и замер обрывался на полпути — сервер
    /// показывался мёртвым, хотя подключался нормально.
    private static let timeout: TimeInterval = 4

    /// Сколько раз пробовать. Одиночный отказ на мобильной сети — обычное дело,
    /// и из-за него у части серверов вместо задержки стоял прочерк.
    private static let attempts = 2

    /// Ключи, которые меряются прямо сейчас.
    ///
    /// Раньше вместо этого стоял простой запрет входить повторно, и переключение
    /// вкладки во время замера означало, что серверы соседней подписки не
    /// померяют вообще — вызов молча выходил, а крутилки оставались навсегда.
    private var inFlight: Set<String> = []

    /// Меряет переданные серверы. Параллельно, но не больше восьми разом, иначе
    /// на мобильной сети замеры мешают друг другу и врут.
    ///
    /// `force` — мерить заново даже то, что уже измерено. Без него автозамер
    /// при открытии списка и при смене вкладки берёт только новое.
    func measure(_ servers: [Server], force: Bool = false) async {
        let pending = servers.filter { server in
            guard !inFlight.contains(server.raw) else { return false }
            return force || results[server.raw] == nil
        }
        guard !pending.isEmpty else { return }

        inFlight.formUnion(pending.map(\.raw))
        isRunning = true
        defer {
            inFlight.subtract(pending.map(\.raw))
            isRunning = !inFlight.isEmpty
        }

        await withTaskGroup(of: (String, Int?).self) { group in
            var index = 0
            let limit = 8

            func addNext() {
                guard index < pending.count else { return }
                let server = pending[index]
                index += 1
                group.addTask {
                    (server.raw, await Self.probe(server.raw))
                }
            }

            for _ in 0..<min(limit, pending.count) { addNext() }

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

    // ВАЖНО: всё ниже — nonisolated.
    //
    // Класс помечен @MainActor, и без этого слова статические функции наследуют
    // его изоляцию: задачи из withTaskGroup выстраивались в очередь на главном
    // акторе и выполнялись строго по одной. Обещанной параллельности не было
    // вовсе, а с двумя попытками по несколько секунд список мерился так долго,
    // что выглядел зависшим.

    /// Адрес и порт достаём тем же разборщиком, что строит конфиг ядра, —
    /// он уже умеет все форматы, включая base64 в vmess и пиров WireGuard.
    private nonisolated static func endpoint(of raw: String) -> (String, UInt16)? {
        guard let server = try? SingBoxConfig.serverEndpoint(from: raw),
              server.port > 0, server.port <= 65535,
              !server.host.isEmpty else {
            return nil
        }
        return (server.host, UInt16(server.port))
    }

    /// Пробует несколько раз и возвращает лучший результат.
    private nonisolated static func probe(_ raw: String) async -> Int? {
        for attempt in 0..<attempts {
            if let ms = await probeOnce(raw) { return ms }
            // Небольшая пауза: подряд идущие попытки упираются в то же самое
            // состояние сети, что и первая.
            if attempt + 1 < attempts {
                try? await Task.sleep(nanoseconds: 300_000_000)
            }
        }
        return nil
    }

    private nonisolated static func probeOnce(_ raw: String) async -> Int? {
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

            // Вызывается из обработчика соединения и из таймаута — то есть
            // с разных потоков, поэтому @Sendable.
            @Sendable func finish(_ value: Int?) {
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
