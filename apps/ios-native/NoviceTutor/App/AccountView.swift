import SwiftUI

struct AccountView: View {
    let user: CurrentUser
    @Environment(AppSession.self) private var session
    @State private var signingOut = false
    @State private var canDelete = false
    @State private var confirmingDelete = false
    @State private var deleting = false
    @State private var deleteError: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(user.name ?? user.email).font(.headline)
                        Text(user.email).font(.footnote).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }

                Section("Account") {
                    LabeledContent("Role", value: roleLabel)
                    if let timezone = user.timezone {
                        LabeledContent("Time zone", value: timezone)
                    }
                }

                Section {
                    Button("Sign out", role: .destructive) {
                        signingOut = true
                        Task {
                            await session.signOut()
                            signingOut = false
                        }
                    }
                    .disabled(signingOut || deleting)
                }

                // Apple requires an account created in the app to be
                // deletable from it. The server decides who may: staff
                // accounts are removed by the school, so the row only appears
                // for the people it would actually work for.
                if canDelete {
                    Section {
                        Button("Delete account", role: .destructive) {
                            confirmingDelete = true
                        }
                        .disabled(deleting)
                    } footer: {
                        Text("Deleting removes your profile and cancels your upcoming classes. This cannot be undone.")
                    }
                }
            }
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

    private func loadDeletability() async {
        // A failure here only hides a button; it is not worth an error a
        // person can do nothing about.
        canDelete = (try? await APIClient.shared.accountDeletability())?.canDelete ?? false
    }

    private func deleteAccount() async {
        deleting = true
        defer { deleting = false }
        do {
            try await APIClient.shared.deleteAccount()
            // The server has already ended the session; this drops the cookie
            // and returns to the sign-in screen.
            await session.signOut()
        } catch {
            deleteError = error.localizedDescription
        }
    }

    private var roleLabel: String {
        switch user.role {
        case .student: "Family"
        case .teacher: "Teacher"
        case .orgAdmin: "Administrator"
        case .superAdmin: "Administrator"
        }
    }
}
