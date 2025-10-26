package com.stationtracker.geolocation

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "StationTrackerGeolocation",
    permissions = [
        Permission(strings = [Manifest.permission.ACCESS_FINE_LOCATION], alias = "location"),
        Permission(strings = [Manifest.permission.ACCESS_COARSE_LOCATION], alias = "coarseLocation"),
        Permission(strings = [Manifest.permission.ACCESS_BACKGROUND_LOCATION], alias = "backgroundLocation")
    ]
)
class StationTrackerGeolocationPlugin : Plugin() {

    private lateinit var locationDatabase: LocationDatabase

    override fun load() {
        locationDatabase = LocationDatabase(context)
    }

    @PluginMethod
    fun configure(call: PluginCall) {
        val apiUrl = call.getString("apiUrl") ?: run {
            call.reject("apiUrl is required")
            return
        }
        val apiKey = call.getString("apiKey") ?: run {
            call.reject("apiKey is required")
            return
        }
        val userId = call.getString("userId") ?: run {
            call.reject("userId is required")
            return
        }
        val endpoint = call.getString("endpoint", "/dev/location")

        // Save config to SharedPreferences
        val prefs = context.getSharedPreferences("StationTrackerGeo", android.content.Context.MODE_PRIVATE)
        prefs.edit().apply {
            putString("apiUrl", apiUrl)
            putString("apiKey", apiKey)
            putString("userId", userId)
            putString("endpoint", endpoint)
            apply()
        }

        val ret = JSObject()
        ret.put("success", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun startTracking(call: PluginCall) {
        if (!hasRequiredPermissions()) {
            requestAllPermissions(call, "startTrackingPerms")
            return
        }

        val distanceFilter = call.getInt("distanceFilter", 10)
        val notificationTitle = call.getString("notificationTitle", "駅記録アプリ")
        val notificationText = call.getString("notificationText", "バックグラウンドで位置を追跡中")
        val stationaryRadius = call.getInt("stationaryRadius", 50)
        val stationaryTime = call.getInt("stationaryTime", 300)

        // Save tracking options to SharedPreferences
        val prefs = context.getSharedPreferences("StationTrackerGeo", android.content.Context.MODE_PRIVATE)
        prefs.edit().apply {
            putInt("distanceFilter", distanceFilter)
            putString("notificationTitle", notificationTitle)
            putString("notificationText", notificationText)
            putInt("stationaryRadius", stationaryRadius)
            putInt("stationaryTime", stationaryTime)
            putBoolean("isTracking", true)
            apply()
        }

        // Start foreground service
        val serviceIntent = Intent(context, LocationTrackingService::class.java)
        ContextCompat.startForegroundService(context, serviceIntent)

        // Schedule daily maintenance
        WorkManagerHelper.scheduleDailyMaintenance(context)

        val ret = JSObject()
        ret.put("success", true)
        call.resolve(ret)
    }

    @PermissionCallback
    private fun startTrackingPerms(call: PluginCall) {
        if (hasRequiredPermissions()) {
            startTracking(call)
        } else {
            call.reject("Location permission denied")
        }
    }

    @PluginMethod
    fun stopTracking(call: PluginCall) {
        val prefs = context.getSharedPreferences("StationTrackerGeo", android.content.Context.MODE_PRIVATE)
        prefs.edit().putBoolean("isTracking", false).apply()

        val serviceIntent = Intent(context, LocationTrackingService::class.java)
        context.stopService(serviceIntent)

        // Cancel daily maintenance
        WorkManagerHelper.cancelDailyMaintenance(context)

        val ret = JSObject()
        ret.put("success", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun getTrackingStatus(call: PluginCall) {
        val prefs = context.getSharedPreferences("StationTrackerGeo", android.content.Context.MODE_PRIVATE)
        val isTracking = prefs.getBoolean("isTracking", false)

        val ret = JSObject()
        ret.put("isTracking", isTracking)
        call.resolve(ret)
    }

    @PluginMethod
    fun getQueueSize(call: PluginCall) {
        val size = locationDatabase.getPendingCount()

        val ret = JSObject()
        ret.put("size", size)
        call.resolve(ret)
    }

    @PluginMethod
    fun forceSendQueue(call: PluginCall) {
        // Trigger immediate send via service
        val serviceIntent = Intent(context, LocationTrackingService::class.java).apply {
            action = LocationTrackingService.ACTION_FORCE_SEND
        }
        context.startService(serviceIntent)

        val ret = JSObject()
        ret.put("sent", 0)  // Will be updated via callback
        ret.put("failed", 0)
        call.resolve(ret)
    }

    private fun hasRequiredPermissions(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun notifyLocationUpdate(latitude: Double, longitude: Double, accuracy: Float, timestamp: Long) {
        val ret = JSObject().apply {
            put("latitude", latitude)
            put("longitude", longitude)
            put("accuracy", accuracy)
            put("timestamp", timestamp)
        }
        notifyListeners("locationUpdate", ret)
    }

    fun notifyVisitDetected(latitude: Double, longitude: Double, arrivedAt: Long) {
        val ret = JSObject().apply {
            put("latitude", latitude)
            put("longitude", longitude)
            put("arrivedAt", arrivedAt)
        }
        notifyListeners("visitDetected", ret)
    }

    fun notifyError(message: String) {
        val ret = JSObject().apply {
            put("message", message)
        }
        notifyListeners("error", ret)
    }
}
