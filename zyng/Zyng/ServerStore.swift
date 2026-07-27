import Foundation
import Combine

/// Подписка — ссылка, по которой провайдер отдаёт список серверов.
struct Subscription: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var name: String
    var url: String
    var updatedAt: Date?
    /// Ключи в том виде, в каком пришли. Разбираются при чтении, чтобы
    /// сохранённые данные не зависели от версии парсера.
    var rawKeys: [String] = []
    /// Как часто обновлять, в часах.
    var autoUpdateHours: Int = 3

    var isStale: Bool {
        guard let updatedAt else { return true }
        return Date().timeIntervalSince(updatedAt) > Double(autoUpdateHours) * 3600
    }
}

/// Хранилище серверов: подписки и одиночные ключи.
@MainActor
final class ServerStore: ObservableObject {

    static let shared = ServerStore()

    @Published private(set) var subscriptions: [Subscription] = []
    /// Ключи, добавленные вручную, — отдельная вкладка.
    @Published private(set) var singleKeys: [String] = []

    /// Какой сервер выбран. Храним строкой ключа: id генерируется заново при
    /// каждом разборе, поэтому по нему выбор не пережил бы перезапуск.
    @Published private(set) var selectedRaw: String = ""

    @Published var refreshing: Set<UUID> = []
    @Published var lastError: String?

    private let defaults = UserDefaults.standard

    private enum Key {
        static let subscriptions = "zyng_subscriptions"
        static let singles = "zyng_keys"
        static let selected = "zyng_selected"
    }

    private init() {
        load()
    }

    // MARK: - Разобранные серверы

    var singleServers: [Server] {
        singleKeys.compactMap(parseServer)
    }

    func servers(in subscription: Subscription) -> [Server] {
        subscription.rawKeys.compactMap(parseServer)
    }

    /// Все серверы разом — из них выбирается активный.
    var allServers: [Server] {
        subscriptions.flatMap { servers(in: $0) } + singleServers
    }

    var selected: Server? {
        allServers.first { $0.raw == selectedRaw } ?? allServers.first
    }

    func select(_ server: Server) {
        selectedRaw = server.raw
        defaults.set(selectedRaw, forKey: Key.selected)
    }

    // MARK: - Одиночные ключи

    /// Возвращает, сколько ключей добавилось: во вставленном тексте их может
    /// быть несколько строк.
    @discardableResult
    func addSingleKeys(from text: String) -> Int {
        let candidates = expand(text)
        let fresh = candidates.filter { key in
            !singleKeys.contains(key) && parseServer(key) != nil
        }
        guard !fresh.isEmpty else { return 0 }

        singleKeys.append(contentsOf: fresh)
        if selectedRaw.isEmpty, let first = fresh.first {
            selectedRaw = first
            defaults.set(selectedRaw, forKey: Key.selected)
        }
        persist()
        return fresh.count
    }

    func removeSingleKey(_ raw: String) {
        singleKeys.removeAll { $0 == raw }
        fixSelectionIfNeeded()
        persist()
    }

    // MARK: - Подписки

    func addSubscription(url: String, name: String? = nil) async {
        let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let parsed = URL(string: trimmed),
              parsed.scheme == "http" || parsed.scheme == "https" else {
            lastError = "Это не похоже на ссылку подписки"
            return
        }

        var sub = Subscription(
            name: name?.isEmpty == false ? name! : (parsed.host ?? "Подписка"),
            url: trimmed
        )

        subscriptions.append(sub)
        persist()

        await refresh(sub.id)

        // Если подписка не отдала ни одного сервера, оставлять её бессмысленно.
        if let updated = subscriptions.first(where: { $0.id == sub.id }),
           updated.rawKeys.isEmpty {
            subscriptions.removeAll { $0.id == sub.id }
            persist()
            sub.rawKeys = []
        }
    }

    func removeSubscription(_ id: UUID) {
        subscriptions.removeAll { $0.id == id }
        fixSelectionIfNeeded()
        persist()
    }

