import SwiftUI

/// The few colours and shapes the app shares.
///
/// Deliberately small. A design system that names every spacing value gets
/// out of date faster than it gets used; these are the ones that would
/// otherwise be typed as literals in ten places and drift apart.
enum Theme {
    /// The call screen and the launch screen are near-black, so the rest of
    /// the app is built to sit next to them rather than fight them.
    static let ink = Color(red: 0.04, green: 0.04, blue: 0.04)
    static let accent = Color(red: 0.16, green: 0.55, blue: 0.98)
    static let live = Color(red: 0.20, green: 0.79, blue: 0.54)

    static let cardRadius: CGFloat = 16
}

extension View {
    /// A card. One definition so every list row has the same edges.
    func cardStyle() -> some View {
        self
            .padding(16)
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: Theme.cardRadius))
    }
}
