import SwiftUI

/// Экран выбора сервера: подписки и одиночные ключи на разных вкладках.
@MainActor
struct ServerListView: View {

    @ObservedObject var store: ServerStore
    @StateObject private var probe = LatencyProbe()

    /// Закрыть экран после выбора сервера.
    let onPicked: () -> Void
    let onAdd: () -> Void

    enum Tab: String, CaseIterable {
        case subscriptions = "Подписки"
        case singles = "Ключи"
    }

    @State private var tab: Tab = .subscriptions
    @State private var expanded: Set<UUID> = []

    var body: some View {
        ZStack {
            JT.bg1.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                tabPicker.padding(.horizontal, 16).padding(.bottom, 12)

                ScrollView {
                    VStack(spacing: 10) {
                        switch tab {
                        case .subscriptions: subscriptionsSection
                        case .singles:       singlesSection
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 28)
                }
            }
        }
        .task {
            // Подписки со вышедшим сроком обновляем при открытии экрана.
            await store.refreshStale()
        }
    }

    // MARK: - Шапка

    private var header: some View {
        HStack(spacing: 12) {
            Text("Серверы")
                .foregroundColor(JT.text)
                .font(.system(size: 20, weight: .bold))

            Spacer()

            // Замерить все разом — как кнопка со спидометром в примере.
            Button {
                jtHaptic()
                Task { await probe.measure(visibleServers) }
            } label: {
                Group {
                    if probe.isRunning {
                        ProgressView().tint(JT.accent)
                    } else {
                        Image(systemName: "speedometer").font(.system(size: 18, weight: .semibold))
                    }
                }
                .foregroundColor(JT.accent)
                .frame(width: 32, height: 32)
            }
            .disabled(probe.isRunning || visibleServers.isEmpty)

            Button { onAdd() } label: {
                Image(systemName: "plus")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(JT.accent)
                    .frame(width: 32, height: 32)
            }

            Button { onPicked() } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundColor(JT.sub)
                    .font(.system(size: 24))
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
        .padding(.bottom, 14)
    }

    private var tabPicker: some View {
        HStack(spacing: 6) {
            ForEach(Tab.allCases, id: \.self) { item in
                let active = tab == item
                let count = item == .subscriptions
                    ? store.subscriptions.count
                    : store.singleKeys.count

                Button {
                    withAnimation(.easeOut(duration: 0.15)) { tab = item }
                } label: {
                    HStack(spacing: 6) {
                        Text(item.rawValue)
                            .font(.system(size: 14, weight: .semibold))
                        Text("\(count)")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(active ? .white.opacity(0.8) : JT.sub)
                    }
                    .foregroundColor(active ? .white : JT.sub)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(active ? JT.accent : JT.card)
                    )
                }
            }
        }
        .padding(4)
        .background(RoundedRectangle(cornerRadius: 16).fill(JT.bg2))
    }

    /// Серверы текущей вкладки — их и меряем кнопкой замера.
    private var visibleServers: [Server] {
        switch tab {
        case .subscriptions: return store.subscriptions.flatMap { store.servers(in: $0) }
        case .singles:       return store.singleServers
        }
    }

    // MARK: - Подписки

    @ViewBuilder
    private var subscriptionsSection: some View {
        if store.subscriptions.isEmpty {
            emptyState(
                icon: "arrow.triangle.2.circlepath",
                title: "Подписок пока нет",
                hint: "Добавь ссылку — серверы обновятся сами"
            )
        } else {
            ForEach(store.subscriptions) { sub in
                subscriptionCard(sub)
            }
        }
    }

