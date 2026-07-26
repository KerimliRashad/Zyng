import NetworkExtension
import Foundation

final class VPNController: NSObject, ObservableObject {
    static let shared = VPNController()

    @Published var isConnected = false
    @Published var errorMessage: String?

    private var manager: NETunnelProviderManager?
    private let providerBundleIdentifier = "online.zyng.Zyng.ZyngTunnel"

    override init() {
        super.init()
        setupStatusObserver()
        loadExistingConfiguration()
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
        DispatchQueue.main.async { [weak self] in
            self?.isConnected = (self?.manager?.connection.status == .connected) ?? false
            self?.errorMessage = nil
        }
    }

    private func loadExistingConfiguration() {
        NETunnelProviderManager.loadAllFromPreferences { [weak self] managers, error in
            if let error = error {
                NSLog("⚠️ Zyng: Failed to load existing configs: \(error)")
                return
            }
            self?.manager = managers?.first
        }
    }

    func connect(key: String, completion: @escaping (Error?) -> Void) {
        guard !key.isEmpty else {
            let error = NSError(domain: "ZyngVPN", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "VPN key is empty"])
            DispatchQueue.main.async { [weak self] in
                self?.errorMessage = "Invalid VPN key"
                completion(error)
            }
            return
        }

        // Load existing managers to clean up old configs
        NETunnelProviderManager.loadAllFromPreferences { [weak self] managers, error in
            guard let self = self else { return }

            if let error = error {
                NSLog("❌ Zyng: Failed to load preferences: \(error)")
                DispatchQueue.main.async { [weak self] in
                    self?.errorMessage = error.localizedDescription
                    completion(error)
                }
                return
            }

            // Remove old configurations
            for mgr in managers ?? [] {
                mgr.removeFromPreferences()
            }

            // Create new manager
            let m = NETunnelProviderManager()
            let proto = NETunnelProviderProtocol()

            // Configure protocol
            proto.providerBundleIdentifier = self.providerBundleIdentifier
            proto.serverAddress = "Zyng VPN"
            proto.providerConfiguration = ["key": key]
            proto.disconnectOnSleep = false

            m.protocolConfiguration = proto
            m.localizedDescription = "Zyng VPN"
            m.isEnabled = true
            m.isOnDemandEnabled = false

            // Save to preferences
            m.saveToPreferences { [weak self, weak m] saveError in
                guard let self = self, let m = m else { return }

                if let error = saveError {
                    NSLog("❌ Zyng: Failed to save preferences: \(error)")
                    DispatchQueue.main.async { [weak self] in
                        self?.errorMessage = error.localizedDescription
                        completion(error)
                    }
                    return
                }

                NSLog("✅ Zyng: Configuration saved")

                // Load from preferences (required before starting)
                m.loadFromPreferences { [weak self, weak m] loadError in
                    guard let self = self, let m = m else { return }

                    if let error = loadError {
                        NSLog("❌ Zyng: Failed to load preferences: \(error)")
                        DispatchQueue.main.async { [weak self] in
                            self?.errorMessage = error.localizedDescription
                            completion(error)
                        }
                        return
                    }

                    NSLog("✅ Zyng: Configuration loaded")
                    self.manager = m

                    // Start VPN tunnel
                    do {
                        try m.connection.startVPNTunnel()
                        NSLog("✅ Zyng: startVPNTunnel succeeded")
                        DispatchQueue.main.async { [weak self] in
                            self?.isConnected = true
                            completion(nil)
                        }
                    } catch {
                        NSLog("❌ Zyng: startVPNTunnel failed: \(error)")
                        DispatchQueue.main.async { [weak self] in
                            self?.errorMessage = error.localizedDescription
                            completion(error)
                        }
                    }
                }
            }
        }
    }

    func disconnect() {
        guard let manager = manager else { return }
        manager.connection.stopVPNTunnel()
        NSLog("🛑 Zyng: Disconnect called")
    }
}
