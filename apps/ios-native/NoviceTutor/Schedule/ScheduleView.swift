import SwiftUI

struct ScheduleView: View {
    let user: CurrentUser

    @Environment(AppSession.self) private var session
    @State private var model: ScheduleViewModel
    @State private var joining: ClassSession?

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
            // A class that started while the app was closed only shows up if
            // the screen asks again on return.
            .task(id: joining?.id) { }
        }
        .fullScreenCover(item: $joining) { classSession in
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
                Button("Join", action: join)
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.accent)
            } else if classSession.status == .cancelled {
                Text("Cancelled").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}
