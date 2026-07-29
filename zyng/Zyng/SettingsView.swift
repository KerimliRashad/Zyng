import SwiftUI

@MainActor
struct SettingsView: View {

    @ObservedObject var settings: AppSettings
    @ObservedObject private var vpn = VPNController.shared

    let onClose: () -> Void

    /// DNS нельзя менять на лету: конфигурация уходит в ядро при запуске
    /// туннеля, поэтому изменение вступит в силу после переподключения.
    private var needsReconnect: Bool {
        vpn.status == .connected && dnsChanged
    }

    @State private var dnsChanged = false

    var body: some View {
        ZStack {
            LinearGradient(colors: [JT.bg1, JT.bg2], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                header

                ScrollView {
                    VStack(spacing: 22) {
                        dnsSection
                        behaviourSection
                        aboutSection
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 32)
                }
            }
        }
    }

    // MARK: - Шапка

    private var header: some View {
        HStack {
            Text("Настройки")
                .foregroundColor(JT.text)
                .font(.system(size: 22, weight: .bold))

            Spacer()

            Button { onClose() } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundColor(JT.sub)
                    .font(.system(size: 26))
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .padding(.bottom, 18)
    }

    // MARK: - DNS

    private var dnsSection: some View {
        section(title: "DNS-сервер", hint: "Через него идут запросы внутри туннеля") {
            VStack(spacing: 8) {
                ForEach(AppSettings.DNSProvider.allCases) { provider in
                    dnsRow(provider)
                }

                if needsReconnect {
                    HStack(spacing: 8) {
                        Image(systemName: "info.circle.fill")
                        Text("Переподключись, чтобы применить")
                    }
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(JT.accent)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 4)
                }
            }
        }
    }

    private func dnsRow(_ provider: AppSettings.DNSProvider) -> some View {
        let active = settings.dns == provider

        return Button {
            if settings.haptics { jtHaptic() }
            if settings.dns != provider {
                settings.dns = provider
                dnsChanged = true
            }
        } label: {
            HStack(spacing: 13) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(active ? JT.accent : JT.cardHi)
                        .frame(width: 34, height: 34)
                    Image(systemName: provider.icon)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(active ? .white : JT.sub)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(provider.title)
                        .foregroundColor(JT.text)
                        .font(.system(size: 15, weight: .semibold))
                    Text(provider.subtitle)
                        .foregroundColor(JT.sub)
                        .font(.system(size: 11))
                }

                Spacer()

                if active {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(JT.green)
                        .font(.system(size: 19))
                }
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(active ? JT.cardHi : JT.bg2)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(active ? JT.green.opacity(0.35) : JT.stroke, lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Поведение

    private var behaviourSection: some View {
        section(title: "Поведение", hint: nil) {
            VStack(spacing: 8) {
                toggleRow(
                    icon: "arrow.clockwise.circle.fill",
                    title: "Держать соединение",
                    subtitle: "Система сама поднимет туннель, если он оборвался или сменилась сеть. Применяется при следующем подключении",
                    isOn: $settings.autoConnect
                )

                toggleRow(
                    icon: "bolt.shield.fill",
                    title: "Live Activity",
                    subtitle: "Статус соединения на экране блокировки и в Dynamic Island. Появляется при запуске туннеля из приложения",
                    isOn: $settings.liveActivity
                )

                toggleRow(
                    icon: "iphone.radiowaves.left.and.right",
                    title: "Вибрация",
                    subtitle: "Отклик при нажатии кнопок",
                    isOn: $settings.haptics
                )
            }
        }
    }

    private func toggleRow(icon: String,
                           title: String,
                           subtitle: String,
                           isOn: Binding<Bool>) -> some View {
        HStack(spacing: 13) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(isOn.wrappedValue ? JT.accent : JT.cardHi)
                    .frame(width: 34, height: 34)
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(isOn.wrappedValue ? .white : JT.sub)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .foregroundColor(JT.text)
                    .font(.system(size: 15, weight: .semibold))
                    .fixedSize(horizontal: false, vertical: true)
                Text(subtitle)
                    .foregroundColor(JT.sub)
                    .font(.system(size: 11))
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 8)

            Toggle("", isOn: isOn)
                .labelsHidden()
                .tint(JT.accent)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(JT.bg2)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(JT.stroke, lineWidth: 1))
        )
    }

    // MARK: - О приложении

    private var aboutSection: some View {
        section(title: "О приложении", hint: nil) {
            VStack(spacing: 8) {
                infoRow(title: "Версия", value: settings.appVersion)

                linkRow(
                    icon: "hand.raised.fill",
                    title: "Политика конфиденциальности",
                    subtitle: "Что приложение делает с данными",
                    url: "https://zyng.online/privacy.html"
                )

                linkRow(
                    icon: "paperplane.fill",
                    title: "Канал в Telegram",
                    subtitle: "Новости, ключи и помощь",
                    url: "https://t.me/jeffvpn"
                )
            }
        }
    }

    private func infoRow(title: String, value: String) -> some View {
        HStack {
            Text(title)
                .foregroundColor(JT.text)
                .font(.system(size: 15, weight: .medium))
            Spacer()
            Text(value)
                .foregroundColor(JT.sub)
                .font(.system(size: 13, design: .monospaced))
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(JT.bg2)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(JT.stroke, lineWidth: 1))
        )
    }

    private func linkRow(icon: String,
                         title: String,
                         subtitle: String,
                         url: String) -> some View {
        Link(destination: URL(string: url)!) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .foregroundColor(JT.accent)
                    .font(.system(size: 15, weight: .semibold))
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .foregroundColor(JT.text)
                        .font(.system(size: 15, weight: .medium))
                    Text(subtitle)
                        .foregroundColor(JT.sub)
                        .font(.system(size: 11))
                }
                Spacer()
                Image(systemName: "arrow.up.right")
                    .foregroundColor(JT.sub)
                    .font(.system(size: 12, weight: .semibold))
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(JT.bg2)
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(JT.stroke, lineWidth: 1))
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Общая обёртка секции

    private func section<Content: View>(title: String,
                                        hint: String?,
                                        @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title.uppercased())
                    .foregroundColor(JT.sub)
                    .font(.system(size: 11, weight: .bold))
                    .kerning(0.8)

                if let hint {
                    Text(hint)
                        .foregroundColor(JT.sub.opacity(0.7))
                        .font(.system(size: 11))
                }
            }
            .padding(.leading, 4)

            content()
        }
    }
}
