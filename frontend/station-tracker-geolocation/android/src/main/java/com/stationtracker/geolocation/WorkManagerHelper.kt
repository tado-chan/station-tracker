package com.stationtracker.geolocation

import android.content.Context
import androidx.work.*
import java.util.Calendar
import java.util.concurrent.TimeUnit

object WorkManagerHelper {

    private const val DAILY_WORK_NAME = "station_tracker_daily_maintenance"

    fun scheduleDailyMaintenance(context: Context) {
        val calendar = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 6)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)

            // If 6 AM has passed today, schedule for tomorrow
            if (timeInMillis < System.currentTimeMillis()) {
                add(Calendar.DAY_OF_YEAR, 1)
            }
        }

        val initialDelay = calendar.timeInMillis - System.currentTimeMillis()

        val dailyWorkRequest = PeriodicWorkRequestBuilder<DailyMaintenanceWorker>(
            24, TimeUnit.HOURS
        )
            .setInitialDelay(initialDelay, TimeUnit.MILLISECONDS)
            .setConstraints(
                Constraints.Builder()
                    .setRequiresBatteryNotLow(false)
                    .setRequiresCharging(false)
                    .build()
            )
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            DAILY_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            dailyWorkRequest
        )
    }

    fun cancelDailyMaintenance(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(DAILY_WORK_NAME)
    }
}
