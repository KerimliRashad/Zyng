import SwiftUI
import WidgetKit
import ActivityKit

/// Плашка соединения: на экране блокировки и в Dynamic Island.
struct ZyngLiveActivity: Widget {

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TunnelActivityAttributes.self) { context in

            // --- Экран блокировки и баннер ---
            lockScreen(context.state)
                .activityBackgroundTint(Color(red: 0.055, green: 0.063, blue: 0.078))
                .activitySystemActionForegroundColor(.white)

        } dynamicIsland: { context in

            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 8) {
                        shield
                        Text(context.state.flag)
                            .font(.system(size: 20))
                    }
                    .padding(.leading, 4)
                }

                DynamicIslandExpandedRegion(.trailing) {
                    // Системный таймер: отсчитывается сам, без обновлений
                    // активности каждую секунду.
                    Text(context.state.connectedAt, style: .timer)
                        .font(.system(size: 16, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white)
                        .frame(maxWidth: 70)
                        .padding(.trailing, 4)
                }

                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(context.state.serverName)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.white)
                            .lineLimit(1)

                        Spacer()

                        if let ms = context.state.latency {
                            latencyBadge(ms)
                        }
                    }
                    .padding(.horizontal, 4)
                }

            } compactLeading: {
                shield
            } compactTrailing: {
                Text(context.state.connectedAt, style: .timer)
                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                    .foregroundColor(.green)
                    .frame(maxWidth: 44)
            } minimal: {
                shield
            }
            .keylineTint(.green)
        }
    }

    // MARK: - Экран блокировки

    private func lockScreen(_ state: TunnelActivityAttributes.ContentState) -> some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(Color.green.opacity(0.15))
                    .frame(width: 44, height: 44)
                Image(systemName: "bolt.shield.fill")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(.green)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(tr("Защищено", "Protected"))
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)

                HStack(spacing: 6) {
                    Text(state.flag)
                        .font(.system(size: 13))
                    Text(state.serverName)
                        .font(.system(size: 13))
                        .foregroundColor(.white.opacity(0.7))
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 4) {
                Text(state.connectedAt, style: .timer)
                    .font(.system(size: 17, weight: .semibold, design: .monospaced))
                    .foregroundColor(.white)
                    .frame(maxWidth: 78, alignment: .trailing)

                if let ms = state.latency {
                    latencyBadge(ms)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Мелочи

    private var shield: some View {
        Image(systemName: "bolt.shield.fill")
            .font(.system(size: 15, weight: .semibold))
            .foregroundColor(.green)
    }

    private func latencyBadge(_ ms: Int) -> some View {
        let color: Color = ms < 100 ? .green : (ms < 250 ? .blue : .orange)
        return Text("\(ms) мс")
            .font(.system(size: 11, weight: .semibold, design: .monospaced))
            .foregroundColor(color)
    }
}

@main
struct ZyngWidgetsBundle: WidgetBundle {
    var body: some Widget {
        ZyngLiveActivity()

        // Переключатель в Пункте управления появился только в iOS 18.
        if #available(iOS 18.0, *) {
            ZyngControl()
        }
    }
}
