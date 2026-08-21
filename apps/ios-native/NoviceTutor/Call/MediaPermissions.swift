import AVFoundation
import UIKit

/// The camera and microphone grants a class needs.
///
/// Asked for at the moment they make sense: the person has tapped Join on a
/// named class and the screen already says it is joining. An alert at launch,
/// before anyone has asked for anything, is both worse product and worse for
/// review — the reason for it is not on screen yet.
///
/// A refusal is never fatal. A student who declines the camera still hears the
/// lesson; one who declines the microphone still watches it. Blocking entry on
/// a permission would turn a recoverable choice into a dead end.
enum MediaPermissions {
    struct Grants: Sendable {
        let microphone: Bool
        let camera: Bool
    }

    /// Microphone first: it is the one a class cannot really do without, and
    /// asking for it first means a person who declines the camera has already
    /// granted the thing that matters.
    static func request() async -> Grants {
        let microphone = await AVAudioApplication.requestRecordPermission()
        let camera = await AVCaptureDevice.requestAccess(for: .video)
        return Grants(microphone: microphone, camera: camera)
    }

    /// Denied for good — the system will not ask again, so the only way
    /// forward is Settings.
    static var microphoneDenied: Bool {
        AVAudioApplication.shared.recordPermission == .denied
    }

    static var cameraDenied: Bool {
        AVCaptureDevice.authorizationStatus(for: .video) == .denied
    }

    @MainActor
    static func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}
