package com.novicetutor.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * The foreground service that lets the app capture the screen.
 *
 * Android will not hand out a MediaProjection to a process that isn't running
 * a foreground service of type `mediaProjection` — on 14+ it throws outright.
 * The service does no work itself; its whole job is to exist, hold the
 * notification the platform insists on, and keep the process alive while a
 * teacher is presenting.
 *
 * Written here rather than pulling in `flutter_background` (which is what the
 * LiveKit example uses): that package exists to run arbitrary Dart in the
 * background, which this app never needs, and it would be a second
 * notification channel and a second place for the call to be killed from.
 */
class ScreenShareService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // The Stop button on the notification. This is the only control the
        // teacher can reach while they are in another app — which is the whole
        // point of presenting, so it cannot be the one place without one.
        if (intent?.action == ACTION_STOP) {
            onStopRequested?.invoke()
            return START_NOT_STICKY
        }

        createChannel()

        // Tapping it comes back to the class rather than launching a second
        // copy — MainActivity is singleTop, so this reuses the running one.
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE
        )

        @Suppress("DEPRECATION")
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            Notification.Builder(this)
        }

        val stop = PendingIntent.getService(
            this,
            1,
            Intent(this, ScreenShareService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE
        )

        val notification: Notification = builder
            .setContentTitle("● Live — sharing your screen")
            .setContentText("Everyone in the class can see your screen.")
            .setSmallIcon(android.R.drawable.ic_menu_share)
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop sharing", stop)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        // Not sticky: if the system kills this, the projection is gone with it
        // and silently restarting a service that captures the screen — with no
        // one having asked for it — is exactly the wrong behaviour.
        return START_NOT_STICKY
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return

        // LOW: no sound. This fires in the middle of a lesson that is already
        // making noise of its own.
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Screen sharing",
            NotificationManager.IMPORTANCE_LOW
        )
        channel.description = "Shown while you are presenting your screen in a class."
        manager.createNotificationChannel(channel)
    }

    companion object {
        private const val CHANNEL_ID = "novice_tutor_screen_share"
        private const val NOTIFICATION_ID = 4201
        private const val ACTION_STOP = "com.novicetutor.app.STOP_SCREEN_SHARE"

        /**
         * Set by MainActivity while the engine is alive. The service can stop
         * itself, but only Dart holds the LiveKit room that is publishing —
         * killing the service alone would leave the class watching a frozen
         * screen from a participant nobody can see.
         */
        var onStopRequested: (() -> Unit)? = null

        fun start(context: Context) {
            val intent = Intent(context, ScreenShareService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, ScreenShareService::class.java))
        }
    }
}
