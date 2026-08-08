package com.novicetutor.app

import android.app.PictureInPictureParams
import android.os.Build
import android.util.Rational
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

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
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, SCREEN_SHARE_CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "startService" -> {
                        ScreenShareService.start(this)
                        result.success(true)
                    }
                    "stopService" -> {
                        ScreenShareService.stop(this)
                        result.success(true)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (!pipAllowed || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

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
    }
}
