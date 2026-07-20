import XCTest
@testable import CaptureCore

/// Speakerphone capture kind: an external device (phone/handset) captured
/// acoustically through the room mic.
final class CaptureKindSpeakerTests: XCTestCase {

    func testSpeakerIsMicOnly() {
        XCTAssertFalse(CaptureKind.speaker.capturesSystemAudio,
                       "far side never reaches Mac output — tapping it is pure cost")
        XCTAssertFalse(CaptureKind.meeting.capturesSystemAudio)
        XCTAssertTrue(CaptureKind.call.capturesSystemAudio)
    }

    func testOnlySpeakerIsAcousticMixed() {
        XCTAssertTrue(CaptureKind.speaker.isAcousticMixed)
        XCTAssertFalse(CaptureKind.call.isAcousticMixed)
        XCTAssertFalse(CaptureKind.meeting.isAcousticMixed)
    }

    /// The root cause of the 5-second auto-finalize: peer mic usage is only
    /// meaningful when the call actually runs on this Mac.
    func testPeerMicUsageOnlyMeaningfulForCall() {
        XCTAssertTrue(CaptureKind.call.peerMicUsageIsMeaningful)
        XCTAssertFalse(CaptureKind.speaker.peerMicUsageIsMeaningful)
        XCTAssertFalse(CaptureKind.meeting.peerMicUsageIsMeaningful)
    }

    func testSpeakerIsNotMisreportedAsMeeting() {
        XCTAssertFalse(CaptureKind.speaker.isMeeting)
    }

    func testDefaultSourceApp() {
        XCTAssertEqual(CaptureKind.speaker.defaultSourceApp(detected: nil),
                       CaptureKind.sourceAppSpeaker)
        XCTAssertEqual(CaptureKind.speaker.defaultSourceApp(detected: "WhatsApp"),
                       CaptureKind.sourceAppSpeaker,
                       "speakerphone is off-Mac; a detected app would be misleading")
        XCTAssertEqual(CaptureKind.meeting.defaultSourceApp(detected: "Zoom"),
                       CaptureKind.sourceAppMeeting)
        XCTAssertEqual(CaptureKind.call.defaultSourceApp(detected: "WhatsApp"), "WhatsApp")
        XCTAssertNil(CaptureKind.call.defaultSourceApp(detected: nil))
    }

    /// Both parties share L, so labeling it "You" would attribute the other
    /// side's words to the founder.
    func testSpeakerPrimaryLabelIsNotYou() {
        XCTAssertNotEqual(CaptureKind.speaker.primarySpeakerLabel(participantName: nil), "You")
        XCTAssertEqual(CaptureKind.speaker.primarySpeakerLabel(participantName: nil), "Call")
        XCTAssertEqual(CaptureKind.speaker.primarySpeakerLabel(participantName: "Carlos"),
                       "Call (Carlos)")
    }

    func testRoundTripsThroughRawValue() {
        XCTAssertEqual(CaptureKind(rawValue: "speaker"), .speaker)
        XCTAssertEqual(CaptureKind.speaker.rawValue, "speaker")
    }

    /// Manifests written by older builds must still decode.
    func testUnknownKindFallsBackToCall() {
        XCTAssertNil(CaptureKind(rawValue: "telepathy"))
    }
}