    func refresh(_ id: UUID) async {
        guard let index = subscriptions.firstIndex(where: { $0.id == id }) else { return }

        refreshing.insert(id)
        defer { refreshing.remove(id) }

        do {
            let keys = try await fetchKeys(from: subscriptions[index].url)
            guard !keys.isEmpty else {
                lastError = "Подписка не вернула ни одного сервера"
                return
            }
            subscriptions[index].rawKeys = keys
            subscriptions[index].updatedAt = Date()
            lastError = nil
            fixSelectionIfNeeded()
            persist()
        } catch {
            lastError = "Не удалось обновить: \(error.localizedDescription)"
        }
    }

    /// Обновляет те подписки, у которых вышел срок. Вызывается при открытии.
    func refreshStale() async {
        for sub in subscriptions where sub.isStale {
            await refresh(sub.id)
        }
    }

    /// Панели часто отдают список только знакомым клиентам, поэтому
    /// представляемся по очереди разными и берём первый непустой ответ.
    private static let userAgents = [
        "Happ/1.0", "v2rayNG/1.8.5", "Streisand", "SFI/2.0", "Zyng/1.0"
    ]

    private func fetchKeys(from url: String) async throws -> [String] {
        guard let parsed = URL(string: url) else { return [] }

        var lastError: Error?

        for agent in Self.userAgents {
            var request = URLRequest(url: parsed)
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            request.timeoutInterval = 20
            request.setValue(agent, forHTTPHeaderField: "User-Agent")

            // Панели, которые считают устройства по подписке, ждут именно эти
            // заголовки — без них часть из них отдаёт пустой список.
            request.setValue(jtHWID(), forHTTPHeaderField: "x-hwid")
            request.setValue("ios", forHTTPHeaderField: "x-device-os")
            request.setValue(jtDeviceOS(), forHTTPHeaderField: "x-ver-os")
            request.setValue(jtDeviceModel(), forHTTPHeaderField: "x-device-model")

            do {
                let (data, response) = try await URLSession.shared.data(for: request)

                if let http = response as? HTTPURLResponse,
                   !(200..<300).contains(http.statusCode) {
                    lastError = NSError(
                        domain: "Zyng", code: http.statusCode,
                        userInfo: [NSLocalizedDescriptionKey: "сервер ответил \(http.statusCode)"]
                    )
                    continue
                }

                let keys = expand(String(decoding: data, as: UTF8.self))
                if !keys.isEmpty { return keys }
            } catch {
                lastError = error
            }
        }

        if let lastError { throw lastError }
        return []
    }

    // MARK: - Разбор содержимого

    /// Превращает текст в список ключей. Подписки отдают либо готовые строки,
    /// либо всё это, закодированное в base64 одним куском.
    private func expand(_ text: String) -> [String] {
        let direct = lines(of: text)
        if !direct.isEmpty { return direct }

        if let data = Data(base64Encoded: padBase64(text)) {
            return lines(of: String(decoding: data, as: UTF8.self))
        }
        return []
    }

    private func lines(of text: String) -> [String] {
        text.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { parseServer($0) != nil }
    }

    // MARK: - Хранение

    private func fixSelectionIfNeeded() {
        let available = allServers.map(\.raw)
        if selectedRaw.isEmpty || !available.contains(selectedRaw) {
            selectedRaw = available.first ?? ""
            defaults.set(selectedRaw, forKey: Key.selected)
        }
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(subscriptions) {
            defaults.set(data, forKey: Key.subscriptions)
        }
        defaults.set(singleKeys.joined(separator: "\n"), forKey: Key.singles)
    }

    private func load() {
        if let data = defaults.data(forKey: Key.subscriptions),
           let decoded = try? JSONDecoder().decode([Subscription].self, from: data) {
            subscriptions = decoded
        }

        // Ключи из прежней версии приложения лежат тут же — они станут
        // одиночными, ничего не потеряется.
        let raw = defaults.string(forKey: Key.singles) ?? ""
        singleKeys = raw.split(whereSeparator: \.isNewline)
            .map(String.init)
            .filter { parseServer($0) != nil }

        selectedRaw = defaults.string(forKey: Key.selected) ?? ""
        fixSelectionIfNeeded()
    }
}
