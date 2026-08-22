import SwiftUI

/// Modern Public Home Screen shown to unauthenticated users and after sign-out.
///
/// Features a branded hero, interactive "Sign In to Classroom" tile card,
/// Quran learning tracks, academy highlights, and quick debug access.
struct PublicHomeScreenView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.colorScheme) private var colorScheme

    @State private var showingSignIn = false
    @State private var showingSignUp = false
    @State private var selectedTrackIndex = 0

    var body: some View {
        ZStack {
            // Adaptive ambient background
            Color(uiColor: .systemBackground).ignoresSafeArea()

            if colorScheme == .dark {
                Theme.heroMeshDark.ignoresSafeArea()
            } else {
                Theme.heroMeshLight.ignoresSafeArea()
            }

            ScrollView(showsIndicators: false) {
                VStack(spacing: 28) {
                    // Header / Brand
                    brandHeader

                    // Modern Login / Welcome Tile
                    loginHeroTile

                    // Quran Learning Tracks Showcase
                    learningTracksSection

                    // Academy Highlights
                    featuresGrid

                    // Footer
                    footerSection
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 40)
            }
        }
        .sheet(isPresented: $showingSignIn) {
            SignInView()
        }
    }

    // MARK: - Subviews

    private var brandHeader: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Theme.accentGradient)
                    .frame(width: 76, height: 76)
                    .shadow(color: Theme.accent.opacity(0.35), radius: 18, y: 6)

                Image(systemName: "book.pages.fill")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(.white)
            }

            VStack(spacing: 4) {
                Text("Novice Tutor")
                    .font(.system(size: 28, weight: .bold, design: .rounded))

                Text("Online Quran & Tajweed Academy")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.top, 8)
    }

    /// The prominent, modern Login Tile Card
    private var loginHeroTile: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(Theme.accent.opacity(0.18))
                        .frame(width: 48, height: 48)

                    Image(systemName: "person.crop.circle.badge.checkmark")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text("Welcome Back")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(.primary)

                    Text("Continue your Quran journey")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                // Live status dot
                HStack(spacing: 5) {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 7, height: 7)
                    Text("Classes Live")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.green)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.green.opacity(0.12), in: Capsule())
            }

            Text("Sign in to join live 1-on-1 classrooms with certified tutors, track your Tajweed progress, and manage your weekly schedule.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            // Primary Action Button
            Button {
                Theme.haptic(.medium)
                showingSignIn = true
            } label: {
                HStack {
                    Text("Sign In to Classroom")
                        .font(.headline.weight(.semibold))
                    Spacer()
                    Image(systemName: "arrow.right.circle.fill")
                        .font(.title3)
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .padding(.horizontal, 18)
                .background(Theme.accentGradient, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .shadow(color: Theme.accent.opacity(0.3), radius: 10, y: 4)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .simultaneousGesture(TapGesture().onEnded {
                Theme.haptic(.medium)
                showingSignIn = true
            })

            #if DEBUG
            // Debug quick-fill shortcuts. Hidden unless this machine has been
            // told the password — see `AppConfig.devTestPassword`, which is
            // where it lives now instead of in the source.
            if let testPassword = AppConfig.devTestPassword {
                VStack(alignment: .leading, spacing: 8) {
                    Text("QUICK TEST SIGN-IN")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.secondary.opacity(0.8))
                        .tracking(1)

                    // One action per button. These each carried a duplicate
                    // `simultaneousGesture` running the same sign-in, so every
                    // tap posted to /api/auth/sign-in/email twice.
                    HStack(spacing: 8) {
                        Button("🧪 Student 1") {
                            Theme.haptic(.light)
                            Task { @MainActor in
                                try? await session.signIn(
                                    email: AppConfig.devStudentEmail,
                                    password: testPassword
                                )
                            }
                        }
                        .font(.caption2.weight(.semibold))
                        .buttonStyle(.borderedProminent)
                        .tint(Theme.accent.opacity(0.85))

                        Button("🧪 Teacher") {
                            Theme.haptic(.light)
                            Task { @MainActor in
                                try? await session.signIn(
                                    email: AppConfig.devTeacherEmail,
                                    password: testPassword
                                )
                            }
                        }
                        .font(.caption2.weight(.semibold))
                        .buttonStyle(.bordered)
                        .tint(.secondary)
                    }
                }
                .padding(.top, 4)
            }
            #endif
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Color(uiColor: .secondarySystemBackground).opacity(colorScheme == .dark ? 0.75 : 0.95))
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(Theme.accent.opacity(colorScheme == .dark ? 0.35 : 0.25), lineWidth: 1.5)
                )
                .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.4 : 0.08), radius: 16, y: 8)
        )
    }

    /// Quran Learning Tracks Showcase
    private var learningTracksSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("LEARNING TRACKS")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                    .tracking(1.2)
                Spacer()
            }

            VStack(spacing: 12) {
                trackCard(
                    icon: "character.book.closed.fill",
                    color: .blue,
                    title: "Noorani Qaida",
                    subtitle: "Arabic letters, Makharij & foundational phonetic pronunciation."
                )

                trackCard(
                    icon: "sparkles",
                    color: .purple,
                    title: "Tajweed & Fluent Recitation",
                    subtitle: "Rules of Noon Sakinah, Madd, Ghunnah & precise stopping signs."
                )

                trackCard(
                    icon: "bookmark.fill",
                    color: .green,
                    title: "Quran Memorization (Hifz)",
                    subtitle: "Structured daily Sabaq & Sabqi revision with experienced Huffaz."
                )

                trackCard(
                    icon: "moon.stars.fill",
                    color: .orange,
                    title: "Islamic Studies & Duas",
                    subtitle: "Salah practicals, daily Sunnah supplications & 40 Hadith stories."
                )
            }
        }
    }

    private func trackCard(icon: String, color: Color, title: String, subtitle: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(color.opacity(0.16))
                    .frame(width: 42, height: 42)

                Image(systemName: icon)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(color)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)

                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer()
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(uiColor: .secondarySystemBackground).opacity(colorScheme == .dark ? 0.6 : 0.9))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(Color.white.opacity(colorScheme == .dark ? 0.08 : 0.04), lineWidth: 1)
                )
        )
    }

    /// Highlights Grid
    private var featuresGrid: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("WHY NOVICE TUTOR")
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
                .tracking(1.2)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                featurePill(icon: "video.fill", title: "1-on-1 Live Class", desc: "Interactive WebRTC video")
                featurePill(icon: "checkmark.seal.fill", title: "Certified Tutors", desc: "Vetted Quran scholars")
                featurePill(icon: "flame.fill", title: "Streak & Badges", desc: "Daily motivation")
                featurePill(icon: "calendar", title: "Flexible Time", desc: "Reschedule anytime")
            }
        }
    }

    private func featurePill(icon: String, title: String, desc: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: icon)
                .font(.headline)
                .foregroundStyle(Theme.accent)

            Text(title)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.primary)

            Text(desc)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color(uiColor: .secondarySystemBackground).opacity(colorScheme == .dark ? 0.5 : 0.8))
        )
    }

    private var footerSection: some View {
        VStack(spacing: 8) {
            Text("Novice Tutor • Iqra Quran Academy")
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary.opacity(0.8))
        }
        .padding(.top, 8)
    }
}
