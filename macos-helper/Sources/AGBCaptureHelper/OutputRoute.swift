import CoreAudio
import Foundation

/// Default system output route (speakers / headphones / AirPods). Used for
/// diagnostics and FR-CALL-CAP-2 verification — capture must work on any of these.
enum OutputRoute {
    struct Info: Equatable {
        let name: String
        /// Best-effort classification from the device name (not a hard HAL query).
        let kind: Kind

        enum Kind: String, Equatable {
            case speakers
            case headphones
            case airPods
            case bluetooth
            case unknown
        }

        var summary: String { "\(name) [\(kind.rawValue)]" }
    }

    /// Name + rough kind of the current default output device.
    static func currentDefaultOutput() -> Info {
        guard let id = defaultOutputDeviceID() else {
            return Info(name: "(no default output)", kind: .unknown)
        }
        let name = deviceName(id) ?? "Output device \(id)"
        return Info(name: name, kind: classify(name: name))
    }

    private static func defaultOutputDeviceID() -> AudioObjectID? {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var device = AudioObjectID(kAudioObjectUnknown)
        var size = UInt32(MemoryLayout<AudioObjectID>.size)
        let status = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &device
        )
        guard status == noErr, device != AudioObjectID(kAudioObjectUnknown) else {
            return nil
        }
        return device
    }

    private static func deviceName(_ device: AudioObjectID) -> String? {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioObjectPropertyName,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var cfName: CFString? = nil as CFString?
        var size = UInt32(MemoryLayout<CFString?>.size)
        let status = withUnsafeMutablePointer(to: &cfName) { ptr in
            AudioObjectGetPropertyData(device, &address, 0, nil, &size, ptr)
        }
        guard status == noErr, let cfName else { return nil }
        return cfName as String
    }

    private static func classify(name: String) -> Info.Kind {
        let n = name.lowercased()
        if n.contains("airpods") { return .airPods }
        if n.contains("headphone") || n.contains("headset") || n.contains("earphone") {
            return .headphones
        }
        if n.contains("bluetooth") || n.contains("bose") || n.contains("sony")
            || n.contains("beats") {
            return .bluetooth
        }
        if n.contains("speaker") || n.contains("macbook") || n.contains("imac")
            || n.contains("built-in") || n.contains("built in") {
            return .speakers
        }
        return .unknown
    }
}
