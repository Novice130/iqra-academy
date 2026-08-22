import SwiftUI

struct AccountView: View {
    let user: CurrentUser
    @Environment(AppSession.self) private var session
    @AppStorage("app_appearance") private var appearance: String = AppAppearance.system.rawValue

    @State private var signingOut = false
    @State private var canDelete = false
    @State private var confirmingDelete = false
    @State private var deleting = false
    @State private var deleteError: String?

    var body: some View {
        NavigationStack {
            List {
                // Profile Header Card
                Section {
                    HStack(spacing: 16) {
                        // User Initials Avatar
                        ZStack {
                            Circle()
                                .fill(Theme.accentGradient)
                                .frame(width: 60, height: 60)
                                .shadow(color: Theme.accent.opacity(0.3), radius: 8, y: 4)

                            Text(initials)
                                .font(.title3.weight(.bold))
                                .foregroundStyle(.white)
                        }

                        VStack(alignment: .leading, spacing: 4) {
                            Text(user.name ?? user.email)
                                .font(.headline.weight(.bold))
                                .foregroundStyle(.primary)

                            Text(user.email)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)

                            Text(roleLabel.uppercased())
                                .font(.caption2.weight(.heavy))
                                .foregroundStyle(Theme.accent)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(Theme.accent.opacity(0.12), in: Capsule())
                                .padding(.top, 2)
                        }
                    }
                    .padding(.vertical, 6)
                }

                // Appearance & Theme Settings
                Section("Appearance") {
                    Picker("Theme", selection: $appearance) {
                        ForEach(AppAppearance.allCases) { item in
                            Label(item.label, systemImage: item.icon)
                                .tag(item.rawValue)
                        }
                    }
                    .pickerStyle(.menu)
                    .onChange(of: appearance) { _, _ in
                        Theme.hapticSelection()
                    }
                }

                // Account Details
                Section("Account Details") {
                    settingRow(icon: "person.text.rectangle.fill", color: .indigo, label: "Role", value: roleLabel)

                    if let timezone = user.timezone {
                        settingRow(icon: "globe.americas.fill", color: .blue, label: "Time Zone", value: timezone)
                    }
                }

                // App Info
                Section("About") {
                    settingRow(icon: "info.circle.fill", color: .gray, label: "Version", value: "1.0.0 (Release)")
                }

                // Actions
                Section {
                    Button(role: .destructive) {
                        Theme.haptic(.medium)
                        signingOut = true
                        Task {
                            await session.signOut()
                            signingOut = false
                        }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                                .font(.system(size: 16, weight: .semibold))
                            Text(signingOut ? "Signing out…" : "Sign Out")
                                .fontWeight(.medium)
                            if signingOut {
                                Spacer()
                                ProgressView().controlSize(.small)
                            }
                        }
                    }
                    .disabled(signingOut || deleting)
                }

                // Deletion (App Store Compliance)
                if canDelete {
                    Section {
                        Button(role: .destructive) {
                            Theme.haptic(.heavy)
                            confirmingDelete = true
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "trash.fill")
                                    .font(.system(size: 16))
                                Text("Delete Account")
                                    .fontWeight(.medium)
                            }
                        }
                        .disabled(deleting)
                    } footer: {
                        Text("Deleting removes your profile, children profiles, and cancels upcoming classes. This cannot be undone.")
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Account")
            .task { await loadDeletability() }
            .confirmationDialog(
                "Delete your account?",
                isPresented: $confirmingDelete,
                titleVisibility: .visible
            ) {
                Button("Delete account", role: .destructive) {
                    Task { await deleteAccount() }
                }
                Button("Keep my account", role: .cancel) {}
            } message: {
                Text("Your profile and your children's profiles are removed, and every upcoming class is cancelled. This cannot be undone.")
            }
            .alert(
                "Couldn't delete your account",
                isPresented: Binding(
                    get: { deleteError != nil },
                    set: { if !$0 { deleteError = nil } }
                )
            ) {
                Button("OK", role: .cancel) { deleteError = nil }
            } message: {
                Text(deleteError ?? "")
            }
        }
    }

    // MARK: - Helpers

    private func settingRow(icon: String, color: Color, label: String, value: String) -> some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .fill(color)
                    .frame(width: 28, height: 28)

                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
            }

            Text(label)
                .foregroundStyle(.primary)

            Spacer()

            Text(value)
                .foregroundStyle(.secondary)
                .font(.subheadline)
        }
    }

    private var initials: String {
        if let name = user.name, !name.isEmpty {
            let parts = name.split(separator: " ")
            if parts.count >= 2 {
                return "\(parts[0].prefix(1))\(parts[1].prefix(1))".uppercased()
            }
            return String(name.prefix(2)).uppercased()
        }
        return String(user.email.prefix(2)).uppercased()
    }

    private func loadDeletability() async {
        canDelete = (try? await APIClient.shared.accountDeletability())?.canDelete ?? false
    }

    private func deleteAccount() async {
        deleting = true
        defer { deleting = false }
        do {
            try await APIClient.shared.deleteAccount()
            await session.signOut()
        } catch {
            deleteError = error.localizedDescription
        }
    }

    private var roleLabel: String {
        switch user.role {
        case .student: return "Family"
        case .teacher: return "Teacher"
        case .orgAdmin: return "Administrator"
        case .superAdmin: return "Administrator"
        }
    }
}
