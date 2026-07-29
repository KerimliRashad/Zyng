import SwiftUI

/// Экран выбора сервера.
///
/// Каждая подписка — своя вкладка со своим именем, трафиком и списком серверов.
/// Последняя вкладка — ключи, добавленные вручную.
@MainActor
struct ServerListView: View {

    @ObservedObject var store: ServerStore
    @StateObject private var probe = LatencyProbe()

    let onPicked: () -> Void
    let onAdd: () -> Void

    /// Вкладка — либо конкретная подписка, либо раздел одиночных ключей.
    private enum Tab: Hashable {
        case subscription(UUID)
        case singles
    }

    @State private var tab: Tab?

    /// Сервер, по которому нажали, но подключиться к нему нельзя.
    @State private var unsupported: Server?

    var body: some View {
        ZStack {
            JT.bg1.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                tabBar

                ScrollView {
                    VStack(spacing: 10) {
                        content
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 28)
                }
            }
        }
        .alert(
            "Этот сервер не подойдёт",
            isPresented: Binding(get: { unsupported != nil },
                                 set: { if !$0 { unsupported = nil } })
        ) {
            Button("Понятно", role: .cancel) { unsupported = nil }
        } message: {
            Text("Транспорт «\(unsupported?.transport ?? "")» ядро Zyng не умеет. "
               + "Выбери сервер, у которого указан TCP, WS, gRPC или QUIC.")
        }
        .task {
            selectTabIfNeeded()
            await store.refreshStale()
            selectTabIfNeeded()
        }
    }

    /// При первом показе и после удаления подписки вкладка может исчезнуть.
    private func selectTabIfNeeded() {
        let available = tabs
        if tab == nil || !available.contains(where: { $0 == tab }) {
            tab = available.first
        }
    }

    private var tabs: [Tab] {
        store.subscriptions.map { .subscription($0.id) } + [.singles]
    }

    private var currentSubscription: Subscription? {
        guard case .subscription(let id) = tab else { return nil }
        return store.subscriptions.first { $0.id == id }
    }

    /// Серверы текущей вкладки — их и меряет кнопка замера.
    private var visibleServers: [Server] {
        let all = currentSubscription.map { store.servers(in: $0) } ?? store.singleServers
        // Неподдерживаемые мерить бессмысленно: подключиться к ним всё равно
        // не выйдет, а замеры отнимают время у остальных.
        return all.filter(\.isSupported)
    }

    // MARK: - Шапка

    private var header: some View {
        HStack(spacing: 10) {
            Text("Серверы")
                .foregroundColor(JT.text)
                .font(.system(size: 20, weight: .bold))

            Spacer()

            Button {
                jtHaptic()
                Task { await probe.measure(visibleServers) }
            } label: {
                Group {
                    if probe.isRunning {
                        ProgressView().tint(JT.accent)
                    } else {
                        Image(systemName: "speedometer")
                            .font(.system(size: 18, weight: .semibold))
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
        .padding(.bottom, 12)
    }

    // MARK: - Полоса вкладок

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(store.subscriptions) { sub in
                    tabChip(
                        title: sub.name,
                        count: sub.rawKeys.count,
                        tab: .subscription(sub.id)
                    )
                }

                tabChip(
                    title: "Ключи",
                    count: store.singleKeys.count,
                    tab: .singles
                )
            }
            .padding(.horizontal, 16)
        }
    }

    private func tabChip(title: String, count: Int, tab item: Tab) -> some View {
        let active = tab == item

        return Button {
            withAnimation(.easeOut(duration: 0.15)) { tab = item }
        } label: {
            HStack(spacing: 6) {
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .lineLimit(1)
                Text("\(count)")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(active ? .white.opacity(0.75) : JT.sub)
            }
            .foregroundColor(active ? .white : JT.sub)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(
                Capsule().fill(active ? JT.accent : JT.card)
                    .overlay(Capsule().stroke(active ? .clear : JT.stroke, lineWidth: 1))
            )
        }
    }

    // MARK: - Содержимое вкладки

    @ViewBuilder
    private var content: some View {
        if let sub = currentSubscription {
            subscriptionHeader(sub)

            let servers = store.servers(in: sub)
            if servers.isEmpty {
                emptyState(
                    icon: "arrow.triangle.2.circlepath",
                    title: "Подписка пустая",
                    hint: "Обнови её — возможно, панель ещё не отдала серверы"
                )
            } else {
                ForEach(servers) { server in
                    serverRow(server, showDelete: false)
                }
            }
        } else if store.subscriptions.isEmpty && store.singleServers.isEmpty {
            emptyState(
                icon: "server.rack",
                title: "Серверов пока нет",
                hint: "Добавь ссылку-подписку или отдельный ключ"
            )
        } else if store.singleServers.isEmpty {
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

    // MARK: - Карточка подписки

    private func subscriptionHeader(_ sub: Subscription) -> some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(sub.name)
                        .foregroundColor(JT.text)
                        .font(.system(size: 18, weight: .bold))
                        .lineLimit(1)

                    Text(subtitle(for: sub))
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
                                .font(.system(size: 16, weight: .semibold))
                        }
                    }
                    .foregroundColor(JT.accent)
                    .frame(width: 30, height: 30)
                }

                Menu {
                    if let page = sub.webPage, let url = URL(string: page) {
                        Link(destination: url) {
                            Label("Личный кабинет", systemImage: "safari")
                        }
                    }
                    Button(role: .destructive) {
                        store.removeSubscription(sub.id)
                        selectTabIfNeeded()
                    } label: {
                        Label("Удалить подписку", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(JT.sub)
                        .frame(width: 30, height: 30)
                }
            }

            trafficBar(sub)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(JT.card)
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(JT.stroke, lineWidth: 1))
        )
    }

    /// Полоса расхода трафика. Для безлимита полосы нет — только цифра.
    private func trafficBar(_ sub: Subscription) -> some View {
        VStack(spacing: 6) {
            HStack {
                Text(trafficText(sub))
                    .foregroundColor(JT.text)
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))

                Spacer()

                if let expires = sub.expiresAt {
                    Text(expiryText(expires))
                        .foregroundColor(expires < Date() ? JT.red : JT.sub)
                        .font(.system(size: 11, weight: .medium))
                }
            }

            if !sub.isUnlimited {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(JT.bg1)
                        Capsule()
                            .fill(sub.usedFraction > 0.9 ? JT.red : JT.accent)
                            .frame(width: max(4, geo.size.width * sub.usedFraction))
                    }
                }
                .frame(height: 6)
            }
        }
        .padding(.horizontal, 2)
    }

    private func trafficText(_ sub: Subscription) -> String {
        sub.isUnlimited
            ? "\(formatBytes(sub.usedTraffic)) / ∞"
            : "\(formatBytes(sub.usedTraffic)) / \(formatBytes(sub.totalTraffic))"
    }

    private func expiryText(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "dd.MM.yyyy"

        guard date > Date() else { return "истекла \(formatter.string(from: date))" }

        let days = Calendar.current.dateComponents([.day], from: Date(), to: date).day ?? 0
        return days <= 30
            ? "осталось \(days) дн."
            : "до \(formatter.string(from: date))"
    }

    private func subtitle(for sub: Subscription) -> String {
        var parts: [String] = []

        if let updated = sub.updatedAt {
            let formatter = DateFormatter()
            formatter.dateFormat = "dd.MM HH:mm"
            parts.append(formatter.string(from: updated))
        } else {
            parts.append("не обновлялась")
        }

        parts.append("автообновление — \(sub.autoUpdateHours) ч.")
        return parts.joined(separator: " • ")
    }

    // MARK: - Строка сервера

    private func serverRow(_ server: Server, showDelete: Bool) -> some View {
        let isSelected = server.raw == store.selectedRaw

        return HStack(spacing: 12) {
            Text(server.flag).font(.system(size: 22))

            VStack(alignment: .leading, spacing: 2) {
                Text(server.name)
                    .foregroundColor(server.isSupported ? JT.text : JT.sub)
                    .font(.system(size: 15, weight: .semibold))
                    .lineLimit(1)

                HStack(spacing: 5) {
                    Text("\(server.proto) · \(server.transport)")
                        .foregroundColor(JT.sub)
                        .font(.system(size: 11))

                    if !server.isSupported {
                        Text("не поддерживается")
                            .foregroundColor(JT.red)
                            .font(.system(size: 10, weight: .semibold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(JT.red.opacity(0.15)))
                    }
                }
            }

            Spacer(minLength: 8)

            if server.isSupported {
                latencyLabel(for: server)
            }

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
        .opacity(server.isSupported ? 1 : 0.55)
        .contentShape(Rectangle())
        .onTapGesture {
            // Неподдерживаемый транспорт выбрать можно, но соединения не будет.
            // Не блокируем — вдруг в подписке нет других, — но и не молчим.
            guard server.isSupported else {
                unsupported = server
                return
            }
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
        .padding(.vertical, 50)
    }
}
