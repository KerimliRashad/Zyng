@preconcurrency import NetworkExtension
import Foundation

class PacketTunnelProvider: NEPacketTunnelProvider {

    private var isRunning = false

    override func startTunnel(options: [String : NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        NSLog("🔵 Zyng: startTunnel called")

        guard let protocolConfig = protocolConfiguration as? NETunnelProviderProtocol,
              let config = protocolConfig.providerConfiguration else {
            let error = NSError(domain: "ZyngTunnel", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "VPN configuration missing"])
            NSLog("❌ Zyng: No VPN configuration found")
            completionHandler(error)
            return
        }

        // Extract VPN key for future use with libXray
        let _vpnKey = config["key"] as? String
        NSLog("✅ Zyng: VPN key received")

        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "192.0.2.1")

        let ipv4Settings = NEIPv4Settings(addresses: ["192.0.2.2"], subnetMasks: ["255.255.255.0"])
        ipv4Settings.includedRoutes = [NEIPv4Route.default()]
        settings.ipv4Settings = ipv4Settings

        let ipv6Settings = NEIPv6Settings(addresses: ["fc00::2"], networkPrefixLengths: [64])
        ipv6Settings.includedRoutes = [NEIPv6Route.default()]
        settings.ipv6Settings = ipv6Settings

        let dnsSettings = NEDNSSettings(servers: ["1.1.1.1", "8.8.8.8"])
        dnsSettings.matchDomains = nil
        settings.dnsSettings = dnsSettings

        settings.mtu = 1500

        setTunnelNetworkSettings(settings) { [weak self] error in
            guard let self = self else {
                completionHandler(NSError(domain: "ZyngTunnel", code: 99,
                    userInfo: [NSLocalizedDescriptionKey: "Provider deallocated"]))
                return
            }

            if let error = error {
                NSLog("❌ Zyng: Failed to set tunnel settings: \(error.localizedDescription)")
                completionHandler(error)
                return
            }

            NSLog("✅ Zyng: Tunnel network settings applied")

            self.isRunning = true
            completionHandler(nil)

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

            if packets.count > 0 {
                NSLog("📦 Zyng: Read \(packets.count) packet(s)")
            }

            self.startPacketHandling()
        }
    }
}
