import SwiftUI

struct AccountView: View {
    let user: CurrentUser
    @Environment(AppSession.self) private var session
    @State private var signingOut = false

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
                    .disabled(signingOut)
                }
            }
            .navigationTitle("Account")
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
