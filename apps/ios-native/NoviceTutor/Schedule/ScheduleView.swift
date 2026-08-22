import SwiftUI

struct ScheduleView: View {
    let user: CurrentUser

    @Environment(AppSession.self) private var session
    @Environment(\.colorScheme) private var colorScheme
    @State private var model: ScheduleViewModel
    @State private var joining: ClassSession?
    @State private var push = PushService.shared

    init(user: CurrentUser) {
        self.user = user
        _model = State(initialValue: ScheduleViewModel(user: user))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color(uiColor: .systemGroupedBackground).ignoresSafeArea()

                Group {
                    if model.loading && model.sessions.isEmpty {
                        VStack(spacing: 16) {
                            ProgressView()
                                .controlSize(.large)
                                .tint(Theme.accent)
                            Text("Loading your classes…")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if model.byDay.isEmpty && model.live == nil {
                        emptyState
                    } else {
                        contentList
                    }
                }
            }
            .navigationTitle(user.role.isStaff ? "Your Classes" : "Classes")
            .refreshable {
                Theme.haptic(.light)
                await model.load(session: session)
            }
            .task { await model.load(session: session) }
            .task(id: push.pendingSessionId) { await openTappedNotification() }
        }
        .fullScreenCover(item: $joining, onDismiss: {
            Task { await model.load(session: session) }
        }) { classSession in
            CallScreen(classSession: classSession)
        }
    }

    // MARK: - List Content

    private var contentList: some View {
        ScrollView {
            LazyVStack(spacing: 20) {
                // 1. Live Now Hero Card (if teacher is in session)
                if let live = model.live {
                    LiveHeroCard(live: live) {
                        Theme.haptic(.medium)
                        joining = ClassSession(
                            id: live.sessionId,
                            title: live.title,
                            type: "INDIVIDUAL",
                            status: .inProgress,
                            scheduledStart: live.startedAt ?? .now,
                            scheduledEnd: (live.startedAt ?? .now).addingTimeInterval(30 * 60),
                            teacher: .init(name: live.teacherName)
                        )
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                }

                // 2. Connectivity / Sync warning
                if let error = model.error {
                    HStack(spacing: 10) {
                        Image(systemName: "wifi.exclamationmark")
                            .foregroundStyle(.orange)
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        Spacer()
                    }
                    .padding(14)
                    .background {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Color.orange.opacity(0.1))
                    }
                    .padding(.horizontal, 16)
                }

                // 3. Classes Grouped By Day
                ForEach(model.byDay, id: \.day) { group in
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 8) {
                            Text(dayLabel(group.day))
                                .font(.title3.weight(.bold))
                                .foregroundStyle(.primary)

                            if Calendar.current.isDateInToday(group.day) {
                                Text("TODAY")
                                    .font(.caption2.weight(.heavy))
                                    .foregroundStyle(Theme.accent)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(Theme.accent.opacity(0.12), in: Capsule())
                            }
                        }
                        .padding(.horizontal, 20)

                        VStack(spacing: 12) {
                            ForEach(group.classes) { classSession in
                                ModernClassCard(classSession: classSession) {
                                    Theme.haptic(.medium)
                                    joining = classSession
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
            }
            .padding(.vertical, 12)
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(Theme.accent.opacity(0.12))
                    .frame(width: 84, height: 84)

                Image(systemName: "calendar.badge.clock")
                    .font(.system(size: 38))
                    .foregroundStyle(Theme.accent)
            }

            VStack(spacing: 6) {
                Text("No Classes Scheduled")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.primary)

                Text(user.role.isStaff
                     ? "Classes you are teaching will appear here automatically."
                     : "Once your lessons are booked, they will show up here.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.vertical, 60)
    }

    // MARK: - Notification Handler

    private func openTappedNotification() async {
        guard let sessionId = push.pendingSessionId else { return }
        _ = push.takePendingSessionId()

        if !model.sessions.contains(where: { $0.id == sessionId }) {
            await model.load(session: session)
        }
        if let match = model.sessions.first(where: { $0.id == sessionId }) {
            joining = match
        }
    }

    private func dayLabel(_ day: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(day) { return "Today" }
        if calendar.isDateInTomorrow(day) { return "Tomorrow" }
        return day.formatted(.dateTime.weekday(.wide).month(.abbreviated).day())
    }
}

// MARK: - Hero Live Card

private struct LiveHeroCard: View {
    let live: LiveClass
    let join: () -> Void

    @State private var isPulsing = false

    var body: some View {
        VStack(spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                // Live indicator radar
                ZStack {
                    Circle()
                        .stroke(Theme.live.opacity(isPulsing ? 0 : 0.6), lineWidth: 6)
                        .scaleEffect(isPulsing ? 1.6 : 1.0)
                        .frame(width: 14, height: 14)

                    Circle()
                        .fill(Theme.live)
                        .frame(width: 14, height: 14)
                }
                .padding(.top, 4)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text("LIVE CLASSROOM")
                            .font(.caption2.weight(.heavy))
                            .foregroundStyle(Theme.live)
                        Spacer()
                    }

                    Text(live.teacherName)
                        .font(.headline.weight(.bold))
                        .foregroundStyle(.primary)

                    Text(live.title ?? "Lesson in progress")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }

            Button(action: join) {
                HStack(spacing: 8) {
                    Image(systemName: "video.fill")
                        .font(.subheadline.weight(.semibold))
                    Text("Join Class Now")
                        .font(.headline.weight(.bold))
                }
                .frame(maxWidth: .infinity, minHeight: 48)
                .foregroundStyle(.white)
                .background(Theme.liveGradient, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .shadow(color: Theme.live.opacity(0.35), radius: 8, y: 4)
            }
        }
        .padding(18)
        .background {
            RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                .fill(Color(uiColor: .secondarySystemGroupedBackground))
                .overlay {
                    RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                        .stroke(Theme.live.opacity(0.4), lineWidth: 1.5)
                }
                .shadow(color: Theme.live.opacity(0.12), radius: 16, y: 6)
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: false)) {
                isPulsing = true
            }
        }
    }
}

// MARK: - Modern Class Card

private struct ModernClassCard: View {
    let classSession: ClassSession
    let join: () -> Void

