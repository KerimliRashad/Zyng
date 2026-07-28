import Foundation
import Combine

/// Замеряет задержку соединения, пока VPN подключён.
///
/// Меряем из приложения, а не из расширения: когда туннель поднят, трафик
/// приложения идёт через него, поэтому измеренное время — это реальная задержка
/// до сервера и обратно, ровно то, что интересует пользователя.
///
/// Настоящий ICMP-пинг на iOS без низкоуровневых сокетов недоступен, поэтому
/// используем HTTP-запрос к странице, которая отдаёт пустой ответ 204 —
/// у неё нет тела, и время измеряется почти чисто.
@MainActor
final class PingMonitor: ObservableObject {

    /// Задержка в миллисекундах. nil — ещё не измеряли или замер не удался.
    @Published private(set) var latency: Int?

    /// Замер не прошёл — сеть есть, но ответа нет.
    @Published private(set) var failed = false

    private var task: Task<Void, Never>?

    /// Адреса, отдающие крошечный ответ. Пробуем по очереди: часть из них
    /// бывает недоступна у отдельных провайдеров или за конкретным сервером,
    /// и тогда замер врал бы «нет ответа» при работающем туннеле.
    private static let probeURLs = [
        // Проверка сети от Apple — доступна практически везде.
        URL(string: "https://captive.apple.com/hotspot-detect.html")!,
        URL(string: "https://www.gstatic.com/generate_204")!,
        URL(string: "https://cp.cloudflare.com/generate_204")!
    ]

    /// Адрес, ответивший последним, чтобы не перебирать список каждый раз.
    private var preferred: URL?

    /// Одноразовая сессия — принципиально.
    ///
    /// Постоянная переиспользует соединение между замерами, и после поднятия
    /// туннеля продолжает держать то, что было открыто на старом интерфейсе.
    /// Запросы уходят в никуда и отваливаются по таймауту, хотя туннель жив.
    private let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        config.timeoutIntervalForRequest = 5
        config.urlCache = nil
        return URLSession(configuration: config)
    }()

    func start() {
        guard task == nil else { return }

        task = Task { [weak self] in
            // Первый замер сразу, дальше раз в 5 секунд.
            while !Task.isCancelled {
                await self?.measure()
                try? await Task.sleep(nanoseconds: 5_000_000_000)
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
        latency = nil
        failed = false
    }

    /// Немедленный замер — например, при возвращении из фона, когда показанное
    /// значение успело устареть.
    func refreshNow() {
        Task { await measure() }
    }

    private func measure() async {
        // Начинаем с того, который отвечал в прошлый раз.
        var candidates = Self.probeURLs
        if let preferred, let index = candidates.firstIndex(of: preferred) {
            candidates.remove(at: index)
            candidates.insert(preferred, at: 0)
        }

        for url in candidates {
            guard !Task.isCancelled else { return }

            var request = URLRequest(url: url)
            request.httpMethod = "HEAD"
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData

            let started = Date()
            do {
                _ = try await session.data(for: request)
                guard !Task.isCancelled else { return }

                latency = Int(Date().timeIntervalSince(started) * 1000)
                failed = false
                preferred = url
                return
            } catch {
                continue
            }
        }

        guard !Task.isCancelled else { return }
        latency = nil
        failed = true
    }
}
