import LiveKit
import SwiftUI

/// The class itself, edge to edge.
///
/// Two layouts, chosen by the person watching and never synced: **speaker**,
/// which is one full-bleed video with your own tile floating over it, and
/// **grid**, which is everybody at once. A teacher opens on grid and a student
/// on speaker, because those are the things each of them came to look at.
///
/// A presentation overrides both: while somebody is sharing a screen, the
/// screen is the stage and the faces move to the strip.
struct CallStageView: View {
    let stage: CallController.Stage
    let people: [CallController.Person]
    let selfTrack: VideoTrack?
    let selfPerson: CallController.Person?
    let layout: CallController.Layout
    let waitingFor: String
    let isReconnecting: Bool
    /// How much room the control bar is taking at the bottom, so the floating
    /// tile can be dragged near it without ending up underneath it.
    let bottomInset: CGFloat
    let trackFor: (CallController.Person) -> VideoTrack?

    /// Which corner the floating tile is parked in. It always lands in one:
    /// a tile left mid-drag is a tile covering a face at an angle nobody chose.
    ///
    /// It starts at the bottom, not the top, because the top is where the
    /// prompts arrive — a host asking for a microphone, a guest knocking — and
    /// a tile parked under one of those is a tile nobody can see or drag.
    @State private var corner: Corner = .bottomTrailing
    @State private var drag: CGSize = .zero

    private enum Corner: CaseIterable {
        case topLeading, topTrailing, bottomLeading, bottomTrailing

        var alignment: Alignment {
            switch self {
            case .topLeading: return .topLeading
            case .topTrailing: return .topTrailing
            case .bottomLeading: return .bottomLeading
            case .bottomTrailing: return .bottomTrailing
            }
        }

        var unit: CGPoint {
            switch self {
            case .topLeading: return CGPoint(x: 0, y: 0)
            case .topTrailing: return CGPoint(x: 1, y: 0)
            case .bottomLeading: return CGPoint(x: 0, y: 1)
            case .bottomTrailing: return CGPoint(x: 1, y: 1)
            }
        }
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Theme.ink.ignoresSafeArea()

                content(in: proxy.size)
                    .opacity(isReconnecting ? 0.4 : 1)
                    .animation(.easeInOut(duration: 0.2), value: isReconnecting)

                if showsFloatingSelf {
                    floatingSelf(in: proxy.size)
                }

