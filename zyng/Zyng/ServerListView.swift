import SwiftUI

/// Экран выбора сервера.
///
/// Каждая подписка — своя вкладка со своим именем, трафиком и списком серверов.
/// Последняя вкладка — ключи, добавленные вручную.
@MainActor
struct ServerListView: View {

    @ObservedObject var store: ServerStore
    @StateObject private var probe = LatencyProbe()
    /// Нужен ради темы и языка: без подписки на настройки экран не
    /// перерисовывался бы при их смене и оставался в прежнем оформлении.
    @ObservedObject private var settings = AppSettings.shared

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
            JT.backdrop.ignoresSafeArea()

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
            tr("Этот сервер не подойдёт", "This server won't work"),
            isPresented: Binding(get: { unsupported != nil },
                                 set: { if !$0 { unsupported = nil } })
        ) {
            Button(tr("Понятно", "OK"), role: .cancel) { unsupported = nil }
        } message: {
            let t = unsupported?.transport ?? ""
            Text(tr("Транспорт «\(t)» ядро Zyng не умеет. Выбери сервер с пометкой "
                  + "TCP, WS, GRPC, HTTP, HTTPUPGRADE или QUIC.",
                    "Zyng's core does not support the «\(t)» transport. Pick a server "
                  + "marked TCP, WS, GRPC, HTTP, HTTPUPGRADE or QUIC."))
        }
        .task {
            selectTabIfNeeded()
            await store.refreshStale()
            selectTabIfNeeded()
            // Замер сам, без нажатия на секундомер: список без задержек
            // бесполезен, а вручную его запускал не каждый.
            await probe.measure(visibleServers)
        }
        .onChange(of: tab) { _, _ in
            // У соседней вкладки своя подписка и свои серверы — их ещё не мерили.
            Task { await probe.measure(visibleServers) }
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
        // Мерим только то, что имеет смысл мерить: неподдерживаемые всё равно
        // не подключатся, а протоколы поверх UDP не отвечают на TCP-проверку.
        return all.filter { $0.isSupported && !$0.usesDatagrams }
    }

    // MARK: - Шапка

    private var header: some View {
        HStack(spacing: 10) {
            Text(tr("Серверы", "Servers"))
                .foregroundColor(JT.text)
                .font(.system(size: 20, weight: .bold))

            Spacer()

            Button {
                jtHaptic()
                // Нажали сами — значит, хотят пересчитать всё, включая те
                // серверы, что в прошлый раз не ответили.
                Task { await probe.measure(visibleServers, force: true) }
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
                    title: tr("Ключи", "Keys"),
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
                    title: tr("Подписка пустая", "Subscription is empty"),
                    hint: tr("Обнови её — возможно, панель ещё не отдала серверы",
                             "Refresh it — the provider may not have sent servers yet")
                )
            } else {
                ForEach(servers) { server in
                    serverRow(server, showDelete: false)
                }
            }
        } else if store.subscriptions.isEmpty && store.singleServers.isEmpty {
            emptyState(
                icon: "server.rack",
                title: tr("Серверов пока нет", "No servers yet"),
                hint: tr("Добавь ссылку-подписку или отдельный ключ",
                         "Add a subscription link or a single key")
            )
        } else if store.singleServers.isEmpty {
            emptyState(
                icon: "key",
                title: tr("Отдельных ключей нет", "No single keys"),
                hint: tr("Вставь ключ vless:// или другой", "Paste a vless:// key or another")
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
                            Label(tr("Личный кабинет", "Provider page"), systemImage: "safari")
                        }
                    }
                    Button(role: .destructive) {
                        store.removeSubscription(sub.id)
                        selectTabIfNeeded()
                    } label: {
                        Label(tr("Удалить подписку", "Remove subscription"), systemImage: "trash")
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

        let stamp = formatter.string(from: date)
        guard date > Date() else { return tr("истекла \(stamp)", "expired \(stamp)") }

        let days = Calendar.current.dateComponents([.day], from: Date(), to: date).day ?? 0
        return days <= 30
            ? tr("осталось \(days) дн.", "\(days) days left")
            : tr("до \(stamp)", "until \(stamp)")
    }

    private func subtitle(for sub: Subscription) -> String {
        var parts: [String] = []

        if let updated = sub.updatedAt {
            let formatter = DateFormatter()
            formatter.dateFormat = "dd.MM HH:mm"
            parts.append(formatter.string(from: updated))
        } else {
            parts.append(tr("не обновлялась", "never refreshed"))
        }

        parts.append(tr("автообновление — \(sub.autoUpdateHours) ч.",
                        "auto-refresh every \(sub.autoUpdateHours) h"))
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
                        Text(tr("не поддерживается", "unsupported"))
                            .foregroundColor(JT.red)
                            .font(.system(size: 10, weight: .semibold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(JT.red.opacity(0.15)))
                    }
                }
            }

            Spacer(minLength: 8)

            if server.isSupported && !server.usesDatagrams {
                latencyLabel(for: server)
            } else if server.usesDatagrams {
                // Замерить нельзя, но сервер рабочий — так и пишем, вместо
                // прочерка, который читается как «не отвечает».
                badge(text: "UDP", color: JT.sub)
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

    /// Четыре состояния: ещё меряем, не мерили, не ответил, ответил за N мс.
    ///
    /// Раньше на время замера строка была пустой, и казалось, что часть серверов
    /// проверку просто пропустили. Теперь у каждой видно, что происходит.
    @ViewBuilder
    private func latencyLabel(for server: Server) -> some View {
        if let measured = probe.latency(for: server) {
            if let ms = measured {
                badge(text: "\(ms) \(tr("мс", "ms"))",
                      color: color(forLatency: ms),
                      monospaced: true)
            } else {
                badge(text: tr("нет ответа", "no response"), color: JT.red)
            }
        } else if probe.isRunning {
            ProgressView()
                .controlSize(.mini)
                .tint(JT.sub)
        }
    }

    /// Значок справа в строке — одинаковый для задержки, UDP и отказа.
    private func badge(text: String, color: Color, monospaced: Bool = false) -> some View {
        Text(text)
            .font(.system(size: 11,
                          weight: .semibold,
                          design: monospaced ? .monospaced : .default))
            .foregroundColor(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(color.opacity(0.14))
                    .overlay(Capsule().stroke(color.opacity(0.22), lineWidth: 1))
            )
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
            Button(tr("Добавить", "Add")) { onAdd() }
                .foregroundColor(JT.accent)
                .font(.system(size: 15, weight: .semibold))
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 50)
    }
}
