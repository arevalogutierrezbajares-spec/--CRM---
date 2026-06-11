import AppKit
import CaptureCore
import ServiceManagement

// AGBCaptureHelper — macOS menu-bar call capture companion for AGB CRM.
//
// Modes:
//   (no args)                 menu-bar app (accessory; no Dock icon)
//   --simulate <wav> [...]    headless E2E: spool + upload a 16 kHz stereo WAV
//   --install-login           register as a login item (SMAppService); needs .app
//   --uninstall-login         unregister the login item
//   --version                 print version

let arguments = CommandLine.arguments

if arguments.contains("--version") {
    print("AGBCaptureHelper \(AudioConstants.helperVersion) (protocol \(AudioConstants.protocolVersion))")
    exit(0)
}

if arguments.contains("--simulate") {
    exit(SimulatedEngine.run(arguments: arguments))
}

if arguments.contains("--install-login") || arguments.contains("--uninstall-login") {
    // FR-CALL-OPS-1: launch at login. SMAppService requires running from inside
    // an .app bundle — make-app.sh builds one and invokes this flag.
    let install = arguments.contains("--install-login")
    guard Bundle.main.bundleURL.pathExtension == "app" else {
        FileHandle.standardError.write(Data("""
        --install-login must run from inside AGBCaptureHelper.app.
        Build the bundle first:  ./make-app.sh --install-login

        """.utf8))
        exit(1)
    }
    do {
        if install {
            try SMAppService.mainApp.register()
            print("Registered AGBCaptureHelper as a login item (status: \(SMAppService.mainApp.status.rawValue)).")
        } else {
            try SMAppService.mainApp.unregister()
            print("Unregistered AGBCaptureHelper login item.")
        }
        exit(0)
    } catch {
        FileHandle.standardError.write(Data("Login item change failed: \(error.localizedDescription)\n".utf8))
        exit(1)
    }
}

// Default: menu-bar app.
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory) // LSUIElement-style: no Dock icon, no menu bar takeover
app.run()
