//
//  LoginView.swift
//  PersonalAgentRemote
//
//  配对登录界面 — 输入服务器地址+配对码
//

import SwiftUI

struct LoginView: View {
    @State private var serverUrl: String = ""
    @State private var pairCode: String = ""
    @State private var deviceName: String = UIDevice.current.name
    @State private var isPairing: Bool = false
    @State private var errorMsg: String?
    @EnvironmentObject var chatVM: ChatViewModel

    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                Image(systemName: "iphone.radiowaves.left.and.right")
                    .font(.system(size: 64))
                    .foregroundColor(.accentColor)
                    .padding(.top, 40)

                Text("Personal Agent")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                Text("Remote Control")
                    .font(.title3)
                    .foregroundColor(.secondary)

                VStack(spacing: 16) {
                    TextField("Server URL", text: $serverUrl)
                        .textFieldStyle(.roundedBorder)
                        .autocapitalization(.none)
                        .keyboardType(.URL)
                        .placeholder("http://192.168.1.100:7780")

                    TextField("Pair Code", text: $pairCode)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.numberPad)

                    TextField("Device Name", text: $deviceName)
                        .textFieldStyle(.roundedBorder)
                }
                .padding(.horizontal, 32)

                if let errorMsg = errorMsg {
                    Text(errorMsg)
                        .foregroundColor(.red)
                        .font(.caption)
                        .padding(.horizontal)
                }

                Button(action: doPair) {
                    HStack {
                        if isPairing {
                            ProgressView()
                                .progressViewStyle(.circular)
                                .tint(.white)
                        }
                        Text(isPairing ? "Pairing..." : "Pair with CLI")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.accentColor)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                .disabled(isPairing || serverUrl.isEmpty || pairCode.count != 6)
                .padding(.horizontal, 32)

                Spacer()

                Text("Run `pa remote-relay --pair` on your PC to get the pair code.")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .padding(.bottom, 20)
            }
            .navigationBarHidden(true)
        }
    }

    private func doPair() {
        Task {
            isPairing = true
            errorMsg = nil

            do {
                let result = try await AuthService.shared.pair(
                    serverUrl: serverUrl,
                    pairCode: pairCode,
                    deviceName: deviceName
                )

                if result.success {
                    chatVM.connect()
                } else {
                    errorMsg = result.error ?? "Pairing failed"
                }
            } catch {
                errorMsg = error.localizedDescription
            }

            isPairing = false
        }
    }
}

extension View {
    func placeholder(_ text: String) -> some View {
        self.overlay(
            Text(text)
                .foregroundColor(.secondary.opacity(0.5))
                .allowsHitTesting(false),
            alignment: .leading
        )
    }
}
