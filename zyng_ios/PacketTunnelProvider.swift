import NetworkExtension
import Foundation

class PacketTunnelProvider: NEPacketTunnelProvider {

    private var isRunning = false

    override func startTunnel(options: [String : NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        NSLog("🔵 Zyng: startTunnel called")

        // Read VPN key from provider configuration
        guard let protocolConfig = protocolConfiguration as? NETunnelProviderProtocol,
              let config = protocolConfig.providerConfiguration,
              let vpnKey = config["key"] as? String else {
            let error = NSError(domain: "ZyngTunnel", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "VPN key not provided"])
            NSLog("❌ Zyng: No VPN key found")
            completionHandler(error)
            return
        }

        NSLog("✅ Zyng: VPN key received")

        // Create tunnel settings
        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "192.0.2.1")

        // Configure IPv4 settings
        let ipv4Settings = NEIPv4Settings(addresses: ["192.0.2.2"], subnetMasks: ["255.255.255.0"])
        ipv4Settings.includedRoutes = [NEIPv4Route.default()]
        settings.ipv4Settings = ipv4Settings

        // Configure IPv6 (optional but recommended)
        let ipv6Settings = NEIPv6Settings(addresses: ["fc00::2"], networkPrefixLengths: [64])
        ipv6Settings.includedRoutes = [NEIPv6Route.default()]
        settings.ipv6Settings = ipv6Settings

        // Configure DNS
        let dnsSettings = NEDNSSettings(servers: ["1.1.1.1", "8.8.8.8"])
        dnsSettings.matchDomains = nil  // Route all DNS through VPN
        settings.dnsSettings = dnsSettings

        // Configure TCP/UDP proxy if needed (optional)
        // let proxySettings = NEProxySettings()
        // settings.proxySettings = proxySettings

        // Set MTU
        settings.mtu = 1500

        // Apply settings
        setTunnelNetworkSettings(settings) { [weak self] error in
            guard let self = self else { return }

            if let error = error {
                NSLog("❌ Zyng: Failed to set tunnel settings: \(error.localizedDescription)")
                completionHandler(error)
                return
            }

            NSLog("✅ Zyng: Tunnel network settings applied")

            self.isRunning = true
            completionHandler(nil)

            // Start packet handling loop
            self.startPacketHandling()
        }
    }

    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        NSLog("🛑 Zyng: stopTunnel reason=\(reason.rawValue)")
        isRunning = false
        completionHandler()
    }

    private func startPacketHandling() {
        guard isRunning else { return }

        packetFlow.readPackets { [weak self] packets, protocols in
            guard let self = self, self.isRunning else { return }

            if let packets = packets, !packets.isEmpty {
                NSLog("📦 Zyng: Read \(packets.count) packet(s)")
                // TODO: Process packets through VPN backend (e.g., libXray)
                // For now, continue reading
            }

            // Continue reading packets
            self.startPacketHandling()
        }
    }
}
