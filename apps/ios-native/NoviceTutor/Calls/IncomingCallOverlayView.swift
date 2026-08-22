import SwiftUI

/// Fullscreen modern FaceTime / iOS incoming video call interface.
struct IncomingCallOverlayView: View {
    let call: IncomingCall
    let onAccept: () -> Void
    let onDecline: () -> Void

    @State private var isPulsing = false
    @State private var rippleScale: CGFloat = 1.0
    @State private var rippleOpacity: Double = 0.6

    var body: some View {
        ZStack {
            // Dark Frosted Background
            Color.black.opacity(0.88).ignoresSafeArea()
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Top Brand Tag
                HStack(spacing: 8) {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 8, height: 8)
                        .scaleEffect(isPulsing ? 1.3 : 0.9)
                    Text("NOVICE TUTOR VIDEO CLASS")
                        .font(.caption.weight(.bold))
                        .tracking(1.2)
                        .foregroundStyle(.white.opacity(0.8))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(.white.opacity(0.1), in: Capsule())
                .padding(.top, 60)

                Spacer()

                // Caller Avatar with Ripple Rings
                ZStack {
                    // Outer Ripple Rings
                    Circle()
                        .stroke(Theme.accent.opacity(rippleOpacity * 0.4), lineWidth: 2)
                        .frame(width: 190, height: 190)
                        .scaleEffect(rippleScale)

                    Circle()
                        .stroke(Theme.accent.opacity(rippleOpacity * 0.7), lineWidth: 2)
                        .frame(width: 150, height: 150)
                        .scaleEffect(rippleScale * 0.9)

                    // Avatar Circle
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color(red: 0.15, green: 0.45, blue: 0.85), Color(red: 0.08, green: 0.25, blue: 0.55)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 120, height: 120)
                        .shadow(color: Color.blue.opacity(0.4), radius: 24, y: 8)

                    Text(call.callerName.prefix(1).uppercased())
                        .font(.system(size: 48, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                }
                .padding(.bottom, 24)

                // Caller Details
                VStack(spacing: 8) {
                    Text(call.callerName)
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)

                    Text("Incoming Quran Lesson…")
                        .font(.title3.weight(.medium))
                        .foregroundStyle(.white.opacity(0.75))
                }
                .padding(.horizontal, 24)

                Spacer()

                // Bottom Call Controls (Decline & Accept)
                HStack(spacing: 64) {
                    // Decline Button
                    VStack(spacing: 12) {
                        Button {
                            Theme.haptic(.medium)
                            onDecline()
                        } label: {
                            ZStack {
                                Circle()
                                    .fill(Color.red)
                                    .frame(width: 76, height: 76)
                                    .shadow(color: Color.red.opacity(0.4), radius: 16, y: 6)

                                Image(systemName: "phone.down.fill")
                                    .font(.system(size: 30, weight: .bold))
                                    .foregroundStyle(.white)
                            }
                        }

                        Text("Decline")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.8))
                    }

                    // Accept Button
                    VStack(spacing: 12) {
                        Button {
                            Theme.hapticNotification(.success)
                            onAccept()
                        } label: {
                            ZStack {
                                Circle()
                                    .fill(Color.green)
                                    .frame(width: 76, height: 76)
                                    .shadow(color: Color.green.opacity(0.4), radius: 16, y: 6)

                                Image(systemName: "phone.fill")
                                    .font(.system(size: 30, weight: .bold))
                                    .foregroundStyle(.white)
                            }
                        }

                        Text("Accept")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.8))
                    }
                }
                .padding(.bottom, 50)
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
                isPulsing = true
            }
            withAnimation(.easeOut(duration: 1.8).repeatForever(autoreverses: false)) {
                rippleScale = 1.35
                rippleOpacity = 0.0
            }
        }
    }
}
