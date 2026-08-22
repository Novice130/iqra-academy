import XCTest

/// The live-class card must go away on its own.
///
/// This is the bug the whole adaptive-poll change exists to close, and it is
/// the one thing a build cannot prove: the card looked identical whether it
/// was correct or whether it was a frozen answer from twenty minutes ago. So
/// the test ends the class from *outside* the app — a real HTTP call, as the
/// teacher — and then does nothing at all. No tap, no pull-to-refresh, no
/// backgrounding. If the card is gone at the end, the phone worked it out by
/// itself, which is the entire requirement.
///
/// Requires, like the sign-in tests, a server on `NT_ORIGIN` with the standing
/// test accounts and `NT_PASSWORD` set. Also requires the class to be live at
/// the start: `npx tsx apps/web/scripts/start-test-meeting.ts`.
final class LiveRibbonUITests: XCTestCase {
    private var origin: String {
        ProcessInfo.processInfo.environment["NT_ORIGIN"] ?? "http://localhost:3000"
    }
    private var studentEmail: String {
        ProcessInfo.processInfo.environment["NT_EMAIL"] ?? "teststudent1@test.com"
    }
    private var teacherEmail: String {
        ProcessInfo.processInfo.environment["NT_TEACHER_EMAIL"] ?? "testteacher@test.com"
    }
    private var sessionId: String {
        ProcessInfo.processInfo.environment["NT_SESSION_ID"] ?? "testclass_group"
    }
    private var password: String? {
        ProcessInfo.processInfo.environment["NT_PASSWORD"]
    }

    override func setUp() {
        continueAfterFailure = false
    }

    func testLiveCardDisappearsWhenTheTeacherEndsTheClass() throws {
        try XCTSkipIf(password == nil, "Set NT_PASSWORD to run the live-ribbon test.")
        let password = password!

        // The class must already be running, or there is nothing to watch go
        // away. Skipping beats failing: an unstarted class is a setup mistake,
        // not a regression.
        try XCTSkipUnless(try isClassLive(), "No class is live — run scripts/start-test-meeting.ts first.")

        let app = XCUIApplication()
        app.launchArguments += ["-dev.originOverride", origin, "-uitest-fresh", "YES"]
        // The quick sign-in shortcut is hidden unless the app itself knows the
        // password, and `TEST_RUNNER_NT_PASSWORD` only reaches this process.
        app.launchEnvironment["NT_PASSWORD"] = password
        app.launch()

        // Signed out lands on the marketing home. Sign in through the debug
        // shortcut on it rather than the form: this test is about what happens
        // *after* sign-in, and it should not fail every time the sign-in
        // screen's labels are redesigned.
        let quickSignIn = app.buttons["🧪 Student 1"]
        XCTAssertTrue(quickSignIn.waitForExistence(timeout: 20), "Public home screen never appeared")
        quickSignIn.tap()

        let joinButton = app.buttons["Join Classroom Now"]
        XCTAssertTrue(
            joinButton.waitForExistence(timeout: 30),
            "Signed in during a live class but the home screen never offered it"
        )

        // End it from outside. Nothing touches the phone from here on.
        try endClass(password: password)

        // Generous: the in-class cadence is 30s and a missed request costs
        // another cycle. The failure this guards against is "never", not
        // "slowly".
        let vanished = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: joinButton)
        wait(for: [vanished], timeout: 120)
    }

    // MARK: - Talking to the server directly

    private func isClassLive() throws -> Bool {
        guard let password else { return false }
        let cookie = try signIn(email: studentEmail, password: password)
        let (data, _) = try get("/api/students/live-class", cookie: cookie)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return json?["live"] is [String: Any]
    }

    private func endClass(password: String) throws {
        let cookie = try signIn(email: teacherEmail, password: password)
        let (_, response) = try post("/api/sessions/\(sessionId)/end", cookie: cookie, body: Data("{}".utf8))
        XCTAssertEqual(response.statusCode, 200, "Ending the class from the test failed")
    }

    /// Better Auth answers with a `Set-Cookie` the rest of the calls need.
    private func signIn(email: String, password: String) throws -> String {
        let body = try JSONSerialization.data(withJSONObject: ["email": email, "password": password])
        let (_, response) = try post("/api/auth/sign-in/email", cookie: nil, body: body)
        XCTAssertEqual(response.statusCode, 200, "Test sign-in failed for \(email)")
        let raw = response.value(forHTTPHeaderField: "Set-Cookie") ?? ""
        let cookie = raw.split(separator: ",")
            .map { $0.split(separator: ";").first.map(String.init) ?? "" }
            .filter { $0.contains("=") }
            .joined(separator: "; ")
        XCTAssertFalse(cookie.isEmpty, "Sign-in returned no cookie")
        return cookie
    }

    private func get(_ path: String, cookie: String?) throws -> (Data, HTTPURLResponse) {
        try send(request(path, method: "GET", cookie: cookie, body: nil))
    }

    private func post(_ path: String, cookie: String?, body: Data) throws -> (Data, HTTPURLResponse) {
        try send(request(path, method: "POST", cookie: cookie, body: body))
    }

    private func request(_ path: String, method: String, cookie: String?, body: Data?) -> URLRequest {
        var request = URLRequest(url: URL(string: origin + path)!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(origin, forHTTPHeaderField: "Origin")
        if let cookie { request.setValue(cookie, forHTTPHeaderField: "Cookie") }
        request.httpBody = body
        return request
    }

    /// Synchronous on purpose: these run inside test steps, not in the app.
    private func send(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        var result: Result<(Data, HTTPURLResponse), Error>?
        let done = DispatchSemaphore(value: 0)
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                result = .failure(error)
            } else if let http = response as? HTTPURLResponse {
                result = .success((data ?? Data(), http))
            }
            done.signal()
        }.resume()
        _ = done.wait(timeout: .now() + 30)
        guard let result else { throw XCTSkip("No answer from \(origin) — is the dev server running?") }
        return try result.get()
    }
}