    private func subscriptionCard(_ sub: Subscription) -> some View {
        let servers = store.servers(in: sub)
        let isOpen = expanded.contains(sub.id)

        return VStack(spacing: 0) {
            // Заголовок подписки: имя, когда обновлялась, кнопки.
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(sub.name)
                        .foregroundColor(JT.text)
                        .font(.system(size: 16, weight: .bold))
                        .lineLimit(1)

                    Text(subtitle(for: sub, count: servers.count))
                        .foregroundColor(JT.sub)
                        .font(.system(size: 11))
                }

                Spacer()

                Button {
                    jtHaptic()
                    Task { await store.refresh(sub.id) }
                } label: {
                    Group {
                        if store.refreshing.contains(sub.id) {
                            ProgressView().tint(JT.accent)
                        } else {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 15, weight: .semibold))
                        }
                    }
                    .foregroundColor(JT.accent)
                    .frame(width: 28, height: 28)
                }

                Menu {
                    Button(role: .destructive) {
                        store.removeSubscription(sub.id)
                    } label: {
                        Label("Удалить подписку", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(JT.sub)
                        .frame(width: 28, height: 28)
                }
            }
            .padding(14)
            .contentShape(Rectangle())
            .onTapGesture {
                withAnimation(.easeOut(duration: 0.18)) {
                    if isOpen { expanded.remove(sub.id) } else { expanded.insert(sub.id) }
                }
            }

            if isOpen {
                Divider().background(JT.stroke)
                VStack(spacing: 8) {
                    ForEach(servers) { server in
                        serverRow(server, showDelete: false)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 10)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(JT.card)
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(JT.stroke, lineWidth: 1))
        )
    }

    private func subtitle(for sub: Subscription, count: Int) -> String {
        var parts = ["\(count) серв."]
        if let updated = sub.updatedAt {
            let formatter = DateFormatter()
            formatter.dateFormat = "dd.MM HH:mm"
            parts.append(formatter.string(from: updated))
        } else {
            parts.append("не обновлялась")
        }
        parts.append("авто — \(sub.autoUpdateHours) ч.")
        return parts.joined(separator: " • ")
    }

    // MARK: - Одиночные ключи

    @ViewBuilder
    private var singlesSection: some View {
        if store.singleServers.isEmpty {
            emptyState(
                icon: "key",
                title: "Отдельных ключей нет",
                hint: "Вставь ключ vless:// или другой"
            )
        } else {
            ForEach(store.singleServers) { server in
                serverRow(server, showDelete: true)
            }
        }
    }

    // MARK: - Строка сервера

    private func serverRow(_ server: Server, showDelete: Bool) -> some View {
        let isSelected = server.raw == store.selectedRaw

        return HStack(spacing: 12) {
            Text(server.flag).font(.system(size: 22))

            VStack(alignment: .leading, spacing: 2) {
                Text(server.name)
                    .foregroundColor(JT.text)
                    .font(.system(size: 15, weight: .semibold))
                    .lineLimit(1)
                Text(server.proto)
                    .foregroundColor(JT.sub)
                    .font(.system(size: 11))
            }

            Spacer(minLength: 8)

            latencyLabel(for: server)

            if isSelected {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(JT.green)
                    .font(.system(size: 18))
            }

            if showDelete {
                Button {
                    store.removeSingleKey(server.raw)
                } label: {
                    Image(systemName: "trash")
                        .foregroundColor(JT.red.opacity(0.8))
                        .font(.system(size: 14))
                }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(isSelected ? JT.cardHi : JT.bg2)
                .overlay(RoundedRectangle(cornerRadius: 14)
                    .stroke(isSelected ? JT.green.opacity(0.4) : JT.stroke, lineWidth: 1))
        )
        .contentShape(Rectangle())
        .onTapGesture {
            jtHaptic()
            store.select(server)
            onPicked()
        }
    }

    /// Три состояния: не мерили, не ответил, ответил за N мс.
    @ViewBuilder
    private func latencyLabel(for server: Server) -> some View {
        if let measured = probe.latency(for: server) {
            if let ms = measured {
                Text("\(ms) мс")
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundColor(color(forLatency: ms))
            } else {
                Text("—")
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundColor(JT.red.opacity(0.8))
            }
        }
    }

    private func color(forLatency ms: Int) -> Color {
        switch ms {
        case ..<100:  return JT.green
        case ..<250:  return JT.accent
        default:      return JT.red
        }
    }

    // MARK: - Пустое состояние

    private func emptyState(icon: String, title: String, hint: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 34))
                .foregroundColor(JT.sub.opacity(0.7))
            Text(title)
                .foregroundColor(JT.text)
                .font(.system(size: 15, weight: .semibold))
            Text(hint)
                .foregroundColor(JT.sub)
                .font(.system(size: 13))
                .multilineTextAlignment(.center)
            Button("Добавить") { onAdd() }
                .foregroundColor(JT.accent)
                .font(.system(size: 15, weight: .semibold))
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }
}
