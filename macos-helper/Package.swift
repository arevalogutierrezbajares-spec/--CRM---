// swift-tools-version:6.0
import PackageDescription

// NOTE on the swift-testing dependency: this machine builds with Command Line
// Tools only (no Xcode). CLT ships no XCTest and does not wire its bundled
// Testing.framework into `swift test` (the platform-path lookup that injects
// it fails without Xcode), so the synthesized test runner silently executes
// zero tests. Depending on swift-testing as a source package is the supported
// fix for Xcode-less toolchains and makes plain `swift test` build, run, and
// report all tests. On a full-Xcode machine this dependency is simply built
// from source and everything behaves identically.
let package = Package(
    name: "AGBCaptureHelper",
    platforms: [
        .macOS(.v14)
    ],
    dependencies: [
        .package(url: "https://github.com/swiftlang/swift-testing.git", exact: "6.2.3"),
    ],
    targets: [
        // Pure logic — no AppKit/ScreenCaptureKit. Unit-testable.
        .target(
            name: "CaptureCore",
            path: "Sources/CaptureCore"
        ),
        // Menu-bar executable. Thin AppKit/ScreenCaptureKit shell over CaptureCore.
        .executableTarget(
            name: "AGBCaptureHelper",
            dependencies: ["CaptureCore"],
            path: "Sources/AGBCaptureHelper"
        ),
        .testTarget(
            name: "CaptureCoreTests",
            dependencies: [
                "CaptureCore",
                .product(name: "Testing", package: "swift-testing"),
            ],
            path: "Tests/CaptureCoreTests"
        ),
    ],
    swiftLanguageModes: [.v5]
)
