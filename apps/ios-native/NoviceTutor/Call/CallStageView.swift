import LiveKit
import SwiftUI

/// The main view of the class: whoever is being watched, plus your own tile.
struct CallStageView: View {
    let stage: CallController.Stage
    let selfTrack: VideoTrack?
    let selfName: String
    let waitingFor: String
    let isReconnecting: Bool

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Theme.ink.ignoresSafeArea()

            main
                .ignoresSafeArea()
                .opacity(isReconnecting ? 0.4 : 1)
                .animation(.easeInOut(duration: 0.2), value: isReconnecting)

            selfTile
                .padding(.trailing, 16)
                .padding(.top, 16)

            if isReconnecting {
                reconnectingChip
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 12)
            }
        }
    }

    @ViewBuilder
    private var main: some View {
        switch stage {
        case .remote(let track, let name):
            ZStack(alignment: .bottomLeading) {
                SwiftUIVideoView(track, layoutMode: .fill, mirrorMode: .auto)
                Text(name)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.black.opacity(0.45), in: Capsule())
                    .padding(.leading, 20)
                    .padding(.bottom, 120)
            }

        case .waitingForOthers:
            VStack(spacing: 14) {
                ProgressView().controlSize(.large).tint(.white)
                Text("Waiting for \(waitingFor)…")
                    .foregroundStyle(.white.opacity(0.75))
            }
        }
    }

    /// Not draggable, on purpose. A tile that can be moved is a tile that can
    /// be lost behind the control bar, and there is nothing here worth
    /// uncovering.
    private var selfTile: some View {
        Group {
            if let selfTrack {
                SwiftUIVideoView(selfTrack, layoutMode: .fill, mirrorMode: .mirror)
            } else {
                ZStack {
                    Color.white.opacity(0.10)
                    Text(initials)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.85))
                }
            }
        }
        .frame(width: 104, height: 150)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(.white.opacity(0.15), lineWidth: 1))
    }

    private var reconnectingChip: some View {
        Label("Reconnecting…", systemImage: "wifi.exclamationmark")
            .font(.footnote.weight(.medium))
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(.black.opacity(0.6), in: Capsule())
    }

    private var initials: String {
        let parts = selfName.split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first }.map(String.init).joined()
        return letters.isEmpty ? "?" : letters.uppercased()
    }
}
