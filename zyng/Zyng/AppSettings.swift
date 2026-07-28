import SwiftUI
import Combine

/// Настройки приложения. Хранятся в App Group, чтобы расширение тоже их видело —
/// выбор DNS влияет на конфигурацию ядра.
@MainActor
final class AppSettings: ObservableObject {

    static let shared = AppSettings()

    private let defaults = UserDefaults(suiteName: TunnelDiagnostics.appGroup)
        ?? .standard

    private enum Key {
        static let dns = "settings_dns"
        static let autoConnect = "settings_autoconnect"
        static let haptics = "settings_haptics"
        static let liveActivity = "settings_live_activity"
    }

    // MARK: - DNS

    enum DNSProvider: String, CaseIterable, Identifiable {
        case cloudflare
        case google
        case adguard
        case quad9

        var id: String { rawValue }

        var title: String {
            switch self {
            case .cloudflare: return "Cloudflare"
            case .google:     return "Google"
            case .adguard:    return "AdGuard"
            case .quad9:      return "Quad9"
            }
        }

        var subtitle: String {
            switch self {
            case .cloudflare: return "1.1.1.1 · быстрый"
            case .google:     return "8.8.8.8 · надёжный"
            case .adguard:    return "94.140.14.14 · режет рекламу"
            case .quad9:      return "9.9.9.9 · блокирует вредоносное"
            }
        }

        /// Адрес, который уйдёт в конфигурацию ядра.
        var address: String {
            switch self {
            case .cloudflare: return "1.1.1.1"
            case .google:     return "8.8.8.8"
            case .adguard:    return "94.140.14.14"
            case .quad9:      return "9.9.9.9"
            }
        }

        var icon: String {
            switch self {
            case .cloudflare: return "bolt.fill"
            case .google:     return "checkmark.shield.fill"
            case .adguard:    return "hand.raised.fill"
            case .quad9:      return "lock.shield.fill"
            }
        }
    }

    @Published var dns: DNSProvider {
        didSet { defaults.set(dns.rawValue, forKey: Key.dns) }
    }

    /// Переподключаться автоматически, если соединение оборвалось.
    @Published var autoConnect: Bool {
        didSet { defaults.set(autoConnect, forKey: Key.autoConnect) }
    }

    @Published var haptics: Bool {
        didSet { defaults.set(haptics, forKey: Key.haptics) }
    }

    /// Плашка соединения на экране блокировки и в Dynamic Island.
    @Published var liveActivity: Bool {
        didSet { defaults.set(liveActivity, forKey: Key.liveActivity) }
    }

    private init() {
        let stored = defaults.string(forKey: Key.dns) ?? DNSProvider.cloudflare.rawValue
        dns = DNSProvider(rawValue: stored) ?? .cloudflare

        // Значения по умолчанию: у отсутствующего ключа bool читается как false,
        // поэтому для вибрации задаём true явно.
        autoConnect = defaults.bool(forKey: Key.autoConnect)
        haptics = defaults.object(forKey: Key.haptics) as? Bool ?? true
        liveActivity = defaults.object(forKey: Key.liveActivity) as? Bool ?? true
    }

    // MARK: - Версии

    var appVersion: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—"
        return "\(version) (\(build))"
    }
}
