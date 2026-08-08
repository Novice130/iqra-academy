package com.novicetutor.app

import android.app.PictureInPictureParams
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Rational
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Picture-in-picture, the thing a YouTube video does when you leave the app.
 *
 * Android will only shrink an Activity into a floating window from inside that
 * Activity, and only at the moment the user leaves — `onUserLeaveHint`. There
 * is no way to ask for it from Dart directly, hence the channel.
 *
 * Only during a class: Dart flips the flag when the WebView navigates onto a
 * session page. Leaving the app while reading the dashboard should just leave
 * the app.
 */
class MainActivity : FlutterActivity() {
    private var pipAllowed = false

    /**
     * True from the moment the capture service goes up until it comes down.
     *
     * Presenting means leaving the app to show something — which is exactly the
     * gesture that triggers picture-in-picture. Shrinking the class into a
     * floating window while the screen is being captured puts that window in the
     * capture: the students watch a thumbnail of themselves pinned over whatever
     * the teacher meant to show them, and on some OEMs the PiP transition drops
     * the WebView's camera as well. Presenting wins.
     */
    private var screenSharing = false

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "setPipAllowed" -> {
                        pipAllowed = call.argument<Boolean>("allowed") ?: false
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }

        // Screen capture needs a foreground service running before Android
        // will grant a MediaProjection at all. Dart drives the order: service
        // up, then capture, then publish. See lib/shell/screen_share.dart.
        val screenShare = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, SCREEN_SHARE_CHANNEL)
        screenShare.setMethodCallHandler { call, result ->
            when (call.method) {
                "startService" -> startCaptureService(result)
                "stopService" -> {
                    screenSharing = false
                    ScreenShareService.onStarted = null
                    ScreenShareService.stop(this)
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }

        // Stop from the notification. The service can't end the share on its
        // own — Dart owns the room that is publishing — so it comes back
        // through here and Dart tears the whole thing down, service included.
        ScreenShareService.onStopRequested = {
            runOnUiThread { screenShare.invokeMethod("stopRequested", null) }
        }
    }

    /**
     * Starts the capture service and answers Dart only once it is genuinely in
     * the foreground — see ScreenShareService.onStarted for why that matters.
     *
     * The timeout is not paranoia: an Activity that is itself in the background
     * cannot start a foreground service at all, and `startForegroundService`
     * reports nothing when the system drops it. Answering false there means the
     * teacher gets "couldn't start sharing" instead of a permanent Starting…
     * spinner on a button that will never light up.
     */
    private fun startCaptureService(result: MethodChannel.Result) {
        val answered = AtomicBoolean(false)
        fun answer(ok: Boolean) {
            if (!answered.compareAndSet(false, true)) return
            ScreenShareService.onStarted = null
            screenSharing = ok
            runOnUiThread { result.success(ok) }
        }

        ScreenShareService.onStarted = { answer(true) }
        try {
            ScreenShareService.start(this)
        } catch (e: Exception) {
            // ForegroundServiceStartNotAllowedException on Android 12+, or an OEM
            // background-start restriction. Either way there will be no capture.
            answer(false)
            return
        }
        Handler(Looper.getMainLooper()).postDelayed({ answer(false) }, SERVICE_START_TIMEOUT_MS)
    }

    override fun onDestroy() {
        ScreenShareService.onStopRequested = null
        ScreenShareService.onStarted = null
        super.onDestroy()
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (!pipAllowed || screenSharing || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        try {
            // Portrait-ish, matching how a phone actually holds a class. Android
            // rejects ratios beyond roughly 2.39:1 either way.
            val params = PictureInPictureParams.Builder()
                .setAspectRatio(Rational(9, 16))
                .build()
            enterPictureInPictureMode(params)
        } catch (e: IllegalStateException) {
            // Some OEMs refuse PiP, and the user can disable it per app. Not
            // worth crashing a lesson over.
        }
    }

    companion object {
        private const val CHANNEL = "novicetutor/pip"
        private const val SCREEN_SHARE_CHANNEL = "novicetutor/screenshare"

        /** Generous: the service does nothing but post a notification. */
        private const val SERVICE_START_TIMEOUT_MS = 4_000L
    }
}
