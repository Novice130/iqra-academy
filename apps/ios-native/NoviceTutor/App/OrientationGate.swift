import SwiftUI
import UIKit

/// Which way up the app is allowed to be.
///
/// The whole app is portrait except one screen. Every list, form and card in
/// it was laid out for a phone held upright, and rotating the schedule sideways
/// gains nobody anything; a class is different. A teacher props a phone on a
/// stand and a student holds a mushaf up to the camera, and both of those are
/// landscape.
///
/// `Info.plist` has to list the landscape orientations for any of this to be
/// possible, but listing them there alone would let *every* screen rotate.
/// This is the gate that narrows it back down: `AppDelegate` answers with
/// portrait unless a call is on screen, and the call opens and closes the gate
/// as it appears and disappears.
@MainActor
enum OrientationGate {
    private(set) static var allowsLandscape = false

    static var mask: UIInterfaceOrientationMask {
        allowsLandscape ? .allButUpsideDown : .portrait
    }

    /// Opening the gate only permits rotation; it does not turn the phone.
    /// Closing it has to actively put the app back, because a phone left on
    /// its side would otherwise hold a portrait-only screen sideways.
    static func set(_ allowed: Bool) {
        guard allowed != allowsLandscape else { return }
        allowsLandscape = allowed

        for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
            scene.keyWindow?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
            if !allowed {
                scene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait))
            }
        }
    }
}
