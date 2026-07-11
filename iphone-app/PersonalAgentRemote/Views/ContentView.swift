//
//  ContentView.swift
//  PersonalAgentRemote
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject var chatVM: ChatViewModel

    var body: some View {
        Group {
            if AuthService.shared.isAuthenticated {
                ChatView()
            } else {
                LoginView()
            }
        }
    }
}
