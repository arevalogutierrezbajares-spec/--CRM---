import Carbon.HIToolbox
import Foundation
import CaptureCore

/// Global hotkey (default ⌘⇧R) for manual start/stop (FR-CALL-TRG-4) using
/// Carbon `RegisterEventHotKey` — works without Accessibility/Input Monitoring
/// permission, unlike NSEvent global monitors.
final class GlobalHotKey {

    var onPressed: (() -> Void)?

    private var hotKeyRef: EventHotKeyRef?
    private var eventHandlerRef: EventHandlerRef?
    private let id: UInt32
    private static let signature: OSType = 0x41474243 // 'AGBC'

    /// ⌘⇧K — flag the current moment while recording (highlights, FEATURE 3).
    public static let highlightKeyCode = UInt32(kVK_ANSI_K)

    /// ⌘⇧N — jump into the Call Desk note composer while recording.
    public static let noteKeyCode = UInt32(kVK_ANSI_N)

    /// `id` disambiguates multiple registered hotkeys: each instance installs its
    /// own app-target handler that fires for ANY matching-signature hotkey, so the
    /// handler must filter by id or every key would fire every callback.
    init?(id: UInt32 = 1,
          keyCode: UInt32 = UInt32(kVK_ANSI_R),
          modifiers: UInt32 = UInt32(cmdKey | shiftKey)) {
        self.id = id
        var eventType = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )

        let selfPointer = Unmanaged.passUnretained(self).toOpaque()
        let installStatus = InstallEventHandler(
            GetApplicationEventTarget(),
            { _, event, userData -> OSStatus in
                guard let event, let userData else { return noErr }
                var hotKeyID = EventHotKeyID()
                let status = GetEventParameter(
                    event,
                    EventParamName(kEventParamDirectObject),
                    EventParamType(typeEventHotKeyID),
                    nil,
                    MemoryLayout<EventHotKeyID>.size,
                    nil,
                    &hotKeyID
                )
                guard status == noErr, hotKeyID.signature == GlobalHotKey.signature else {
                    return OSStatus(eventNotHandledErr)
                }
                let instance = Unmanaged<GlobalHotKey>.fromOpaque(userData).takeUnretainedValue()
                // Every GlobalHotKey installs its OWN handler on the shared app
                // event target, so BOTH handlers fire for EITHER hotkey. Carbon
                // stops walking the handler chain as soon as one returns noErr —
                // so a non-matching handler MUST return eventNotHandledErr, or it
                // would swallow the sibling's key (e.g. the ⌘⇧K handler eating
                // ⌘⇧R). Only the id-owning handler returns noErr.
                guard hotKeyID.id == instance.id else {
                    return OSStatus(eventNotHandledErr)
                }
                DispatchQueue.main.async {
                    instance.onPressed?()
                }
                return noErr
            },
            1,
            &eventType,
            selfPointer,
            &eventHandlerRef
        )
        guard installStatus == noErr else { return nil }

        let hotKeyID = EventHotKeyID(signature: Self.signature, id: id)
        let registerStatus = RegisterEventHotKey(
            keyCode,
            modifiers,
            hotKeyID,
            GetApplicationEventTarget(),
            0,
            &hotKeyRef
        )
        guard registerStatus == noErr else {
            if let handler = eventHandlerRef {
                RemoveEventHandler(handler)
            }
            return nil
        }
        HelperLog.shared.info("global hotkey registered (id \(id), keyCode \(keyCode))", category: "hotkey")
    }

    deinit {
        if let hotKeyRef {
            UnregisterEventHotKey(hotKeyRef)
        }
        if let eventHandlerRef {
            RemoveEventHandler(eventHandlerRef)
        }
    }
}
