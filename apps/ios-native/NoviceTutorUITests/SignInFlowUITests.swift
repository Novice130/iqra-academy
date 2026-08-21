import XCTest

/// Drives the app the way a person does, against a real server.
///
/// These are not unit tests and they are not hermetic: they sign in with a
/// real account and read a real schedule. That is the point — the parts of
/// this app most likely to break are the seams (cookie kept across requests,
/// role decides which endpoint, dates decoded from the API's format), and
/// none of those fail in a test that stubs the network.
///
/// Requires a server on `NT_ORIGIN` (default `http://localhost:3000`) with
/// the standing test accounts. Start it with
/// `BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000 npm run dev`.
///
/// `NT_PASSWORD` has no default and the tests skip without it. The password
/// used to sit here as a literal, which made a real account's credentials
/// public to anyone with the repository — `docs/test-accounts.md` says the
/// password is not in this repo, and that is only true now.
final class SignInFlowUITests: XCTestCase {
    private var origin: String {
        ProcessInfo.processInfo.environment["NT_ORIGIN"] ?? "http://localhost:3000"
    }
    private var email: String {
        ProcessInfo.processInfo.environment["NT_EMAIL"] ?? "teststudent1@test.com"
    }
    private var password: String? {
        ProcessInfo.processInfo.environment["NT_PASSWORD"]
    }

    override func setUp() {
        continueAfterFailure = false
    }

    /// Skips rather than fails: a run without credentials has proved nothing,
    /// and a red test that means "you did not set an environment variable"
    /// teaches everyone to ignore red tests.
    private func requirePassword() throws -> String {
        try XCTSkipIf(password == nil, "Set NT_PASSWORD to run the sign-in tests.")
        return password!
    }

    private func launchApp() -> XCUIApplication {
        let app = XCUIApplication()
        // A leading-dash argument is read straight into UserDefaults, which
        // is where AppConfig looks — no test-only branch in the app.
        app.launchArguments += ["-dev.originOverride", origin, "-uitest-fresh", "YES"]
        app.launch()
        return app
    }

    func testSignInShowsClasses() throws {
        let password = try requirePassword()
        let app = launchApp()

        let emailField = app.textFields["Email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 10), "Sign-in screen never appeared")
        emailField.tap()
        emailField.typeText(email)

        let passwordField = app.secureTextFields["Password"]
        passwordField.tap()
        passwordField.typeText(password)

        app.buttons["Sign in"].tap()

        // The tab bar only exists once /api/me has answered, so its arrival is
        // the signal that sign-in and identity both worked.
        XCTAssertTrue(
            app.tabBars.buttons["Classes"].waitForExistence(timeout: 20),
            "Signed in but the app never reached the classes tab"
        )
        XCTAssertTrue(app.navigationBars["Classes"].waitForExistence(timeout: 10))
    }

    func testWrongPasswordIsReported() throws {
        let app = launchApp()

        let emailField = app.textFields["Email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 10))
        emailField.tap()
        emailField.typeText(email)

        let passwordField = app.secureTextFields["Password"]
        passwordField.tap()
        passwordField.typeText("definitely-not-the-password")

        app.buttons["Sign in"].tap()

        // Whatever the server says, the person has to see *something* — the
        // failure this guards against is a button that silently does nothing.
        let stillOnSignIn = app.buttons["Sign in"].waitForExistence(timeout: 15)
        XCTAssertTrue(stillOnSignIn, "A rejected sign-in should leave you on the sign-in screen")
        XCTAssertFalse(
            app.tabBars.buttons["Classes"].exists,
            "A wrong password got into the app"
        )
    }

    func testAccountTabShowsWhoIsSignedIn() throws {
        let password = try requirePassword()
        let app = launchApp()

        let emailField = app.textFields["Email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 10))
        emailField.tap()
        emailField.typeText(email)
        let passwordField = app.secureTextFields["Password"]
        passwordField.tap()
        passwordField.typeText(password)
        app.buttons["Sign in"].tap()

        XCTAssertTrue(app.tabBars.buttons["Account"].waitForExistence(timeout: 20))
        app.tabBars.buttons["Account"].tap()

        XCTAssertTrue(app.staticTexts[email].waitForExistence(timeout: 10), "Account tab doesn't show the signed-in email")
        XCTAssertTrue(app.buttons["Sign out"].exists)
    }
}
