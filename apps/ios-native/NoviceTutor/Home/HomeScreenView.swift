import SwiftUI

/// Dedicated Home Screen for students and teachers.
///
/// Features a greeting, active live classroom hero card, learning progress,
/// weekly streak tracker, and quick shortcuts.
struct HomeScreenView: View {
    let user: CurrentUser
    var onNavigateToSchedule: () -> Void = {}

    /// The live card is driven by the shared poller, not by this screen's own
    /// one-shot load: it has to disappear on its own when the teacher ends the
    /// class, without anyone touching the phone.
    @State private var liveMonitor = LiveClassMonitor.shared
    @State private var upcomingSessions: [ClassSession] = []
    @State private var loading = false
    @State private var joining: ClassSession?
    @State private var isLivePulsing = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // 1. Welcome Greeting Header
                    greetingHeader

                    // 2. Live Class Banner (if live) or Next Class Card
                    if let live = liveMonitor.live {
                        liveHeroCard(live)
                    } else if let nextSession = upcomingSessions.first {
                        nextClassCard(nextSession)
                    }

                    // 3. Quran Learning Progress Card
                    learningProgressCard

                    // 4. Weekly Learning Streak Card
                    weeklyStreakCard

                    // 5. Quick Actions Grid
                    quickActionsGrid
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 16)
            }
            .background(Color(uiColor: .systemGroupedBackground).ignoresSafeArea())
            .navigationTitle("Home")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        AccountView(user: user)
                    } label: {
                        userAvatarSmall
                    }
                }
            }
            .refreshable {
                await loadHomeData()
            }
            .task {
                await loadHomeData()
            }
            .fullScreenCover(item: $joining, onDismiss: {
                Task { await loadHomeData() }
            }) { classSession in
                CallScreen(classSession: classSession)
            }
        }
    }

    // MARK: - Components

    private var greetingHeader: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                Text(greetingTimeText)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Text(user.name ?? "Student")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.primary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: "flame.fill")
                        .foregroundStyle(.orange)
                    Text("5 Day")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.primary)
                }
                Text("Streak")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color(uiColor: .secondarySystemGroupedBackground))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(Color.orange.opacity(0.2), lineWidth: 1)
                    }
            }
        }
        .padding(.top, 4)
    }

    private func liveHeroCard(_ live: LiveClass) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Circle()
                    .fill(Theme.live)
                    .frame(width: 10, height: 10)
                    .scaleEffect(isLivePulsing ? 1.4 : 1.0)
                    .opacity(isLivePulsing ? 0.6 : 1.0)

                Text("CLASS IN PROGRESS")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Theme.live)
                    .tracking(0.5)

                Spacer()

                Text("LIVE")
                    .font(.caption2.weight(.heavy))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Theme.liveGradient, in: Capsule())
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(live.title ?? "Your Quran Class")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.primary)

                if !live.teacherName.isEmpty {
                    Text("with Ustadh \(live.teacherName)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            Button {
                Theme.haptic(.medium)
                joining = ClassSession(
                    id: live.sessionId,
                    title: live.title,
                    type: "INDIVIDUAL",
                    status: .inProgress,
                    scheduledStart: live.startedAt ?? .now,
                    scheduledEnd: (live.startedAt ?? .now).addingTimeInterval(30 * 60),
                    teacher: ClassSession.Teacher(name: live.teacherName)
                )
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "video.fill")
                    Text("Join Classroom Now")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity, minHeight: 46)
                .foregroundStyle(.white)
                .background(Theme.liveGradient, in: RoundedRectangle(cornerRadius: Theme.buttonRadius, style: .continuous))
                .shadow(color: Theme.live.opacity(0.35), radius: 8, y: 3)
            }
        }
        .modernCardStyle(highlighted: true)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
                isLivePulsing = true
            }
        }
    }

    private func nextClassCard(_ session: ClassSession) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Upcoming Class", systemImage: "clock.badge.checkmark")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.accent)

                Spacer()

                Text(session.scheduledStart, format: .dateTime.weekday(.abbreviated).hour().minute())
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color(uiColor: .tertiarySystemGroupedBackground), in: Capsule())
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(session.displayTitle)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.primary)

                if let teacherName = session.teacher?.name {
                    Text("Teacher: \(teacherName)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            if session.isJoinable() {
                Button {
                    Theme.haptic(.medium)
                    joining = session
                } label: {
                    Text("Join Class")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .foregroundStyle(.white)
                        .background(Theme.accentGradient, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
            }
        }
        .modernCardStyle()
    }

    private var learningProgressCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("MY LEARNING TRACK")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.secondary)
                        .tracking(0.5)

                    Text("Noorani Qaida & Tajweed")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(.primary)
                }

                Spacer()

                ZStack {
                    Circle()
                        .fill(Theme.accent.opacity(0.12))
                        .frame(width: 44, height: 44)

                    Image(systemName: "book.pages.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(Theme.accent)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Lesson 4: Harakaat & Tanween")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                    Spacer()
                    Text("75%")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Theme.accent)
                }

                // Progress Bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(Color(uiColor: .tertiarySystemGroupedBackground))
                            .frame(height: 8)

                        Capsule()
                            .fill(Theme.accentGradient)
                            .frame(width: geo.size.width * 0.75, height: 8)
                    }
                }
                .frame(height: 8)
            }
        }
        .modernCardStyle()
    }

    private var weeklyStreakCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Weekly Activity")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)

                Spacer()

                Text("4 / 5 Lessons")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 0) {
                ForEach(["M", "T", "W", "T", "F", "S", "S"], id: \.self) { day in
                    let isCompleted = day == "M" || day == "T" || day == "W" || day == "F"
                    VStack(spacing: 6) {
                        Text(day)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.secondary)

                        Circle()
                            .fill(isCompleted ? Theme.accent : Color(uiColor: .tertiarySystemGroupedBackground))
                            .frame(width: 32, height: 32)
                            .overlay {
                                if isCompleted {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundStyle(.white)
                                }
                            }
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .modernCardStyle()
    }

    private var quickActionsGrid: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Quick Actions")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                quickActionButton(
                    title: "Schedule",
                    subtitle: "View calendar",
                    icon: "calendar",
                    color: Theme.accent,
                    action: onNavigateToSchedule
                )

                quickActionButton(
                    title: "Mushaf",
                    subtitle: "Quran Reader",
                    icon: "book.fill",
                    color: Color(red: 0.15, green: 0.65, blue: 0.55),
                    action: {}
                )

                quickActionButton(
                    title: "Attendance",
                    subtitle: "100% On-time",
                    icon: "chart.bar.fill",
                    color: Color.orange,
                    action: {}
                )

                quickActionButton(
                    title: "Teacher",
                    subtitle: "Send note",
                    icon: "message.fill",
                    color: Color(red: 0.45, green: 0.35, blue: 0.85),
                    action: {}
                )
            }
        }
    }

    private func quickActionButton(
        title: String,
        subtitle: String,
        icon: String,
        color: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: {
            Theme.haptic(.light)
            action()
        }) {
            VStack(alignment: .leading, spacing: 10) {
                ZStack {
                    Circle()
                        .fill(color.opacity(0.12))
                        .frame(width: 38, height: 38)

                    Image(systemName: icon)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(color)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)

                    Text(subtitle)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .modernCardStyle()
        }
        .buttonStyle(.plain)
    }

    private var userAvatarSmall: some View {
        ZStack {
            Circle()
                .fill(Theme.accentGradient)
                .frame(width: 34, height: 34)

            Text(userInitials)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.white)
        }
    }

    private var userInitials: String {
        let parts = (user.name ?? "U").split(separator: " ")
        if parts.count >= 2 {
            return "\(parts[0].prefix(1))\(parts[1].prefix(1))".uppercased()
        }
        return String((user.name ?? "U").prefix(1)).uppercased()
    }

    private var greetingTimeText: String {
        let hour = Calendar.current.component(.hour, from: Date())
        if hour < 12 { return "Good morning," }
        if hour < 17 { return "Good afternoon," }
        return "Good evening,"
    }

    // MARK: - Actions

    /// Bookings only. The live class is the monitor's job, and deliberately not
    /// awaited alongside these: the two used to share one `try await`, so a
    /// bookings request that failed left a finished class advertised on screen.
    private func loadHomeData() async {
        loading = true
        defer { loading = false }
        await liveMonitor.refreshNow()
        do {
            let sessions = user.role == .student
                ? try await APIClient.shared.studentBookings().bookings.map { $0.session }
                : try await APIClient.shared.teacherSessions()
            self.upcomingSessions = sessions.filter { $0.status == .scheduled || $0.status == .inProgress }
        } catch {
            // Degrades gracefully — the classes list keeps whatever it had.
        }
    }
}
