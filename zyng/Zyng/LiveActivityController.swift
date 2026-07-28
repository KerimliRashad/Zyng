import Foundation

#if canImport(ActivityKit)
import ActivityKit

/// Управляет плашкой на экране блокировки и в Dynamic Island.
///
/// Активность живёт ровно столько, сколько поднят туннель. Обновляем её редко —
/// таймер система отсчитывает сама по дате подключения, а не по нашим тикам.
@MainActor
final class LiveActivityController {

    static let shared = LiveActivityController()

    private var activity: Activity<TunnelActivityAttributes>?

    private init() {}

    var isSupported: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    func start(serverName: String, flag: String, connectedAt: Date, latency: Int?) {
        guard AppSettings.shared.liveActivity, isSupported else { return }

        let state = TunnelActivityAttributes.ContentState(
            connectedAt: connectedAt,
            serverName: serverName,
            flag: flag,
            latency: latency
        )

        // Уже запущена — просто обновляем, иначе получим вторую плашку.
        if activity != nil {
            update(state)
            return
        }

        do {
            activity = try Activity.request(
                attributes: TunnelActivityAttributes(),
                content: ActivityContent(state: state, staleDate: nil)
            )
        } catch {
            NSLog("⚠️ Zyng: не удалось запустить Live Activity: \(error.localizedDescription)")
        }
    }

    func update(serverName: String, flag: String, connectedAt: Date, latency: Int?) {
        guard activity != nil else { return }
        update(TunnelActivityAttributes.ContentState(
            connectedAt: connectedAt,
            serverName: serverName,
            flag: flag,
            latency: latency
        ))
    }

    private func update(_ state: TunnelActivityAttributes.ContentState) {
        let current = activity
        Task {
            await current?.update(ActivityContent(state: state, staleDate: nil))
        }
    }

    func stop() {
        let current = activity
        activity = nil
        Task {
            await current?.end(nil, dismissalPolicy: .immediate)
        }
    }

    /// Убирает плашки, оставшиеся от прошлого запуска — например, если
    /// приложение выгрузили, не отключив туннель.
    func cleanupStale() {
        Task {
            for activity in Activity<TunnelActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
}
#endif
