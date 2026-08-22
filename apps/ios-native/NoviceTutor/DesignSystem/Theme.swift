import SwiftUI
import UIKit

/// App appearance preference options.
enum AppAppearance: String, CaseIterable, Identifiable {
    case system = "system"
    case light = "light"
    case dark = "dark"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: return "System"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }

    var icon: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .light: return "sun.max.fill"
        case .dark: return "moon.stars.fill"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

/// The centralized design system for Novice Tutor.
enum Theme {
    // MARK: - Brand Colors

    /// Primary brand accent
    static let accent = Color(red: 0.14, green: 0.48, blue: 0.96)
    static let accentSecondary = Color(red: 0.32, green: 0.65, blue: 0.98)

    /// Live class glowing emerald
    static let live = Color(red: 0.13, green: 0.77, blue: 0.47)
    static let liveDark = Color(red: 0.06, green: 0.63, blue: 0.38)

    /// Deep immersive dark background for video calls and surfaces
    static let ink = Color(red: 0.06, green: 0.07, blue: 0.09)

    // MARK: - Gradients

    static let accentGradient = LinearGradient(
        colors: [accent, accentSecondary],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let liveGradient = LinearGradient(
        colors: [live, liveDark],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let cardGradientDark = LinearGradient(
        colors: [Color.white.opacity(0.06), Color.white.opacity(0.02)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// Clean, subtle slate/graphite depth without neon purple AI tint
    static let heroMeshDark = RadialGradient(
        gradient: Gradient(colors: [
            Color(red: 0.12, green: 0.18, blue: 0.28).opacity(0.45),
            Color(red: 0.08, green: 0.10, blue: 0.14).opacity(0.30),
            Color.clear
        ]),
        center: .top,
        startRadius: 20,
        endRadius: 420
    )

    static let heroMeshLight = RadialGradient(
        gradient: Gradient(colors: [
            accent.opacity(0.12),
            Color(red: 0.90, green: 0.94, blue: 0.98).opacity(0.40),
            Color.clear
        ]),
        center: .top,
        startRadius: 20,
        endRadius: 400
    )

    // MARK: - Dimensions & Radii

    static let cardRadius: CGFloat = 18
    static let buttonRadius: CGFloat = 14
    static let inputRadius: CGFloat = 14
    static let chipRadius: CGFloat = 10

    // MARK: - Haptics

    static func haptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .medium) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    static func hapticNotification(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        UINotificationFeedbackGenerator().notificationOccurred(type)
    }

    static func hapticSelection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }
}

// MARK: - View Modifiers

extension View {
    /// Applies modern card styling with continuous corners, subtle stroke, and soft shadow.
    func modernCardStyle(highlighted: Bool = false) -> some View {
        self
            .padding(16)
            .background {
                RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                    .fill(Color(uiColor: .secondarySystemGroupedBackground))
                    .overlay {
                        RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                            .stroke(
                                highlighted
                                    ? Theme.accent.opacity(0.4)
                                    : Color.primary.opacity(0.06),
                                lineWidth: highlighted ? 1.5 : 1
                            )
                    }
                    .shadow(
                        color: Color.black.opacity(0.04),
                        radius: 8,
                        x: 0,
                        y: 3
                    )
            }
    }

    /// Applies frosted glassmorphic card styling.
    func glassCardStyle() -> some View {
        self
            .padding(16)
            .background {
                RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay {
                        RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                            .stroke(Color.white.opacity(0.18), lineWidth: 1)
                    }
                    .shadow(
                        color: Color.black.opacity(0.08),
                        radius: 12,
                        x: 0,
                        y: 4
                    )
            }
    }

    /// Legacy compatibility helper
    func cardStyle() -> some View {
        modernCardStyle()
    }
}
