import SwiftUI
import Combine
import NetworkExtension
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Кросс-платформенные помощники (iOS + macOS)

func jtClipboard() -> String? {
    #if canImport(UIKit)
    return UIPasteboard.general.string
    #elseif canImport(AppKit)
    return NSPasteboard.general.string(forType: .string)
    #else
    return nil
    #endif
}

func jtHaptic() {
    #if canImport(UIKit)
    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    #endif
}

func jtDeviceOS() -> String {
    #if canImport(UIKit)
    return UIDevice.current.systemVersion
    #else
    let v = ProcessInfo.processInfo.operatingSystemVersion
    return "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
    #endif
}

func jtDeviceModel() -> String {
    #if canImport(UIKit)
    return UIDevice.current.model
    #else
    return "Mac"
    #endif
}

func jtHWID() -> String {
    #if canImport(UIKit)
    return UIDevice.current.identifierForVendor?.uuidString ?? "zyng-ios"
    #else
    return "zyng-mac"
    #endif
}

extension View {
    @ViewBuilder func jtNoAutocap() -> some View {
        #if os(iOS)
        self.textInputAutocapitalization(.never)
        #else
        self
        #endif
    }
}

// MARK: - Модель

struct Server: Identifiable, Equatable {
    let id = UUID()
    let raw: String
    let name: String
    let proto: String
    /// Транспорт из ключа: TCP, WS, gRPC, XHTTP и так далее.
    let transport: String
    /// Умеет ли ядро такой транспорт. Неподдерживаемые показываем в списке
    /// помеченными, чтобы это не выяснялось после неудачного подключения.
    let isSupported: Bool
    /// Протокол работает поверх UDP (Hysteria2, TUIC). Проверить такой сервер
    /// TCP-соединением нельзя: порт закрыт для TCP, и замер выглядел бы как
    /// «сервер не отвечает», хотя он полностью рабочий.
    let usesDatagrams: Bool
    let flag: String
}

func flagFor(_ name: String) -> String {
    let n = name.lowercased()
    let map: [(String,String)] = [
        ("москва","🇷🇺"),("россия","🇷🇺"),("russia","🇷🇺"),("спб","🇷🇺"),("moscow","🇷🇺"),
        ("герман","🇩🇪"),("german","🇩🇪"),("франкфурт","🇩🇪"),("frankfurt","🇩🇪"),
        ("нидерл","🇳🇱"),("netherl","🇳🇱"),("amsterdam","🇳🇱"),("амстер","🇳🇱"),
        ("финлянд","🇫🇮"),("finland","🇫🇮"),("хельсин","🇫🇮"),
        ("польш","🇵🇱"),("poland","🇵🇱"),("варшав","🇵🇱"),
        ("швец","🇸🇪"),("sweden","🇸🇪"),("франц","🇫🇷"),("france","🇫🇷"),("париж","🇫🇷"),
        ("сша","🇺🇸"),("usa","🇺🇸"),("america","🇺🇸"),("united states","🇺🇸"),
        ("англ","🇬🇧"),("london","🇬🇧"),("britain","🇬🇧"),("uk","🇬🇧"),
        ("япон","🇯🇵"),("japan","🇯🇵"),("токио","🇯🇵"),
        ("сингап","🇸🇬"),("singapore","🇸🇬"),
        ("турц","🇹🇷"),("turkey","🇹🇷"),("стамбул","🇹🇷"),
        ("канад","🇨🇦"),("canada","🇨🇦"),("дубай","🇦🇪"),("uae","🇦🇪"),("emirat","🇦🇪"),
        ("латв","🇱🇻"),("latvia","🇱🇻"),("эстон","🇪🇪"),("estonia","🇪🇪"),
        ("испан","🇪🇸"),("spain","🇪🇸"),("итал","🇮🇹"),("italy","🇮🇹"),
        ("швейцар","🇨🇭"),("swiss","🇨🇭"),("гонконг","🇭🇰"),("hong","🇭🇰"),
        ("корея","🇰🇷"),("korea","🇰🇷"),("индия","🇮🇳"),("india","🇮🇳"),
        ("казах","🇰🇿"),("kazakh","🇰🇿"),("украин","🇺🇦"),("ukrain","🇺🇦")
    ]
    for (k,v) in map { if n.contains(k) { return v } }
    return "🌐"
}

