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

    /// generate_204 отдаёт пустой ответ без тела и не кэшируется.
    private static let probeURL = URL(string: "https://www.gstatic.com/generate_204")!

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

    private func measure() async {
        var request = URLRequest(url: Self.probeURL)
        request.httpMethod = "HEAD"
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData

        let started = Date()
        do {
            _ = try await session.data(for: request)
            guard !Task.isCancelled else { return }
            latency = Int(Date().timeIntervalSince(started) * 1000)
            failed = false
        } catch {
            guard !Task.isCancelled else { return }
            latency = nil
            failed = true
        }
    }
}
