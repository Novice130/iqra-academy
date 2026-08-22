import Foundation
import Observation

/// The classes screen's state.
///
/// A family and a teacher read from different endpoints — `students/bookings`
/// versus `teachers/sessions` — but want the same screen, so the role is
/// resolved once here and the view never branches on it.
@Observable
@MainActor
final class ScheduleViewModel {
    private(set) var sessions: [ClassSession] = []
    private(set) var error: String?
    private(set) var loading = false

    /// Not stored here. The live class is polled by `LiveClassMonitor` so that
    /// it clears itself when the teacher ends the class — this screen used to
    /// hold the answer from whenever it last appeared, forever.
    private let liveMonitor = LiveClassMonitor.shared

    /// Staff are already in the room they are teaching; the ribbon is a
    /// student's way of finding a class that started early.
    var live: LiveClass? { user.role.isStaff ? nil : liveMonitor.live }

    private let user: CurrentUser

    init(user: CurrentUser) {
        self.user = user
    }

    /// Classes that have not finished, soonest first. A class that ran last
    /// week is history and belongs on a different screen than "what's next".
    var upcoming: [ClassSession] {
        let cutoff = Date.now.addingTimeInterval(-60 * 60)
        return sessions
            .filter { $0.scheduledEnd > cutoff && $0.status != .cancelled }
            .sorted { $0.scheduledStart < $1.scheduledStart }
    }

    /// Grouped by the *viewer's* day. Class times are stored as instants, so a
    /// 9pm Kolkata class is a different calendar day to a family in Chicago
    /// than to the teacher — grouping on the device's own calendar is what
    /// makes each of them see it under the day they experience.
    var byDay: [(day: Date, classes: [ClassSession])] {
        let calendar = Calendar.current
        let groups = Dictionary(grouping: upcoming) { calendar.startOfDay(for: $0.scheduledStart) }
        return groups
            .map { (day: $0.key, classes: $0.value.sorted { $0.scheduledStart < $1.scheduledStart }) }
            .sorted { $0.day < $1.day }
    }

    func load(session: AppSession) async {
        loading = sessions.isEmpty
        error = nil
        if !user.role.isStaff {
            // Ahead of the list, and on its own: pairing the two in one
            // `try await` meant a bookings failure skipped the live answer.
            await liveMonitor.refreshNow()
        }
        do {
            if user.role.isStaff {
                sessions = try await APIClient.shared.teacherSessions()
            } else {
                sessions = try await APIClient.shared.studentBookings().bookings.map(\.session)
            }
        } catch APIError.unauthorized {
            session.sessionExpired()
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}
