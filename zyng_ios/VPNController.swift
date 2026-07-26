@preconcurrency import NetworkExtension
import Foundation
import Combine

final class VPNController: NSObject, ObservableObject {
    static let shared = VPNController()

    @Published var isConnected = false
    @Published var errorMessage: String?

    private var manager: NETunnelProviderManager?
    private let providerBundleIdentifier = "online.zyng.Zyng.ZyngTunnel"

    override init() {
        super.init()
        setupStatusObserver()
        loadExistingManager()
    }

    private func setupStatusObserver() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(vpnStatusDidChange),
            name: .NEVPNStatusDidChange,
            object: nil
        )
    }

    private func loadExistingManager() {
        NETunnelProviderManager.loadAllFromPreferences { [weak self] managers, error in
            self?.manager = managers?.first
        }
    }

    @objc private func vpnStatusDidChange() {
        DispatchQueue.main.async { [weak self] in
            self?.updateConnectionStatus()
        }
    }

    private func updateConnectionStatus() {
        isConnected = manager?.connection.status == .connected
        NSLog("🔵 VPN Status: \(manager?.connection.status.rawValue ?? -1)")
    }

    func connect(key: String, completion: @escaping (Error?) -> Void) {
        nonisolated(unsafe) let handler = completion

        guard !key.isEmpty else {
            let error = NSError(domain: "ZyngVPN", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "VPN key is empty"])
            DispatchQueue.main.async { [weak self] in
                self?.errorMessage = "Invalid VPN key"
            }
            handler(error)
            return
        }

        NETunnelProviderManager.loadAllFromPreferences { [weak self] managers, _ in
            guard let self = self else {
                handler(NSError(domain: "ZyngVPN", code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "Deallocated"]))
                return
            }

            for mgr in managers ?? [] {
                mgr.removeFromPreferences()
            }

            let m = NETunnelProviderManager()
            let proto = NETunnelProviderProtocol()

            proto.providerBundleIdentifier = self.providerBundleIdentifier
            proto.serverAddress = "Zyng"
            proto.providerConfiguration = ["key": key]

            m.protocolConfiguration = proto
            m.localizedDescription = "Zyng VPN"
            m.isEnabled = true
            m.isOnDemandEnabled = false

            m.saveToPreferences { [weak self] saveError in
                guard let self = self else {
                    handler(NSError(domain: "ZyngVPN", code: -1,
                        userInfo: [NSLocalizedDescriptionKey: "Deallocated"]))
                    return
                }

                if let error = saveError {
                    NSLog("❌ Save error: \(error)")
                    DispatchQueue.main.async { [weak self] in
                        self?.errorMessage = error.localizedDescription
                    }
                    handler(error)
                    return
                }

                m.loadFromPreferences { [weak self] loadError in
                    guard let self = self else {
                        handler(NSError(domain: "ZyngVPN", code: -1,
                            userInfo: [NSLocalizedDescriptionKey: "Deallocated"]))
                        return
                    }

                    if let error = loadError {
                        NSLog("❌ Load error: \(error)")
                        DispatchQueue.main.async { [weak self] in
                            self?.errorMessage = error.localizedDescription
                        }
                        handler(error)
                        return
                    }

                    self.manager = m
                    do {
                        NSLog("🟡 Attempting to start VPN tunnel...")
                        try m.connection.startVPNTunnel()
                        NSLog("✅ VPN tunnel started")
                        DispatchQueue.main.async { [weak self] in
                            self?.updateConnectionStatus()
                        }
                        handler(nil)
                    } catch {
                        NSLog("❌ Start tunnel error: \(error)")
                        DispatchQueue.main.async { [weak self] in
                            self?.errorMessage = error.localizedDescription
                        }
                        handler(error)
                    }
                }
            }
        }
    }

    func disconnect() {
        NSLog("🛑 Disconnecting VPN")
        DispatchQueue.main.async { [weak self] in
            self?.manager?.connection.stopVPNTunnel()
            self?.isConnected = false
        }
    }
}