    var body: some View {
        Button(action: {
            if classSession.isJoinable() { join() }
        }) {
            HStack(spacing: 16) {
                // Time Column
                VStack(alignment: .center, spacing: 2) {
                    Text(classSession.scheduledStart.formatted(date: .omitted, time: .shortened))
                        .font(.system(.subheadline, design: .rounded).weight(.bold))
                        .foregroundStyle(.primary)
                        .monospacedDigit()

                    Text("Class")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.secondary)
                }
                .frame(width: 64)
                .padding(.vertical, 8)
                .background {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color(uiColor: .tertiarySystemGroupedBackground))
                }

                // Details
                VStack(alignment: .leading, spacing: 4) {
                    Text(classSession.displayTitle)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)

                    if let teacher = classSession.teacher?.name {
                        HStack(spacing: 5) {
                            Image(systemName: "person.fill")
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.accent)

                            Text(teacher)
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Spacer()

                // Action / Status Pill
                if classSession.isJoinable() {
                    HStack(spacing: 4) {
                        Text("Join")
                            .font(.subheadline.weight(.bold))
                        Image(systemName: "arrow.right")
                            .font(.caption.weight(.bold))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Theme.accentGradient, in: Capsule())
                    .shadow(color: Theme.accent.opacity(0.3), radius: 6, y: 3)
                } else if classSession.status == .cancelled {
                    Text("Cancelled")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Color.secondary.opacity(0.12), in: Capsule())
                } else {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Color.secondary.opacity(0.4))
                }
            }
            .padding(14)
            .background {
                RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                    .fill(Color(uiColor: .secondarySystemGroupedBackground))
                    .overlay {
                        RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                            .stroke(
                                classSession.isJoinable() ? Theme.accent.opacity(0.3) : Color.primary.opacity(0.04),
                                lineWidth: 1
                            )
                    }
                    .shadow(color: Color.black.opacity(0.03), radius: 8, y: 3)
            }
        }
        .buttonStyle(.plain)
        .disabled(!classSession.isJoinable())
    }
}
