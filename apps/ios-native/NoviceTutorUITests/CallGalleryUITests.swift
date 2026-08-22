import XCTest

/// Screenshots of the call screen, portrait and landscape, without a class.
///
/// The call UI is the only screen that cannot be checked by building: it needs
/// a live class and a second person, and by the time both exist a layout bug
/// has shipped. This drives ``CallScreenGallery`` — the same views, made-up
/// people — and attaches what it saw, so a run leaves behind something to look
/// at rather than a green tick.
///
/// It asserts almost nothing on purpose. What it is for is the attachments;
/// the one thing worth failing on is the control bar not fitting, because that
/// is the regression this screen has actually had.
final class CallGalleryUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    /// Launched *into* landscape, rather than rotated after the fact: the
    /// question this answers is whether the layout works at 874×402, and
    /// rotating a running app answers a different, flakier one.
    func testCallScreenLandscapeFromLaunch() {
        XCUIDevice.shared.orientation = .landscapeLeft
        defer { XCUIDevice.shared.orientation = .portrait }

        for layout in ["speaker", "grid"] {
            let app = XCUIApplication()
            app.launchArguments = ["-dev.callGallery", "1", "-dev.callGalleryLayout", layout]
            app.launch()
            Thread.sleep(forTimeInterval: 2)
            capture(app, named: "launched-landscape-\(layout)")

            // Frames, not pixels. A landscape screenshot of the simulator
            // draws the app rotated whether or not the app rotated, so the
            // attachment cannot answer this and the geometry has to.
            let window = app.windows.firstMatch.frame
            XCTAssertGreaterThan(
                window.width, window.height,
                "The call screen stayed portrait in \(layout) layout — check OrientationGate"
            )

            let leave = app.buttons["Leave class"]
            XCTAssertTrue(leave.waitForExistence(timeout: 5))
            XCTAssertTrue(
                window.contains(leave.frame),
                "The end button is outside the window in landscape \(layout) layout"
            )

            app.terminate()
        }
    }

    func testCallScreenLayouts() {
        for layout in ["speaker", "grid"] {
            let app = XCUIApplication()
            app.launchArguments = ["-dev.callGallery", "1", "-dev.callGalleryLayout", layout]
            app.launch()

            XCUIDevice.shared.orientation = .portrait
            capture(app, named: "call-\(layout)-portrait")

            XCUIDevice.shared.orientation = .landscapeLeft
            // Rotation is asynchronous: the device turns, then the app is
            // asked to re-lay out. Capturing straight away photographs a
            // portrait window on a landscape screen and looks like a bug in
            // the app rather than in the test.
            Thread.sleep(forTimeInterval: 2)
            capture(app, named: "call-\(layout)-landscape")

            // The bar has to fit the narrowest phone we support with room
            // either side. A bar wider than the screen is not a cosmetic
            // problem: the End button is the part that falls off.
            XCUIDevice.shared.orientation = .portrait
            let leave = app.buttons["Leave class"]
            if leave.waitForExistence(timeout: 5) {
                XCTAssertTrue(
                    app.windows.firstMatch.frame.contains(leave.frame),
                    "The end button is outside the window in \(layout) layout"
                )
            }

            app.terminate()
        }
    }

    private func capture(_ app: XCUIApplication, named name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
