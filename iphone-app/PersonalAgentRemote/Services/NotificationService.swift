//
//  NotificationService.swift
//  PersonalAgentRemote
//

import Foundation
import UserNotifications

class NotificationService: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationService()

    func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            print("[Notification] Permission granted: \(granted)")
        }
        UNUserNotificationCenter.current().delegate = self
    }

    func sendPermissionRequestNotification(toolName: String) {
        let content = UNMutableNotificationContent()
        content.title = "Permission Request"
        content.body = "Agent wants to use: \(toolName)"
        content.sound = .default
        content.categoryIdentifier = "PERMISSION_REQUEST"
        let allowAction = UNNotificationAction(identifier: "ALLOW", title: "Allow", options: [])
        let denyAction = UNNotificationAction(identifier: "DENY", title: "Deny", options: [.destructive])
        let category = UNNotificationCategory(identifier: "PERMISSION_REQUEST", actions: [allowAction, denyAction], intentIdentifiers: [], options: [])
        UNUserNotificationCenter.current().setNotificationCategories([category])
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error { print("[Notification] Failed: \(error)") }
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        if response.actionIdentifier == "ALLOW" || response.actionIdentifier == "DENY" {
            NotificationCenter.default.post(name: Notification.Name("PermissionNotificationAction"), object: nil, userInfo: ["allow": response.actionIdentifier == "ALLOW"])
        }
        completionHandler()
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }
}
