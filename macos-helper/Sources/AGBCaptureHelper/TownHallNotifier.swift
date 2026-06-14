import AppKit
import UserNotifications
import CaptureCore

/// Posts native macOS banners for newly-arrived Town Hall notifications. Wraps
/// UNUserNotificationCenter with a one-time authorization request (same pattern
/// as AppDelegate.notifyAutoEnded). If authorization is denied the banners
/// silently no-op — the in-window Notifications list remains the fallback.
///
/// Banners only work from the signed `.app` bundle (a valid bundle id); running
/// the bare SwiftPM binary, UNUserNotificationCenter is unavailable and these
/// calls are harmless no-ops.
final class TownHallNotifier {
    private var requestedOnce = false

    /// Request banner authorization once, early (e.g. when Town Hall first opens).
    func requestAuthorizationOnce() {
        guard !requestedOnce else { return }
        requestedOnce = true
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    /// Post one banner per new notification. Uses the notification's own id as
    /// the request identifier so the OS de-dupes across helper relaunches.
    func post(_ notifications: [THNotification]) {
        guard !notifications.isEmpty else { return }
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            guard settings.authorizationStatus == .authorized ||
                  settings.authorizationStatus == .provisional else { return }
            for n in notifications {
                let content = UNMutableNotificationContent()
                content.title = "AGB Town Hall"
                content.body = n.headline
                content.sound = .default
                let request = UNNotificationRequest(identifier: "townhall-\(n.id)", content: content, trigger: nil)
                center.add(request, withCompletionHandler: nil)
            }
        }
    }
}
