import LiveKit
import SwiftUI

/// One person, as a rectangle of video or the initials standing in for it.
///
/// The badges are the two things a person in a class actually needs from a
/// tile: who this is, and whether they can be heard. Everything else — the
/// host controls, the volume — lives in the People sheet, because a tile the
/// size of a thumbnail cannot carry a menu without swallowing the taps meant
/// for the video behind it.
struct ParticipantTile: View {
    let person: CallController.Person
    let track: VideoTrack?
    /// Corner radius and badge size shrink for the grid.
    var compact: Bool = false
    var showName: Bool = true

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Color.white.opacity(0.06)

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
                            .foregroundStyle(Color.red.opacity(0.95))
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
                .padding(.horizontal, compact ? 7 : 10)
                .padding(.vertical, compact ? 4 : 6)
                .background(.black.opacity(0.45), in: Capsule())
                .padding(compact ? 6 : 10)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: compact ? 14 : 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: compact ? 14 : 18, style: .continuous)
                .stroke(
                    person.isSpeaking ? Theme.live : Color.white.opacity(0.12),
                    lineWidth: person.isSpeaking ? 2.5 : 1
                )
                // Speaking is a fact about the last few hundred milliseconds;
                // without the fade the border strobes through a sentence.
                .animation(.easeOut(duration: 0.18), value: person.isSpeaking)
        }
    }

    private var initialsBadge: some View {
        ZStack {
            Circle()
                .fill(Theme.accentGradient)
                .frame(width: compact ? 44 : 68, height: compact ? 44 : 68)
                .opacity(0.9)
            Text(initials)
                .font((compact ? Font.headline : Font.title2).weight(.semibold))
                .foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var initials: String {
        let source = person.isLocal ? person.name : person.name
        let parts = source.split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first }.map(String.init).joined()
        return letters.isEmpty ? "?" : letters.uppercased()
    }
}