func parseServer(_ raw: String) -> Server? {
    let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let r = s.range(of: "://") else { return nil }
    let scheme = String(s[s.startIndex..<r.lowerBound]).lowercased()
    // Ровно то, что умеет собрать SingBoxConfig. Лишние схемы здесь означали бы
    // ключ, который добавляется и красиво выглядит, а падает при подключении.
    let ok = ["vless","vmess","trojan","ss","shadowsocks","socks","socks5",
              "hysteria2","hy2","tuic"]
    guard ok.contains(scheme) else { return nil }
    var name = ""
    if let h = s.firstIndex(of: "#") {
        name = String(s[s.index(after: h)...]).removingPercentEncoding ?? ""
    }
    if name.isEmpty { name = scheme.uppercased() }
    let proto: String
    switch scheme {
    case "hy2":         proto = "HYSTERIA2"
    case "shadowsocks": proto = "SS"
    case "socks5":      proto = "SOCKS"
    default:            proto = scheme.uppercased()
    }

    let transport = transportOf(s, scheme: scheme)

    return Server(
        raw: s,
        name: name,
        proto: proto,
        transport: transport.uppercased(),
        isSupported: SingBoxConfig.supports(transport: transport),
        usesDatagrams: ["hysteria2", "hy2", "tuic"].contains(scheme),
        flag: flagFor(name)
    )
}

/// Транспорт указывают по-разному: в vmess он внутри base64-JSON, у остальных —
/// параметром `type` в ссылке.
private func transportOf(_ raw: String, scheme: String) -> String {
    if scheme == "vmess" {
        guard let data = Data(base64Encoded: padBase64(String(raw.dropFirst("vmess://".count)))),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return "tcp"
        }
        if let net = json["net"] as? String, !net.isEmpty { return net }
        return "tcp"
    }

    guard let components = URLComponents(string: raw) else { return "tcp" }
    let type = components.queryItems?.first { $0.name == "type" }?.value ?? ""
    return type.isEmpty ? "tcp" : type
}

func padBase64(_ s: String) -> String {
    var t = s.replacingOccurrences(of: "\n", with: "")
             .replacingOccurrences(of: "\r", with: "")
             .replacingOccurrences(of: "-", with: "+")
             .replacingOccurrences(of: "_", with: "/")
    while t.count % 4 != 0 { t += "=" }
    return t
}

// MARK: - Палитра

extension Color {
    init(hex: String) {
        let s = Scanner(string: hex); var v: UInt64 = 0; s.scanHexInt64(&v)
        self.init(red: Double((v>>16)&0xFF)/255,
                  green: Double((v>>8)&0xFF)/255,
                  blue: Double(v&0xFF)/255)
    }
}

/// Не private: палитрой пользуются и другие экраны.
enum JT {
    static let bg1     = Color(hex:"0E1014")
    static let bg2     = Color(hex:"171A20")
    static let card    = Color(hex:"1D2129")
    static let cardHi  = Color(hex:"272C36")
    static let stroke  = Color(hex:"2E343F")
    static let text    = Color.white
    static let sub     = Color(hex:"8A94A6")
    static let accent  = Color(hex:"5B8CFF")
    static let green   = Color(hex:"39D98A")
    static let red     = Color(hex:"FF5C5C")
}

// MARK: - Главный экран

@MainActor
struct ContentView: View {
    /// Подписки и одиночные ключи живут в общем хранилище — оно же отвечает
    /// за сохранение и за то, какой сервер выбран.
    @ObservedObject private var store = ServerStore.shared


    // Анимация кнопки подключения.
    @State private var outerAngle: Double = 0
    @State private var innerAngle: Double = 0
    @State private var glow: CGFloat = 1
    @State private var boltScale: CGFloat = 1
    @State private var pressed = false

    /// Задержка, уже показанная в плашке на экране блокировки.
    @State private var lastReportedLatency: Int?

    @State private var showAdd = false
    @State private var showList = false
    @State private var showSettings = false
    @State private var input = ""
    @State private var status = ""
    @State private var loading = false

    /// Контроллер — синглтон, мы его не создаём, поэтому ObservedObject, а не StateObject.
    @ObservedObject private var vpn = VPNController.shared
    @ObservedObject private var settings = AppSettings.shared
    @StateObject private var ping = PingMonitor()

    @Environment(\.scenePhase) private var scenePhase

    enum ConnState { case off, connecting, on }

    var servers: [Server] { store.allServers }
    var selected: Server? { store.selected }

