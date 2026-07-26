import NetworkExtension
import Foundation

class PacketTunnelProvider: NEPacketTunnelProvider {

    override func startTunnel(options: [String : NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        NSLog("🔵 Zyng: startTunnel called")

        // 1. Create settings for TUN interface
        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "10.10.0.1")

        // 2. Configure IPv4 with default route (all traffic goes through VPN)
        let ipv4Settings = NEIPv4Settings(addresses: ["10.10.0.2"], subnetMasks: ["255.255.255.0"])
        ipv4Settings.includedRoutes = [NEIPv4Route.default()]
        settings.ipv4Settings = ipv4Settings

        // 3. Configure DNS (use Cloudflare and Google DNS)
        let dnsSettings = NEDNSSettings(servers: ["1.1.1.1", "8.8.8.8"])
        dnsSettings.matchDomains = nil // nil = route all DNS through VPN
        settings.dnsSettings = dnsSettings

        // 4. Set MTU
        settings.mtu = 1500

        // 5. Apply settings
        setTunnelNetworkSettings(settings) { [weak self] error in
            guard let self = self else { return }

            if let error = error {
                NSLog("❌ Zyng: setTunnelNetworkSettings error: \(error)")
                completionHandler(error)
                return
            }

            NSLog("✅ Zyng: tunnel network settings applied successfully")
            completionHandler(nil)

            // Start reading packets
            self.startPacketHandling()
        }
    }

    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        NSLog("🛑 Zyng: stopTunnel reason=\(reason.rawValue)")
        completionHandler()
    }

    private func startPacketHandling() {
        packetFlow.readPackets { [weak self] packets, protocols in
            // For now, just keep reading (don't drop packets, let system handle them)
            self?.startPacketHandling()
        }
    }
}
