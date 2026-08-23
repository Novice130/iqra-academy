import LiveKit
import SwiftUI

/// One person, as a rectangle of video or the initials standing in for it.
///
/// Refined in the modern iOS FaceTime visual style: continuous squircle corners,
/// frosted glass metadata pills, and glowing active-speaker aura.
struct ParticipantTile: View {
    let person: CallController.Person
    let track: VideoTrack?
    /// Corner radius and badge size shrink for the grid.
    var compact: Bool = false
    var showName: Bool = true

    private var cornerRadius: CGFloat {
        compact ? 16 : 22
    }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Color(red: 0.08, green: 0.09, blue: 0.12)

            if let track, person.cameraOn {
                SwiftUIVideoView(
                    track,
                    layoutMode: .fill,
                    // Your own camera is a mirror; everybody else's is a
                    // window. Mirroring a remote face reverses their writing.
                    mirrorMode: person.isLocal ? .mirror : .off
                )
            } else {
                initialsBadge
            }

            if showName {
                HStack(spacing: 5) {
                    if !person.micOn {
                        Image(systemName: "mic.slash.fill")
                            .font(.system(size: compact ? 9 : 11, weight: .semibold))
                            .foregroundStyle(Color(red: 1.0, green: 0.35, blue: 0.32))
                    }
                    Text(person.isLocal ? "You" : person.name)
                        .font(compact ? .caption2.weight(.medium) : .footnote.weight(.medium))
                        .lineLimit(1)
                        .foregroundStyle(.white)
                    if person.volume < 1 {
                        // A turned-down student is not a muted one, and the
                        // difference matters to whoever is wondering why they
                        // can barely hear them.
                        Image(systemName: "speaker.wave.1.fill")
                            .font(.system(size: compact ? 9 : 11, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.7))
                    }
                }
                .padding(.horizontal, compact ? 8 : 11)
                .padding(.vertical, compact ? 4 : 6)
                .background {
                    Capsule()
                        .fill(.ultraThinMaterial)
                        .overlay {
                            Capsule()
                                .stroke(Color.white.opacity(0.14), lineWidth: 0.5)
                        }
                }
                .padding(compact ? 7 : 11)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .stroke(
                    person.isSpeaking ? Theme.live : Color.white.opacity(0.12),
                    lineWidth: person.isSpeaking ? 2.5 : 1
                )
                .shadow(
                    color: person.isSpeaking ? Theme.live.opacity(0.6) : .clear,
                    radius: person.isSpeaking ? 8 : 0
                )
                // Speaking is a fact about the last few hundred milliseconds;
                // without the fade the border strobes through a sentence.
                .animation(.easeOut(duration: 0.18), value: person.isSpeaking)
        }
    }

    private var initialsBadge: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [
                            Color(red: 0.22, green: 0.52, blue: 0.98),
                            Color(red: 0.12, green: 0.36, blue: 0.82)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: compact ? 48 : 72, height: compact ? 48 : 72)
                .overlay {
                    Circle()
                        .stroke(Color.white.opacity(0.24), lineWidth: 1)
                }
                .shadow(color: .black.opacity(0.25), radius: 10, y: 4)

            Text(initials)
                .font((compact ? Font.headline : Font.title2).weight(.semibold))
                .foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var initials: String {
        let source = person.name
        let parts = source.split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first }.map(String.init).joined()
        return letters.isEmpty ? "?" : letters.uppercased()
    }
}

