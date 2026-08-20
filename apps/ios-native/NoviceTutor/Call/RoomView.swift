import SwiftUI

/// Placeholder for the LiveKit room.
///
/// The grant is already real — this is what the server minted for this person
/// for this class — so everything up to the point of connecting is exercised
/// before the SDK is added. Replaced by the room in the next step.
struct RoomView: View {
    let grant: JoinGrant
    let onLeave: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Text(grant.isHost ? "You are the host" : "Joined")
                .font(.title3.weight(.semibold))
                .foregroundStyle(.white)

            VStack(alignment: .leading, spacing: 6) {
                row("Room", grant.roomName)
                row("Server", grant.serverUrl)
                row("You", grant.userName)
                row("Identity", grant.identity)
                if let teacher = grant.teacherName { row("Teacher", teacher) }
                row("Token", "\(grant.token.prefix(24))…")
            }
            .padding(16)
            .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, 24)

            Button("Leave", role: .destructive, action: onLeave)
                .buttonStyle(.borderedProminent)
                .tint(.red)
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.5))
                .frame(width: 70, alignment: .leading)
            Text(value)
                .font(.caption.monospaced())
                .foregroundStyle(.white)
                .lineLimit(2)
                .truncationMode(.middle)
        }
    }
}
