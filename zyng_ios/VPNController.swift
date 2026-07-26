import NetworkExtension
import Foundation

final class VPNController: NSObject, ObservableObject {
    static let shared = VPNController()

    @Published var isConnected = false
    @Published var errorMessage: String?

    private var manager: NETunnelProviderManager?

    override init() {
        super.init()
        setupStatusObserver()
    }

    private func setupStatusObserver() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(vpnStatusDidChange),
            name: .NEVPNStatusDidChange,
            object: nil
        )
    }

    @objc private func vpnStatusDidChange() {
        DispatchQueue.main.async {
            self.isConnected = self.manager?.connection.status == .connected
        }
    }

    func connect(key: String, completion: @escaping (Error?) -> Void) {
        NETunnelProviderManager.loadAllFromPreferences { [weak self] managers, error in
            if let error = error {
                DispatchQueue.main.async { completion(error) }
                return
            }

            let m = managers?.first ?? NETunnelProviderManager()
            let proto = NETunnelProviderProtocol()

            // Bundle ID must match your ZyngTunnel extension target
            proto.providerBundleIdentifier = "online.zyng.Zyng.ZyngTunnel"
            proto.serverAddress = "Zyng VPN"

            // Pass the key to tunnel provider
            proto.providerConfiguration = ["key": key]

            m.protocolConfiguration = proto
            m.localizedDescription = "Zyng VPN"
            m.isEnabled = true
            m.isOnDemandEnabled = false

            m.saveToPreferences { [weak self] saveError in
                if let error = saveError {
                    DispatchQueue.main.async { completion(error) }
                    return
                }

                m.loadFromPreferences { [weak self] loadError in
                    if let error = loadError {
                        DispatchQueue.main.async { completion(error) }
                        return
                    }

                    self?.manager = m
                    do {
                        try m.connection.startVPNTunnel()
                        DispatchQueue.main.async {
                            self?.isConnected = true
                            completion(nil)
                        }
                    } catch {
                        DispatchQueue.main.async { completion(error) }
                    }
                }
            }
        }
    }

    func disconnect() {
        manager?.connection.stopVPNTunnel()
        DispatchQueue.main.async { self.isConnected = false }
    }
}