                if isReconnecting {
                    reconnectingChip
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                        .padding(.top, 12)
                }
            }
        }
        .ignoresSafeArea()
    }

    // MARK: - Stage

    @ViewBuilder
    private func content(in size: CGSize) -> some View {
        switch stage {
        case .screenShare(let track, let name):
            presentation(track, name: name, in: size)

        case .remote(let track, let name):
            if layout == .grid, people.count > 1 {
                grid(in: size)
            } else {
                speaker(track, name: name)
            }

        case .waitingForOthers:
            if layout == .grid, people.count > 1 {
                grid(in: size)
            } else {
                waiting
            }
        }
    }

    private func speaker(_ track: VideoTrack, name: String) -> some View {
        ZStack(alignment: .bottomLeading) {
            SwiftUIVideoView(track, layoutMode: .fill, mirrorMode: .off)
            nameChip(name)
                .padding(.leading, 20)
                .padding(.bottom, bottomInset + 16)
        }
    }

    /// A shared screen is letterboxed, never cropped: the whole point of it is
    /// the writing along the edges, and `.fill` is what cuts that off.
    private func presentation(_ track: VideoTrack, name: String, in size: CGSize) -> some View {
        VStack(spacing: 0) {
            ZStack(alignment: .topLeading) {
                Color.black
                SwiftUIVideoView(track, layoutMode: .fit, mirrorMode: .off)
                Label("\(name) is presenting", systemImage: "rectangle.inset.filled.on.rectangle")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.black.opacity(0.5), in: Capsule())
                    .padding(.leading, 16)
                    .padding(.top, 60)
            }

            if people.count > 1 {
                filmstrip
                    .frame(height: 96)
                    .padding(.bottom, bottomInset + 8)
            }
        }
    }

    private var filmstrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(people) { person in
                    ParticipantTile(person: person, track: trackFor(person), compact: true)
                        .frame(width: 128)
                }
            }
            .padding(.horizontal, 12)
        }
    }

    private func grid(in size: CGSize) -> some View {
        let columns = Self.columns(for: people.count, in: size)
        let spacing: CGFloat = 8
        let rows = Int(ceil(Double(people.count) / Double(columns)))
        // Tiles are sized rather than left to the grid so that four people fill
        // the screen instead of stacking into a scroll view nobody expects to
        // have to scroll during a lesson.
        let available = size.height - bottomInset - 88
        let tileHeight = max(120, (available - spacing * CGFloat(rows - 1)) / CGFloat(rows))

        return ScrollView {
            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: spacing), count: columns),
                spacing: spacing
            ) {
                ForEach(people) { person in
                    ParticipantTile(person: person, track: trackFor(person), compact: true)
                        .frame(height: tileHeight)
                }
            }
            .padding(.horizontal, 10)
            .padding(.top, 56)
            .padding(.bottom, bottomInset + 12)
        }
        .scrollBounceBehavior(.basedOnSize)
    }

    private var waiting: some View {
        VStack(spacing: 14) {
            ProgressView().controlSize(.large).tint(.white)
            Text("Waiting for \(waitingFor)…")
                .foregroundStyle(.white.opacity(0.75))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Your own tile

    /// Only in speaker view, and only when there is something behind it: in
    /// the grid you are already one of the tiles, and floating a second copy
    /// of yourself over yourself is just a smaller you covering somebody.
    private var showsFloatingSelf: Bool {
        guard layout == .speaker || people.count <= 1 else { return false }
        if case .waitingForOthers = stage, people.count <= 1 { return true }
        return true
    }

    private func floatingSelf(in size: CGSize) -> some View {
        let box = tileSize(in: size)
        let margin: CGFloat = 16
        let topInset: CGFloat = 56
        let bottom = bottomInset + 12

        let x = corner.unit.x == 0
            ? margin + box.width / 2
            : size.width - margin - box.width / 2
        let y = corner.unit.y == 0
            ? topInset + box.height / 2
            : size.height - bottom - box.height / 2

        return selfTile
            .frame(width: box.width, height: box.height)
            .position(x: x, y: y)
            .offset(drag)
            .gesture(
                DragGesture()
                    .onChanged { drag = $0.translation }
                    .onEnded { value in
                        let dropped = CGPoint(x: x + value.translation.width, y: y + value.translation.height)
                        corner = Self.nearestCorner(to: dropped, in: size)
                        drag = .zero
                        Theme.hapticSelection()
                    }
            )
            .animation(.spring(response: 0.32, dampingFraction: 0.82), value: corner)
            .animation(.interactiveSpring(), value: drag)
    }

    @ViewBuilder
    private var selfTile: some View {
        if let selfPerson {
            ParticipantTile(person: selfPerson, track: selfTrack, compact: true)
                .shadow(color: .black.opacity(0.35), radius: 10, y: 4)
        }
    }

    private func tileSize(in size: CGSize) -> CGSize {
        // Portrait video in a portrait phone, landscape in landscape — a
        // 9:16 tile in landscape is a letterboxed sliver.
        size.width > size.height ? CGSize(width: 180, height: 110) : CGSize(width: 108, height: 156)
    }

    private static func nearestCorner(to point: CGPoint, in size: CGSize) -> Corner {
        let leading = point.x < size.width / 2
        let top = point.y < size.height / 2
        switch (top, leading) {
        case (true, true): return .topLeading
        case (true, false): return .topTrailing
        case (false, true): return .bottomLeading
        case (false, false): return .bottomTrailing
        }
    }

    /// Landscape puts everybody in one row where it can: a phone on its side
    /// is 402pt tall, and a second row of tiles there is two rows of nothing.
    private static func columns(for count: Int, in size: CGSize) -> Int {
        guard count > 1 else { return 1 }
        let landscape = size.width > size.height
        return landscape ? min(count, 4) : 2
    }

    // MARK: - Bits

    private func nameChip(_ name: String) -> some View {
        Text(name)
            .font(.footnote.weight(.medium))
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(.black.opacity(0.45), in: Capsule())
    }

    private var reconnectingChip: some View {
        Label("Reconnecting…", systemImage: "wifi.exclamationmark")
            .font(.footnote.weight(.medium))
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(.black.opacity(0.6), in: Capsule())
    }
}
