import SwiftUI

struct ScheduleView: View {
    let user: CurrentUser

    @Environment(AppSession.self) private var session
    @State private var model: ScheduleViewModel
    @State private var joining: ClassSession?
    @State private var push = PushService.shared

    init(user: CurrentUser) {
        self.user = user
        _model = State(initialValue: ScheduleViewModel(user: user))
    }

    var body: some View {
        NavigationStack {
            Group {
                if model.loading {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if model.byDay.isEmpty {
                    emptyState
                } else {
                    list
                }
            }
            .navigationTitle(user.role.isStaff ? "Your classes" : "Classes")
            .refreshable { await model.load(session: session) }
            .task { await model.load(session: session) }
            // A tapped notification can land before this screen exists, so the
            // class it asked for is parked and collected here rather than
            // pushed at whatever happens to be on screen.
            .task(id: push.pendingSessionId) { await openTappedNotification() }
        }
        .fullScreenCover(item: $joining, onDismiss: {
            // Leaving a class changes what the list should say — the class is
            // now in progress, or over. Asking again on the way back is the
            // only thing that makes the row agree with what just happened.
            Task { await model.load(session: session) }
        }) { classSession in
            CallScreen(classSession: classSession)
        }
    }

    private var list: some View {
        List {
            if let live = model.live {
                Section {
                    LiveNowRow(live: live) {
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
                }
            }

            if let error = model.error {
                Section {
                    Label(error, systemImage: "wifi.exclamationmark")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            ForEach(model.byDay, id: \.day) { group in
                Section(dayLabel(group.day)) {
                    ForEach(group.classes) { classSession in
                        ClassRow(classSession: classSession) { joining = classSession }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No classes yet", systemImage: "calendar")
        } description: {
            Text(user.role.isStaff
                 ? "Classes you are teaching will appear here."
                 : "Once your classes are booked they'll show up here.")
        }
    }

    /// Opens the class a notification named.
    ///
    /// The list is reloaded first: the push is very often the *reason* this
    /// class is now joinable, so the row for it may not be in hand yet. If it
    /// still is not there — an old notification, a cancelled class — nothing
    /// happens, which is better than opening a call screen that can only fail.
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

    /// "Today" and "Tomorrow" carry more than a date does, and they are the
    /// two a person is actually looking for.
    private func dayLabel(_ day: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(day) { return "Today" }
        if calendar.isDateInTomorrow(day) { return "Tomorrow" }
        return day.formatted(.dateTime.weekday(.wide).month().day())
    }
}

/// A class the teacher is already in. Rendered above everything because it is
/// the only row with a deadline attached to it.
private struct LiveNowRow: View {
    let live: LiveClass
    let join: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(Theme.live)
                .frame(width: 10, height: 10)
                .overlay(Circle().stroke(Theme.live.opacity(0.35), lineWidth: 6))

            VStack(alignment: .leading, spacing: 2) {
                Text("\(live.teacherName) is in class now")
                    .font(.subheadline.weight(.semibold))
                Text(live.title ?? "Your class has started")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button("Join", action: join)
                .buttonStyle(.borderedProminent)
                .tint(Theme.live)
        }
        .padding(.vertical, 4)
    }
}

private struct ClassRow: View {
    let classSession: ClassSession
    let join: () -> Void

    var body: some View {
        // The whole row is the target, not the pill.
        //
        // The pill on its own was 34pt tall — under Apple's 44pt minimum, and
        // a poor target on the phone in a child's hand this is actually used
        // on. A row-sized target is also what the rest of iOS does with a list
        // of things you open.
        Group {
            if classSession.isJoinable() {
                Button(action: join) { content }
                    .buttonStyle(.plain)
            } else {
                content
            }
        }
        .padding(.vertical, 4)
    }

    private var content: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(classSession.scheduledStart.formatted(date: .omitted, time: .shortened))
                    .font(.headline)
                    .monospacedDigit()
                Text(classSession.displayTitle)
                    .font(.subheadline)
                if let teacher = classSession.teacher?.name {
                    Text(teacher)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            if classSession.isJoinable() {
                Text("Join")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .frame(height: 40)
                    .background(Theme.accent, in: Capsule())
            } else if classSession.status == .cancelled {
                Text("Cancelled").font(.caption).foregroundStyle(.secondary)
            }
        }
        // So the gap either side of the pill is part of the target too.
        .contentShape(Rectangle())
    }
}
