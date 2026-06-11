import Foundation
import Testing
@testable import CaptureCore

/// FEATURE 1 + 2 — the new HelperConfig keys must default safely for existing
/// config.json files (which lack them) and round-trip + clamp overrides.
@Suite struct HelperConfigAutoEndTests {

    private func decode(_ json: String) throws -> HelperConfig {
        try JSONDecoder().decode(HelperConfig.self, from: Data(json.utf8))
    }

    @Test func legacyConfigGetsSafeDefaults() throws {
        // An existing config.json from before these features.
        let cfg = try decode(#"""
        { "crmBaseUrl": "https://x.caneycloud.com", "token": "agbcap_x", "helperVersion": "1.0.0" }
        """#)
        #expect(cfg.silenceAutoEndSeconds == HelperConfig.defaultSilenceAutoEndSeconds)
        #expect(cfg.maxRecordingSeconds == HelperConfig.defaultMaxRecordingSeconds)
        #expect(cfg.liveTranscript == true)
        #expect(cfg.liveTranscriptAutoShow == true)
    }

    @Test func overridesAreRespected() throws {
        let cfg = try decode(#"""
        {
          "crmBaseUrl": "https://x.caneycloud.com", "token": "agbcap_x",
          "silenceAutoEndSeconds": 45, "maxRecordingSeconds": 3600,
          "liveTranscript": false, "liveTranscriptAutoShow": false
        }
        """#)
        #expect(cfg.silenceAutoEndSeconds == 45)
        #expect(cfg.maxRecordingSeconds == 3600)
        #expect(cfg.liveTranscript == false)
        #expect(cfg.liveTranscriptAutoShow == false)
    }

    @Test func nonPositiveValuesFallBackToDefaults() throws {
        // A footgun config (0 or negative) must not disable the safety net.
        let cfg = try decode(#"""
        { "silenceAutoEndSeconds": 0, "maxRecordingSeconds": -1 }
        """#)
        #expect(cfg.silenceAutoEndSeconds == HelperConfig.defaultSilenceAutoEndSeconds)
        #expect(cfg.maxRecordingSeconds == HelperConfig.defaultMaxRecordingSeconds)
    }

    @Test func roundTripsThroughEncoder() throws {
        var cfg = HelperConfig(crmBaseUrl: "https://x.caneycloud.com", token: "agbcap_x")
        cfg.silenceAutoEndSeconds = 75
        cfg.maxRecordingSeconds = 5400
        cfg.liveTranscript = false
        let data = try JSONEncoder().encode(cfg)
        let back = try JSONDecoder().decode(HelperConfig.self, from: data)
        #expect(back == cfg)
    }

    @Test func liveTokenURLDerivesFromBase() {
        let cfg = HelperConfig(crmBaseUrl: "https://x.caneycloud.com", token: "agbcap_x")
        #expect(cfg.liveTokenURL?.absoluteString == "https://x.caneycloud.com/api/capture/live-token")
        #expect(HelperConfig(crmBaseUrl: "", token: "").liveTokenURL == nil)
    }
}
