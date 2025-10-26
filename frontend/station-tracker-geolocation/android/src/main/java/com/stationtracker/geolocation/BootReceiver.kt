package com.stationtracker.geolocation

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "Boot receiver triggered: ${intent.action}")

        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON" -> {
                // Check if tracking was enabled before reboot
                val prefs = context.getSharedPreferences("StationTrackerGeo", Context.MODE_PRIVATE)
                val wasTracking = prefs.getBoolean("isTracking", false)

                if (wasTracking) {
                    Log.d(TAG, "Restarting location tracking after boot")
                    val serviceIntent = Intent(context, LocationTrackingService::class.java)
                    ContextCompat.startForegroundService(context, serviceIntent)
                } else {
                    Log.d(TAG, "Tracking was not enabled, skipping auto-start")
                }
            }
        }
    }
}
