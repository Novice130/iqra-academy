import Foundation

/// A failure with something to show a person.
///
/// The API answers errors as `{ error, message?, code? }` (see
/// `apps/web/src/lib/errors.ts`), and those strings are written for people —
/// "You've already had your trial class", not "422". Throwing them away and
/// showing "Request failed" instead is the single easiest way to make a
/// working backend feel broken, so the decoded message is what this carries.
enum APIError: LocalizedError {
    /// The session is gone or was never there. The UI signs the person out
    /// rather than showing this.
    case unauthorized
    /// A message the server wrote, safe to show as-is.
    case server(status: Int, message: String, code: String?)
    /// The request never reached the server.
    case transport(Error)
    /// A 200 whose body was not what this app expected — a bug, not a state.
    case decoding(Error)

    var errorDescription: String? {
        switch self {
        case .unauthorized:
            return "Your session has ended. Please sign in again."
        case .server(_, let message, _):
            return message
        case .transport:
            return "Can't reach Novice Tutor. Check your connection and try again."
        case .decoding:
            return "Something went wrong reading the response."
        }
    }

    /// Business rules the app reacts to rather than only reports.
    var code: String? {
        if case .server(_, _, let code) = self { return code }
        return nil
    }
}
