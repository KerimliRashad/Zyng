import Foundation

/// Общий канал диагностики между расширением и приложением.
///
/// Расширение — отдельный процесс, и его логи в консоли приложения не видны.
/// Хуже того, когда ядро падает, оно умирает мгновенно и не успевает ничего
/// сообщить через NetworkExtension: приложение видит только «отключено».
///
/// Поэтому вывод ядра перенаправляется в файл в App Group, а приложение читает
/// его и показывает причину прямо на экране.
enum TunnelDiagnostics {

    static let appGroup = "group.online.zyng.Zyng"

    /// Куда ядро пишет свой вывод, включая панику Go.
    static var stderrPath: String? {
        container?.appendingPathComponent("core/stderr.log").path
    }

    private static var container: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
    }

    // MARK: - Запись (со стороны расширения)

    /// Наши собственные ошибки — те, до которых ядро даже не дошло.
    static func record(_ message: String) {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return }
        defaults.set(message, forKey: "lastError")
        defaults.set(Date(), forKey: "lastErrorAt")
    }

    static func clear() {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return }
        defaults.removeObject(forKey: "lastError")
        defaults.removeObject(forKey: "lastErrorAt")

        // Старый вывод ядра тоже убираем, иначе после успешного запуска
        // покажется ошибка от прошлой попытки.
        if let path = stderrPath {
            try? FileManager.default.removeItem(atPath: path)
        }
    }

    // MARK: - Чтение (со стороны приложения)

    /// Последняя причина сбоя: сначала наша ошибка, иначе — вывод ядра.
    static func lastFailure() -> String? {
        if let defaults = UserDefaults(suiteName: appGroup),
           let message = defaults.string(forKey: "lastError"),
           !message.isEmpty {
            return message
        }
        return coreOutputSummary()
    }

    /// Из вывода ядра берём самое информативное: строку паники, если она есть,
    /// иначе последние несколько строк.
    private static func coreOutputSummary(limit: Int = 6) -> String? {
        guard let path = stderrPath,
              let text = try? String(contentsOfFile: path, encoding: .utf8) else {
            return nil
        }

        let lines = text
            .split(whereSeparator: \.isNewline)
            .map(String.init)
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }

        guard !lines.isEmpty else { return nil }

        if let panic = lines.first(where: { $0.hasPrefix("panic:") }) {
            return panic
        }

        return lines.suffix(limit).joined(separator: "\n")
    }
}
