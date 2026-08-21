import SwiftUI

struct SignInView: View {
    @Environment(AppSession.self) private var session

    @State private var mode: Mode = .signIn
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var working = false
    #if DEBUG
    @State private var showingDeveloperSettings = false
    #endif

    @FocusState private var focus: Field?

    private enum Mode { case signIn, signUp }
    private enum Field { case name, email, password }

    private var canSubmit: Bool {
        guard !working, email.contains("@"), password.count >= 8 else { return false }
        return mode == .signIn || !name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        ZStack {
            Theme.ink.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header

                    VStack(spacing: 12) {
                        if mode == .signUp {
                            field("Your name", text: $name, field: .name)
                                .textContentType(.name)
                                .submitLabel(.next)
                        }

                        field("Email", text: $email, field: .email)
                            .keyboardType(.emailAddress)
                            .textContentType(.username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .submitLabel(.next)

                        secureField
                    }

                    if let error {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                            .fixedSize(horizontal: false, vertical: true)
                    } else if let restoreError = session.restoreError {
                        // Not a failed sign-in — the app could not reach the
                        // server at all when it launched. Saying so stops
                        // somebody retyping a password that was never wrong.
                        Label(
                            "Couldn't reach Novice Tutor. \(restoreError)",
                            systemImage: "wifi.exclamationmark"
                        )
                        .font(.footnote)
                        .foregroundStyle(.orange)
                        .fixedSize(horizontal: false, vertical: true)
                    }

                    Button(action: submit) {
                        HStack {
                            if working { ProgressView().tint(.white) }
                            Text(mode == .signIn ? "Sign in" : "Create account")
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.accent)
                    .disabled(!canSubmit)

                    Button(mode == .signIn ? "New here? Create an account" : "I already have an account") {
                        withAnimation { mode = mode == .signIn ? .signUp : .signIn }
                        error = nil
                    }
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.7))
                    .frame(maxWidth: .infinity)
                }
                .padding(24)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .preferredColorScheme(.dark)
        #if DEBUG
        .sheet(isPresented: $showingDeveloperSettings) { DeveloperSettingsView() }
        #endif
        .onSubmit(advance)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Novice Tutor")
                .font(.largeTitle.bold())
                .foregroundStyle(.white)
                // Four taps on the title open the screen that points the app
                // at a laptop. Debug builds only — in a release build the
                // override is ignored anyway, so leaving the screen reachable
                // would offer a person a setting that silently does nothing,
                // which is exactly the non-public functionality App Review
                // objects to.
                #if DEBUG
                .onTapGesture(count: 4) { showingDeveloperSettings = true }
                #endif
            Text(mode == .signIn ? "Sign in to see your classes." : "Create an account to book your first class.")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.7))
        }
        .padding(.top, 40)
    }

    private func field(_ label: String, text: Binding<String>, field: Field) -> some View {
        TextField(label, text: text)
            .textFieldStyle(.plain)
            .padding(14)
            .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
            .foregroundStyle(.white)
            .focused($focus, equals: field)
    }

    private var secureField: some View {
        SecureField("Password", text: $password)
            .textFieldStyle(.plain)
            .padding(14)
            .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
            .foregroundStyle(.white)
            .textContentType(mode == .signIn ? .password : .newPassword)
            .focused($focus, equals: .password)
            .submitLabel(.go)
    }

    private func advance() {
        switch focus {
        case .name: focus = .email
        case .email: focus = .password
        case .password where canSubmit: submit()
        default: break
        }
    }

    private func submit() {
        focus = nil
        error = nil
        working = true
        Task {
            do {
                if mode == .signIn {
                    try await session.signIn(email: email, password: password)
                } else {
                    try await session.signUp(name: name, email: email, password: password)
                }
            } catch {
                self.error = error.localizedDescription
            }
            working = false
        }
    }
}

#if DEBUG
/// Points a debug build at a laptop instead of production. Not compiled into a
/// release build at all.
struct DeveloperSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var origin = AppConfig.devOriginOverride?.absoluteString ?? ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://192.168.1.10:3000", text: $origin)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Server")
                } footer: {
                    Text("Leave empty for novicetutor.com. A phone can't reach the Mac's localhost — use the Mac's address on the network, and start the dev server with BETTER_AUTH_TRUSTED_ORIGINS set to the same string.")
                }

                Section {
                    Text(AppConfig.origin.absoluteString)
                        .font(.footnote.monospaced())
                        .foregroundStyle(.secondary)
                } header: {
                    Text("Currently talking to")
                }
            }
            .navigationTitle("Developer")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        let trimmed = origin.trimmingCharacters(in: .whitespaces)
                        AppConfig.devOriginOverride = trimmed.isEmpty ? nil : URL(string: trimmed)
                        dismiss()
                    }
                }
            }
        }
    }
}
#endif
