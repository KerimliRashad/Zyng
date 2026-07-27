import Foundation
import Combine

/// Подписка — ссылка, по которой провайдер отдаёт список серверов.
///
/// Имя, лимит трафика и срок действия приходят не в теле ответа, а в его
/// заголовках — так это устроено во всех панелях. Поэтому здесь хранится
/// не только список ключей.
struct Subscription: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    /// Имя из заголовка profile-title. Пока подписка не загружена — хост ссылки.
    var name: String
    var url: String
    var updatedAt: Date?
    /// Ключи в том виде, в каком пришли. Разбираются при чтении, чтобы
    /// сохранённые данные не зависели от версии парсера.
    var rawKeys: [String] = []
    /// Как часто обновлять, в часах. Панель может задать своё значение.
    var autoUpdateHours: Int = 3

    // Данные из заголовка subscription-userinfo.
    var uploaded: Int64 = 0
    var downloaded: Int64 = 0
    /// 0 означает безлимит.
    var totalTraffic: Int64 = 0
    var expiresAt: Date?

    /// Ссылка на личный кабинет, если панель её прислала.
    var webPage: String?

    var usedTraffic: Int64 { uploaded + downloaded }

    var isUnlimited: Bool { totalTraffic <= 0 }

    /// Доля израсходованного трафика, 0…1. Для безлимита не имеет смысла.
    var usedFraction: Double {
        guard !isUnlimited else { return 0 }
        return min(1, max(0, Double(usedTraffic) / Double(totalTraffic)))
    }

    var isStale: Bool {
        guard let updatedAt else { return true }
        return Date().timeIntervalSince(updatedAt) > Double(autoUpdateHours) * 3600
    }
}

/// Человекочитаемый объём: 6 GB, 512 MB и так далее.
func formatBytes(_ value: Int64) -> String {
    guard value > 0 else { return "0 B" }
    let units = ["B", "KB", "MB", "GB", "TB"]
    var size = Double(value)
    var index = 0
    while size >= 1024, index < units.count - 1 {
        size /= 1024
        index += 1
    }
    return size >= 100 || index == 0
        ? String(format: "%.0f %@", size, units[index])
        : String(format: "%.1f %@", size, units[index])
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
            let profile = try await fetchProfile(from: subscriptions[index].url)
            guard !profile.keys.isEmpty else {
                lastError = "Подписка не вернула ни одного сервера"
                return
            }

            subscriptions[index].rawKeys = profile.keys
            subscriptions[index].updatedAt = Date()

            // Имя из панели важнее того, что подставили при добавлении.
            if let title = profile.title, !title.isEmpty {
                subscriptions[index].name = title
            }
            subscriptions[index].uploaded = profile.uploaded
            subscriptions[index].downloaded = profile.downloaded
            subscriptions[index].totalTraffic = profile.total
            subscriptions[index].expiresAt = profile.expiresAt
            subscriptions[index].webPage = profile.webPage
            if let hours = profile.updateHours {
                subscriptions[index].autoUpdateHours = hours
            }

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

    /// Что удалось вытащить из ответа панели.
    private struct Profile {
        var keys: [String] = []
        var title: String?
        var uploaded: Int64 = 0
        var downloaded: Int64 = 0
        var total: Int64 = 0
        var expiresAt: Date?
        var updateHours: Int?
        var webPage: String?
    }

    private func fetchProfile(from url: String) async throws -> Profile {
        guard let parsed = URL(string: url) else { return Profile() }

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
                if !keys.isEmpty {
                    var profile = Profile(keys: keys)
                    if let http = response as? HTTPURLResponse {
                        Self.readHeaders(http, into: &profile)
                    }
                    return profile
                }
            } catch {
                lastError = error
            }
        }

        if let lastError { throw lastError }
        return Profile()
    }

    /// Разбирает заголовки, которыми панели описывают подписку.
    private static func readHeaders(_ response: HTTPURLResponse, into profile: inout Profile) {
        func header(_ name: String) -> String? {
            let value = response.value(forHTTPHeaderField: name)?
                .trimmingCharacters(in: .whitespaces)
            return value?.isEmpty == false ? value : nil
        }

        // Имя профиля. Часто приходит закодированным: "base64:0JbQtdGE..."
        if let raw = header("profile-title") {
            profile.title = decodeTitle(raw)
        } else if let disposition = header("content-disposition"),
                  let range = disposition.range(of: "filename=") {
            profile.title = String(disposition[range.upperBound...])
                .trimmingCharacters(in: CharacterSet(charactersIn: "\"' "))
        }

        // subscription-userinfo: upload=1234; download=5678; total=0; expire=1700000000
        if let info = header("subscription-userinfo") {
            for pair in info.split(separator: ";") {
                let parts = pair.split(separator: "=", maxSplits: 1)
                guard parts.count == 2 else { continue }
                let key = parts[0].trimmingCharacters(in: .whitespaces).lowercased()
                let value = parts[1].trimmingCharacters(in: .whitespaces)

                switch key {
                case "upload":   profile.uploaded = Int64(value) ?? 0
                case "download": profile.downloaded = Int64(value) ?? 0
                case "total":    profile.total = Int64(value) ?? 0
                case "expire":
                    if let seconds = Double(value), seconds > 0 {
                        profile.expiresAt = Date(timeIntervalSince1970: seconds)
                    }
                default: break
                }
            }
        }

        // Интервал панель задаёт в часах.
        if let interval = header("profile-update-interval"), let hours = Int(interval), hours > 0 {
            profile.updateHours = hours
        }

        profile.webPage = header("profile-web-page-url")
    }

    private static func decodeTitle(_ raw: String) -> String {
        let value = raw.hasPrefix("base64:")
            ? String(raw.dropFirst("base64:".count))
            : raw

        if let data = Data(base64Encoded: padBase64(value)),
           let decoded = String(data: data, encoding: .utf8),
           !decoded.isEmpty {
            return decoded
        }
        return raw
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
