import Foundation
import Testing
@testable import CaptureCore

/// Live-engine selection + backoff policy (2026-07-22/23 RCA fixes): the engine
/// choice must migrate legacy configs without changing their behavior, and the
/// backoff curves must be bounded (no hot loops) but persistent (no give-up).
@Suite struct LiveEngineSelectionTests {

    private func decode(_ json: String) throws -> HelperConfig {
        try JSONDecoder().decode(HelperConfig.self, from: Data(json.utf8))
    }

    // MARK: - Engine choice decoding

    @Test func brandNewConfigDefaultsToAuto() throws {
        let cfg = try decode(#"{ "crmBaseUrl": "https://x", "token": "agbcap_x" }"#)
        #expect(cfg.liveTranscriptEngine == .auto)
    }

    @Test func legacyOnDeviceTrueMigratesToLocal() throws {
        let cfg = try decode(#"{ "crmBaseUrl": "https://x", "token": "t", "liveTranscriptOnDevice": true }"#)
        #expect(cfg.liveTranscriptEngine == .local)
    }

    @Test func legacyOnDeviceFalseMigratesToCloud() throws {
        // The 2026-07-13 workaround config (cloud because on-device was broken)
        // must keep using the cloud engine after upgrade, not silently flip.
        let cfg = try decode(#"{ "crmBaseUrl": "https://x", "token": "t", "liveTranscriptOnDevice": false }"#)
        #expect(cfg.liveTranscriptEngine == .cloud)
    }

    @Test func explicitEngineKeyBeatsLegacyBool() throws {
        let cfg = try decode(#"""
        { "crmBaseUrl": "https://x", "token": "t",
          "liveTranscriptOnDevice": false, "liveTranscriptEngine": "auto" }
        """#)
        #expect(cfg.liveTranscriptEngine == .auto)
    }

    @Test func unknownEngineValueFallsBackToDerivation() throws {
        let cfg = try decode(#"""
        { "crmBaseUrl": "https://x", "token": "t",
          "liveTranscriptOnDevice": false, "liveTranscriptEngine": "quantum" }
        """#)
        #expect(cfg.liveTranscriptEngine == .cloud)
    }

    @Test func engineChoiceRoundTrips() throws {
        var cfg = HelperConfig(crmBaseUrl: "https://x", token: "t")
        cfg.liveTranscriptEngine = .cloud
        let data = try JSONEncoder().encode(cfg)
        let back = try JSONDecoder().decode(HelperConfig.self, from: data)
        #expect(back.liveTranscriptEngine == .cloud)
    }

    // MARK: - Backoff curves

    @Test func reconnectDelayGrowsThenCaps() {
        #expect(LiveBackoff.reconnectDelay(attempt: 1) == 1)
        #expect(LiveBackoff.reconnectDelay(attempt: 2) == 2)
        #expect(LiveBackoff.reconnectDelay(attempt: 3) == 4)
        #expect(LiveBackoff.reconnectDelay(attempt: 4) == 8)
        #expect(LiveBackoff.reconnectDelay(attempt: 5) == 15)
        #expect(LiveBackoff.reconnectDelay(attempt: 50) == 15)   // never gives up, never overflows
        #expect(LiveBackoff.reconnectDelay(attempt: 0) == 1)     // defensive
    }

    @Test func onDeviceRetryDelayGrowsThenCaps() {
        #expect(LiveBackoff.onDeviceRetryDelay(consecutiveFailures: 1) == 0.5)
        #expect(LiveBackoff.onDeviceRetryDelay(consecutiveFailures: 2) == 1)
        #expect(LiveBackoff.onDeviceRetryDelay(consecutiveFailures: 3) == 2)
        #expect(LiveBackoff.onDeviceRetryDelay(consecutiveFailures: 4) == 4)
        #expect(LiveBackoff.onDeviceRetryDelay(consecutiveFailures: 5) == 8)
        #expect(LiveBackoff.onDeviceRetryDelay(consecutiveFailures: 99) == 8)
        #expect(LiveBackoff.onDeviceRetryDelay(consecutiveFailures: 0) == 0)
    }
}
