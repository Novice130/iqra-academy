import SwiftUI

struct SignInView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppSession.self) private var session
    @Environment(\.colorScheme) private var colorScheme

    @State private var mode: Mode = .signIn
    #if DEBUG
    @State private var email = AppConfig.devStudentEmail
    @State private var password = AppConfig.devTestPassword ?? ""
    #else
    @State private var email = ""
    @State private var password = ""
    #endif
    @State private var name = ""
    @State private var showPassword = false
    @State private var error: String?
    @State private var working = false
    #if DEBUG
    @State private var showingDeveloperSettings = false
    #endif

    @FocusState private var focus: Field?

    private enum Mode: String, CaseIterable {
        case signIn = "Sign In"
        case signUp = "Create Account"
    }

    private enum Field { case name, email, password }

    private var canSubmit: Bool {
        guard !working, email.contains("@"), password.count >= 8 else { return false }
        return mode == .signIn || !name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        ZStack {
            // Adaptive ambient background
            Color(uiColor: .systemBackground).ignoresSafeArea()

            // Subtle glowing ambient mesh
            if colorScheme == .dark {
                Theme.heroMeshDark.ignoresSafeArea()
            } else {
                Theme.heroMeshLight.ignoresSafeArea()
            }

            ScrollView {
                VStack(spacing: 24) {
                    HStack {
                        Spacer()
                        Button {
                            Theme.haptic(.light)
                            dismiss()
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.title2)
                                .foregroundStyle(.secondary.opacity(0.8))
                        }
                    }
                    .padding(.top, 4)

                    header

                    // Segmented mode switcher
                    modePicker

                    // Input Form
                    VStack(spacing: 14) {
                        if mode == .signUp {
                            modernField(
                                label: "Full Name",
                                placeholder: "e.g. Abdullah Khan",
                                text: $name,
                                icon: "person.fill",
                                field: .name
                            )
                            .textContentType(.name)
                            .submitLabel(.next)
                            .transition(.move(edge: .top).combined(with: .opacity))
                        }

                        modernField(
                            label: "Email Address",
                            placeholder: "you@example.com",
                            text: $email,
                            icon: "envelope.fill",
                            field: .email
                        )
                        .keyboardType(.emailAddress)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.next)

                        modernSecureField
                    }
                    .padding(20)
                    .background {
                        RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                            .fill(Color(uiColor: .secondarySystemGroupedBackground))
                            .overlay {
                                RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                                    .stroke(Color.primary.opacity(0.06), lineWidth: 1)
                            }
                            .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.25 : 0.05), radius: 14, y: 4)
                    }

                    // Error & Status Banners
                    if let error {
                        errorBanner(message: error, icon: "exclamationmark.triangle.fill")
                    } else if let restoreError = session.restoreError {
                        errorBanner(
                            message: "Couldn't reach Novice Tutor. \(restoreError)",
                            icon: "wifi.exclamationmark"
                        )
                    }

                    // Submit Button
                    Button(action: submit) {
                        HStack(spacing: 10) {
                            if working {
                                ProgressView().tint(.white)
                            }
                            Text(mode == .signIn ? "Sign In" : "Create Account")
                                .font(.headline.weight(.semibold))
                        }
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .foregroundStyle(.white)
                        .background {
                            RoundedRectangle(cornerRadius: Theme.buttonRadius, style: .continuous)
                                .fill(canSubmit ? Theme.accentGradient : LinearGradient(colors: [Color.gray.opacity(0.4), Color.gray.opacity(0.4)], startPoint: .top, endPoint: .bottom))
                        }
                        .shadow(
                            color: canSubmit ? Theme.accent.opacity(0.35) : Color.clear,
                            radius: 10,
                            y: 4
                        )
                    }
                    .disabled(!canSubmit)
                    .animation(.easeInOut(duration: 0.2), value: canSubmit)

                    // Footer toggle
                    Button {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                            mode = mode == .signIn ? .signUp : .signIn
                            Theme.hapticSelection()
                        }
                        error = nil
                    } label: {
                        Text(mode == .signIn ? "Don't have an account? **Sign up**" : "Already have an account? **Sign in**")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 4)

                    #if DEBUG
                    // Absent without a password to use: a shortcut that always
                    // fails is worse than no shortcut. See
                    // `AppConfig.devTestPassword` for how to supply one.
                    if let testPassword = AppConfig.devTestPassword {
                        HStack(spacing: 8) {
                            Button("🧪 Student 1") {
                                mode = .signIn
                                email = AppConfig.devStudentEmail
                                password = testPassword
                                submit()
                            }
                            .font(.caption2.weight(.medium))
                            .buttonStyle(.bordered)

                            Button("🧪 Teacher") {
                                mode = .signIn
                                email = AppConfig.devTeacherEmail
                                password = testPassword
                                submit()
                            }
                            .font(.caption2.weight(.medium))
                            .buttonStyle(.bordered)
                        }
                    }
                    #endif
                }
                .padding(.horizontal, 22)
                .padding(.vertical, 24)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .onAppear {
            #if DEBUG
            if let testPassword = AppConfig.devTestPassword {
                if UserDefaults.standard.bool(forKey: "auto-login-student") {
                    email = AppConfig.devStudentEmail
                    password = testPassword
                    submit()
                } else if UserDefaults.standard.bool(forKey: "auto-login-teacher") {
                    email = AppConfig.devTeacherEmail
                    password = testPassword
                    submit()
                }
            }
            #endif
        }
        #if DEBUG
        .sheet(isPresented: $showingDeveloperSettings) { DeveloperSettingsView() }
        #endif
        .onSubmit(advance)
    }

    // MARK: - Subviews

    private var header: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(Theme.accentGradient)
                    .frame(width: 80, height: 80)
                    .shadow(color: Theme.accent.opacity(0.4), radius: 18, y: 8)

                Image(systemName: "book.pages.fill")
                    .font(.system(size: 36, weight: .semibold))
                    .foregroundStyle(.white)
            }
            #if DEBUG
            .onTapGesture(count: 4) { showingDeveloperSettings = true }
            #endif

            VStack(spacing: 6) {
                Text("Novice Tutor")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(.primary)

                Text(mode == .signIn ? "Sign in to access your live classes & schedule" : "Join to start learning with expert teachers")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 16)
            }
        }
        .padding(.top, 16)
    }

    private var modePicker: some View {
        HStack(spacing: 0) {
            ForEach(Mode.allCases, id: \.self) { item in
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) {
                        mode = item
                        Theme.hapticSelection()
                    }
                    error = nil
                } label: {
                    Text(item.rawValue)
                        .font(.subheadline.weight(mode == item ? .semibold : .medium))
                        .foregroundStyle(mode == item ? .primary : .secondary)
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background {
                            if mode == item {
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .fill(Color(uiColor: .tertiarySystemGroupedBackground))
                                    .shadow(color: Color.black.opacity(0.06), radius: 4, y: 2)
                            }
                        }
                }
            }
        }
        .padding(4)
        .background {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(uiColor: .secondarySystemGroupedBackground))
        }
    }

    private func modernField(
        label: String,
        placeholder: String,
        text: Binding<String>,
        icon: String,
        field: Field
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)

            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(focus == field ? Theme.accent : .secondary)
                    .frame(width: 20)

                TextField(placeholder, text: text)
                    .textFieldStyle(.plain)
                    .font(.body)
                    .focused($focus, equals: field)

                if !text.wrappedValue.isEmpty {
                    Button {
                        text.wrappedValue = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background {
                RoundedRectangle(cornerRadius: Theme.inputRadius, style: .continuous)
                    .fill(Color(uiColor: .tertiarySystemGroupedBackground))
                    .overlay {
                        RoundedRectangle(cornerRadius: Theme.inputRadius, style: .continuous)
                            .stroke(
                                focus == field ? Theme.accent.opacity(0.7) : Color.primary.opacity(0.06),
                                lineWidth: focus == field ? 1.5 : 1
                            )
                    }
            }
        }
    }

    private var modernSecureField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Password")
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)

            HStack(spacing: 12) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(focus == .password ? Theme.accent : .secondary)
                    .frame(width: 20)

                if showPassword {
                    TextField("At least 8 characters", text: $password)
                        .textFieldStyle(.plain)
                        .font(.body)
                        .focused($focus, equals: .password)
                        .submitLabel(.go)
                } else {
                    SecureField("At least 8 characters", text: $password)
                        .textFieldStyle(.plain)
                        .font(.body)
                        .textContentType(mode == .signIn ? .password : .newPassword)
                        .focused($focus, equals: .password)
                        .submitLabel(.go)
                }

                Button {
                    showPassword.toggle()
                } label: {
                    Image(systemName: showPassword ? "eye.slash.fill" : "eye.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background {
                RoundedRectangle(cornerRadius: Theme.inputRadius, style: .continuous)
                    .fill(Color(uiColor: .tertiarySystemGroupedBackground))
                    .overlay {
                        RoundedRectangle(cornerRadius: Theme.inputRadius, style: .continuous)
                            .stroke(
                                focus == .password ? Theme.accent.opacity(0.7) : Color.primary.opacity(0.06),
                                lineWidth: focus == .password ? 1.5 : 1
                            )
                    }
            }
        }
    }

    private func errorBanner(message: String, icon: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.orange)

            Text(message)
                .font(.footnote.weight(.medium))
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)

            Spacer()
        }
        .padding(14)
        .background {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.orange.opacity(0.12))
                .overlay {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.orange.opacity(0.3), lineWidth: 1)
                }
        }
        .transition(.scale.combined(with: .opacity))
    }

    // MARK: - Actions

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
        Theme.haptic(.medium)
        Task {
            do {
                if mode == .signIn {
                    try await session.signIn(email: email, password: password)
                } else {
                    try await session.signUp(name: name, email: email, password: password)
                }
                Theme.hapticNotification(.success)
                dismiss()
            } catch {
                self.error = error.localizedDescription
                Theme.hapticNotification(.error)
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
