//
//  PersonalAgentApp.swift
//  PersonalAgentRemote
//
//  SwiftUI App 入口
//

import SwiftUI

@main
struct PersonalAgentApp: App {
    @StateObject private var chatVM = ChatViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(chatVM)
        }
    }
}