    /// Состояние UI выводится напрямую из статуса системы. Отдельного флага больше
    /// нет — раньше он расходился с реальностью, если VPN отваливался сам.
    private var state: ConnState {
        switch vpn.status {
        case .connected:              return .on
        case .connecting, .reasserting, .disconnecting: return .connecting
        default:                      return .off
        }
    }

    var body: some View {
        ZStack {
            LinearGradient(colors:[JT.bg1, JT.bg2], startPoint:.top, endPoint:.bottom)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                header
                Spacer(minLength: 8)
                orb
                statusPill.padding(.top, 18)
                timerLabel.padding(.top, 6)
                pingLabel.padding(.top, 4)
                if let err = vpn.errorMessage {
                    // Сообщение от ядра бывает длинным, а скопировать его нужно
                    // целиком — иначе причину сбоя не разобрать.
                    Text(err)
                        .foregroundColor(JT.red)
                        .font(.system(size: 12, design: .monospaced))
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)
                        .padding(.horizontal, 20)
                        .multilineTextAlignment(.center)
                }
                Spacer(minLength: 8)
                locationCard.padding(.horizontal, 20)
                addButton.padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 8)
            }
        }
        .onAppear {
            // Приложение могли открыть при уже поднятом туннеле — тогда
            // onChange не сработает, и замер надо запустить самим.
            handle(vpn.status)
        }
        .onChange(of: ping.latency) { _, _ in
            #if canImport(ActivityKit)
            guard vpn.status == .connected, let started = vpn.connectedDate else { return }
            guard ping.latency != lastReportedLatency else { return }
            lastReportedLatency = ping.latency
            LiveActivityController.shared.update(
                serverName: selected?.name ?? "Zyng",
                flag: selected?.flag ?? "🌐",
                connectedAt: started,
                latency: ping.latency
            )
            #endif
        }
        .sheet(isPresented: $showAdd)  { addSheet }
        .sheet(isPresented: $showList) { serverListSheet }
        .sheet(isPresented: $showSettings) {
            SettingsView(settings: settings) { showSettings = false }
        }
        .onChange(of: vpn.status) { _, newStatus in
            handle(newStatus)
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            // Пока приложение было свёрнуто, уведомления о смене статуса не
            // приходили, а показанная задержка успела устареть.
            Task {
                await vpn.refresh()

                if vpn.status == .connected {
                    ping.refreshNow()
                    // Плашку могли не успеть создать — например, туннель
                    // подняли, пока приложение было свёрнуто.
                    startLiveActivity()
                } else {
                    #if canImport(ActivityKit)
                    // Убираем плашку, только УБЕДИВШИСЬ, что туннеля нет.
                    // Раньше проверка шла до опроса системы: при холодном
                    // старте статус ещё «неизвестен», и плашка от живого
                    // соединения тут же гасла.
                    LiveActivityController.shared.cleanupStale()
                    #endif
                }
            }
        }
    }

    private func handle(_ newStatus: NEVPNStatus) {
        switch newStatus {
        case .connected:
            ping.start()
            lastReportedLatency = nil
            startLiveActivity()
        case .connecting, .reasserting:
            // Анимация кольца сама ускоряется по состоянию — здесь делать нечего.
            break
        default:
            ping.stop()
            #if canImport(ActivityKit)
            LiveActivityController.shared.stop()
            #endif
        }
    }

    /// Плашка на экране блокировки. Время в ней система отсчитывает сама по
    /// дате подключения, поэтому обновлять её каждую секунду не нужно —
    /// и она не «замерзает», пока приложение спит.
    private func startLiveActivity() {
        #if canImport(ActivityKit)
        guard let started = vpn.connectedDate else { return }
        LiveActivityController.shared.start(
            serverName: selected?.name ?? "Zyng",
            flag: selected?.flag ?? "🌐",
            connectedAt: started,
            latency: ping.latency
        )
        #endif
    }

    private var header: some View {
        HStack {
            HStack(spacing: 9) {
                ZyngLogo(size: 34)
                Text("Zyng").font(.system(size: 19, weight: .heavy))
                    .foregroundColor(JT.text)
            }
            Spacer()

            HStack(spacing: 10) {
                Button {
                    haptic()
                    showSettings = true
                } label: {
                    Image(systemName: "gearshape.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(JT.sub)
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(JT.card)
                            .overlay(Circle().stroke(JT.stroke, lineWidth: 1)))
                }

                Button {
                    haptic()
                    showList = true
                } label: {
                    Image(systemName: "list.bullet")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(JT.sub)
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(JT.card)
                            .overlay(Circle().stroke(JT.stroke, lineWidth: 1)))
                }
            }
        }
        .padding(.horizontal, 20).padding(.top, 8)
    }

    private var orb: some View {
        let color: Color = state == .on ? JT.green : (state == .connecting ? JT.accent : JT.sub)

        return Button {
            tapConnect()
        } label: {
            ZStack {
                // Свечение: дышит при подключении и в процессе, спокойно в покое.
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [color.opacity(0.35), color.opacity(0.02)],
                            center: .center, startRadius: 30, endRadius: 140
                        )
                    )
                    .frame(width: 270, height: 270)
                    .blur(radius: 14)
                    .scaleEffect(glow)
                    .opacity(state == .off ? 0.5 : 1)

                // Внешнее кольцо: разомкнутая дуга, вращается по часовой.
                Circle()
                    .trim(from: 0, to: 0.72)
                    .stroke(
                        AngularGradient(
                            colors: [color.opacity(0), color.opacity(0.55), color.opacity(0)],
                            center: .center
                        ),
                        style: StrokeStyle(lineWidth: 2, lineCap: .round)
                    )
                    .frame(width: 236, height: 236)
                    .rotationEffect(.degrees(outerAngle))

                // Внутреннее кольцо крутится в обратную сторону — так движение
                // читается, даже когда скорость небольшая.
                Circle()
                    .trim(from: 0, to: 0.45)
                    .stroke(
                        AngularGradient(
                            colors: [color.opacity(0), color.opacity(0.7), color.opacity(0)],
                            center: .center
                        ),
                        style: StrokeStyle(lineWidth: 2, lineCap: .round)
                    )
                    .frame(width: 196, height: 196)
                    .rotationEffect(.degrees(innerAngle))

                // Ободок вокруг кнопки — ровный, чтобы форма читалась.
                Circle()
                    .stroke(color.opacity(0.18), lineWidth: 1)
                    .frame(width: 216, height: 216)

                // Сама кнопка.
                Circle()
                    .fill(
                        LinearGradient(colors: [JT.cardHi, JT.card],
                                       startPoint: .topLeading, endPoint: .bottomTrailing)
                    )
                    .frame(width: 168, height: 168)
                    .overlay(Circle().stroke(color.opacity(0.55), lineWidth: 2))
                    .shadow(color: color.opacity(0.4), radius: 26)
                    .scaleEffect(pressed ? 0.94 : 1)

                VStack(spacing: 8) {
                    Image(systemName: state == .on ? "bolt.fill" : "power")
                        .font(.system(size: 40, weight: .bold))
                        .foregroundColor(color)
                        .scaleEffect(state == .on ? boltScale : 1)

                    Text(state == .on ? "ВКЛ" : (state == .connecting ? "…" : "ВЫКЛ"))
                        .font(.system(size: 13, weight: .bold)).tracking(2)
                        .foregroundColor(JT.sub)
                }
                .scaleEffect(pressed ? 0.94 : 1)
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: pressed)
            .animation(.easeInOut(duration: 0.4), value: state)
        }
        .buttonStyle(.plain)
        // Нажатие отслеживаем сами: у кнопки со своим оформлением нет
        // встроенной подсветки, а отклик на палец нужен.
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in pressed = true }
                .onEnded { _ in pressed = false }
        )
        .onAppear { startOrbAnimation() }
        .onChange(of: state) { _, _ in startOrbAnimation() }
    }

    /// Кольца крутятся всегда, но с разной скоростью: быстро при подключении,
    /// спокойно в остальное время. Свечение и молния дышат только когда
    /// соединение активно.
    private func startOrbAnimation() {
        let outerDuration: Double
        let innerDuration: Double

        switch state {
        case .connecting: outerDuration = 1.6; innerDuration = 2.4
        case .on:         outerDuration = 9;   innerDuration = 13
        case .off:        outerDuration = 26;  innerDuration = 34
        }

        withAnimation(.linear(duration: outerDuration).repeatForever(autoreverses: false)) {
            outerAngle = 360
        }
        withAnimation(.linear(duration: innerDuration).repeatForever(autoreverses: false)) {
            innerAngle = -360
        }

        if state == .off {
            withAnimation(.easeInOut(duration: 0.4)) {
                glow = 1
                boltScale = 1
            }
        } else {
            withAnimation(.easeInOut(duration: state == .on ? 2.4 : 1).repeatForever()) {
                glow = state == .on ? 1.08 : 1.14
            }
            if state == .on {
                withAnimation(.easeInOut(duration: 1.8).repeatForever()) {
                    boltScale = 1.1
                }
            }
        }
    }

    private var statusPill: some View {
        let t: String; let c: Color
        switch state {
        case .off:        t = "Отключено";     c = JT.sub
        case .connecting: t = "Подключение…";  c = JT.accent
        case .on:         t = "Защищено";      c = JT.green
        }
        return HStack(spacing: 8) {
            Circle().fill(c).frame(width: 8, height: 8)
            Text(t).font(.system(size: 14, weight: .semibold)).foregroundColor(c)
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
        .background(Capsule().fill(JT.card).overlay(Capsule().stroke(JT.stroke, lineWidth: 1)))
    }

    /// Время считается прямо при отрисовке из момента подключения, который
    /// хранит система. Ни накопителя, ни таймера в состоянии экрана нет —
    /// нечему отставать после сворачивания и нечему сбрасываться в ноль.
    private var timerLabel: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let seconds: Int = {
                guard state == .on, let started = vpn.connectedDate else { return 0 }
                return max(0, Int(context.date.timeIntervalSince(started)))
            }()

            Text(timeString(seconds))
                .font(.system(size: 15, weight: .medium, design: .monospaced))
                .foregroundColor(state == .on ? JT.text : JT.sub.opacity(0.5))
                .monospacedDigit()
        }
    }

    /// Задержка показывается только при активном подключении: без туннеля
    /// это была бы скорость обычной сети, а не VPN.
    @ViewBuilder
    private var pingLabel: some View {
        if state == .on {
            HStack(spacing: 6) {
                Image(systemName: "speedometer")
                    .font(.system(size: 11, weight: .semibold))

                if let ms = ping.latency {
                    Text("\(ms) мс")
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                } else if ping.failed {
                    Text("нет ответа")
                        .font(.system(size: 12, weight: .medium))
                } else {
                    Text("измеряю…")
                        .font(.system(size: 12, weight: .medium))
                }
            }
            .foregroundColor(pingColor)
            .padding(.horizontal, 11)
            .padding(.vertical, 5)
            .background(
                Capsule().fill(pingColor.opacity(0.12))
                    .overlay(Capsule().stroke(pingColor.opacity(0.25), lineWidth: 1))
            )
            .transition(.opacity.combined(with: .scale(scale: 0.9)))
            .animation(.easeOut(duration: 0.2), value: ping.latency)
        }
    }

    /// Зелёный до 100 мс, жёлтый до 250, дальше красный.
    private var pingColor: Color {
        guard let ms = ping.latency else { return JT.sub }
        switch ms {
        case ..<100:  return JT.green
        case ..<250:  return JT.accent
        default:      return JT.red
        }
    }

    private var locationCard: some View {
        Button { showList = true } label: {
            HStack(spacing: 14) {
                Text(selected?.flag ?? "🌐").font(.system(size: 30))
                VStack(alignment: .leading, spacing: 3) {
                    Text(selected?.name ?? "Сервер не выбран")
                        .foregroundColor(JT.text)
                        .font(.system(size: 16, weight: .semibold)).lineLimit(1)
                    HStack(spacing: 6) {
                        Text(selected.map { "\($0.proto) · \($0.transport)" }
                             ?? "Добавь ключ или подписку")
                            .foregroundColor(JT.sub).font(.system(size: 12))

                        if let selected, !selected.isSupported {
                            Text("не поддерживается")
                                .foregroundColor(JT.red)
                                .font(.system(size: 11, weight: .semibold))
                        }
                    }
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundColor(JT.sub)
            }
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 18).fill(JT.card)
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(JT.stroke, lineWidth: 1)))
        }
        .buttonStyle(.plain)
    }

    private var addButton: some View {
        Button { status = ""; showAdd = true } label: {
            HStack(spacing: 8) {
                Image(systemName: "plus")
                Text("Добавить ключ / подписку")
            }
            .font(.system(size: 15, weight: .bold)).foregroundColor(.white)
            .frame(maxWidth: .infinity).padding(.vertical, 15)
            .background(RoundedRectangle(cornerRadius: 16)
                .fill(LinearGradient(colors:[JT.accent, Color(hex:"7A5CFF")],
                                     startPoint:.leading, endPoint:.trailing)))
        }
    }

    private var serverListSheet: some View {
        ServerListView(
            store: store,
            onPicked: { showList = false },
            onAdd: { showList = false; showAdd = true }
        )
    }

    private var addSheet: some View {
        ZStack {
            JT.bg1.ignoresSafeArea()
            VStack(spacing: 16) {
                Capsule().fill(JT.stroke).frame(width: 40, height: 5).padding(.top, 10)
                Text("Добавить ключ / подписку").foregroundColor(JT.text)
                    .font(.system(size: 18, weight: .bold)).padding(.top, 6)

                Text("Вставь ключ vless:// vmess:// trojan:// ss://\nили ссылку-подписку https://…")
                    .foregroundColor(JT.sub).font(.system(size: 13))
                    .multilineTextAlignment(.center)

                TextField("", text: $input, axis: .vertical)
                    .placeholder(when: input.isEmpty) {
                        Text("vless://…  или  https://подписка")
                            .foregroundColor(JT.sub.opacity(0.6))
                    }
                    .foregroundColor(JT.text).tint(JT.accent)
                    .font(.system(size: 14))
                    .padding(14).frame(minHeight: 110, alignment: .topLeading)
                    .background(RoundedRectangle(cornerRadius: 14).fill(JT.card)
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(JT.stroke, lineWidth: 1)))
                    .autocorrectionDisabled(true)
                    .jtNoAutocap()
                    .padding(.horizontal, 20)

                Button { input = jtClipboard() ?? input } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "doc.on.clipboard")
                        Text("Вставить из буфера")
                    }.font(.system(size: 13, weight: .semibold)).foregroundColor(JT.accent)
                }

                if !status.isEmpty {
                    Text(status)
                        .foregroundColor(status.contains("Добавлено") ? JT.green : JT.sub)
                        .font(.system(size: 13, weight: .medium))
                        .multilineTextAlignment(.center).padding(.horizontal, 20)
                }

                Button(action: addKey) {
                    HStack(spacing: 8) {
                        if loading { ProgressView().tint(.white) }
                        Text(loading ? "Загружаю…" : "Добавить")
                    }
                    .font(.system(size: 15, weight: .bold)).foregroundColor(.white)
                    .frame(maxWidth: .infinity).padding(.vertical, 15)
                    .background(RoundedRectangle(cornerRadius: 14)
                        .fill(LinearGradient(colors:[JT.accent, Color(hex:"7A5CFF")],
                                             startPoint:.leading, endPoint:.trailing)))
                }.padding(.horizontal, 20).disabled(loading)

                Button("Закрыть") { showAdd = false }.foregroundColor(JT.sub)
                Spacer()
            }
        }
    }

    /// Вибрация только если она включена в настройках.
    private func haptic() {
        if settings.haptics { jtHaptic() }
    }

    private func tapConnect() {
        guard let selected else { showAdd = true; return }
        haptic()

        switch state {
        case .off:
            Task { await vpn.connect(key: selected.raw) }
        case .connecting:
            break
        case .on:
            vpn.disconnect()
        }
    }

    private func timeString(_ s: Int) -> String {
        String(format: "%02d:%02d:%02d", s/3600, (s%3600)/60, s%60)
    }

    func addKey() {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { status = "Пусто"; return }

        // Ссылка — это подписка, она будет обновляться сама.
        if text.lowercased().hasPrefix("http") {
            loading = true
            status = "Загружаю подписку…"
            Task {
                await store.addSubscription(url: text)
                loading = false
                if let error = store.lastError {
                    status = error
                } else {
                    status = "Подписка добавлена"
                    input = ""
                    showAdd = false
                }
            }
            return
        }

        let added = store.addSingleKeys(from: text)
        status = added > 0
            ? "Добавлено ключей: \(added)"
            : "Не похоже на ключ (нужен vless:// и т.п.)"
        if added > 0 {
            input = ""
            showAdd = false
        }
    }

}

// MARK: - Placeholder helper

extension View {
    func placeholder<Content: View>(when show: Bool,
                                    alignment: Alignment = .topLeading,
                                    @ViewBuilder placeholder: () -> Content) -> some View {
        ZStack(alignment: alignment) {
            placeholder().opacity(show ? 1 : 0).padding(.leading, 4).padding(.top, 2)
            self
        }
    }
}

#Preview { ContentView() }
