package com.stationtracker.geolocation

import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class DailyMaintenanceWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        private const val TAG = "DailyMaintenanceWorker"
    }

    override suspend fun doWork(): Result {
        Log.d(TAG, "Daily maintenance worker started")

        try {
            // Check if tracking is enabled
            val prefs = applicationContext.getSharedPreferences("StationTrackerGeo", Context.MODE_PRIVATE)
            val isTracking = prefs.getBoolean("isTracking", false)

            if (isTracking) {
                // Ensure service is running
                val serviceIntent = Intent(applicationContext, LocationTrackingService::class.java)
                ContextCompat.startForegroundService(applicationContext, serviceIntent)

                // Force send pending data
                val forceSendIntent = Intent(applicationContext, LocationTrackingService::class.java).apply {
                    action = LocationTrackingService.ACTION_FORCE_SEND
                }
                applicationContext.startService(forceSendIntent)

                Log.d(TAG, "Service restart and force send triggered")
            }

            // Cleanup old database records
            val database = LocationDatabase(applicationContext)
            database.deleteOldRecords(7)
            Log.d(TAG, "Old records cleaned up")

            return Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Error in daily maintenance", e)
            return Result.retry()
        }
    }
}
