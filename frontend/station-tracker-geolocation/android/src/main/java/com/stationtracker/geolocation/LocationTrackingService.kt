package com.stationtracker.geolocation

import android.Manifest
import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.*
import kotlinx.coroutines.*
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.*

class LocationTrackingService : Service() {

    companion object {
        private const val TAG = "LocationTrackingService"
        private const val CHANNEL_ID = "station_tracker_location"
        private const val NOTIFICATION_ID = 1001
        const val ACTION_FORCE_SEND = "com.stationtracker.geolocation.FORCE_SEND"
    }

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private lateinit var locationDatabase: LocationDatabase
    private val serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    // Stationary detection
    private var lastLocation: Location? = null
    private var stationaryStartTime: Long? = null
    private var isStationary = false
    private var visitEntryTime: Long? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service onCreate")

        locationDatabase = LocationDatabase(this)
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)

        createNotificationChannel()
        setupLocationCallback()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "Service onStartCommand: ${intent?.action}")

        when (intent?.action) {
            ACTION_FORCE_SEND -> {
                serviceScope.launch {
                    sendPendingLocations()
                }
                return START_STICKY
            }
        }

        val notification = createNotification()
        startForeground(NOTIFICATION_ID, notification)

        startLocationUpdates()

        // Schedule periodic cleanup and send
        serviceScope.launch {
            while (isActive) {
                delay(60_000) // Every 1 minute
                sendPendingLocations()
                locationDatabase.deleteOldRecords(7)
            }
        }

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service onDestroy")
        stopLocationUpdates()
        serviceScope.cancel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "位置情報追跡",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "バックグラウンドで位置情報を追跡します"
                setShowBadge(false)
            }

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val prefs = getSharedPreferences("StationTrackerGeo", Context.MODE_PRIVATE)
        val title = prefs.getString("notificationTitle", "駅記録アプリ") ?: "駅記録アプリ"
        val text = prefs.getString("notificationText", "バックグラウンドで位置を追跡中") ?: "バックグラウンドで位置を追跡中"

        val notificationIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun setupLocationCallback() {
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                locationResult.lastLocation?.let { location ->
                    handleLocationUpdate(location)
                }
            }
        }
    }

    private fun startLocationUpdates() {
        if (ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            Log.e(TAG, "Location permission not granted")
            stopSelf()
            return
        }

        val prefs = getSharedPreferences("StationTrackerGeo", Context.MODE_PRIVATE)
        val distanceFilter = prefs.getInt("distanceFilter", 10).toFloat()

        val locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000)
            .setMinUpdateDistanceMeters(distanceFilter)
            .setWaitForAccurateLocation(true)
            .setMaxUpdateDelayMillis(10000)
            .build()

        try {
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback,
                Looper.getMainLooper()
            )
            Log.d(TAG, "Location updates started with distance filter: $distanceFilter meters")
        } catch (e: SecurityException) {
            Log.e(TAG, "Security exception starting location updates", e)
        }
    }

    private fun stopLocationUpdates() {
        fusedLocationClient.removeLocationUpdates(locationCallback)
        Log.d(TAG, "Location updates stopped")
    }

    private fun handleLocationUpdate(location: Location) {
        Log.d(TAG, "Location update: ${location.latitude}, ${location.longitude}, accuracy: ${location.accuracy}")

        val prefs = getSharedPreferences("StationTrackerGeo", Context.MODE_PRIVATE)
        val userId = prefs.getString("userId", "default_user") ?: "default_user"

        // Save to local database
        locationDatabase.insertLocation(
            location.latitude,
            location.longitude,
            location.accuracy,
            location.time,
            userId
        )

        // Check stationary detection
        checkStationaryDetection(location)

        // Try to send immediately if online
        serviceScope.launch {
            sendPendingLocations()
        }
    }

    private fun checkStationaryDetection(location: Location) {
        val prefs = getSharedPreferences("StationTrackerGeo", Context.MODE_PRIVATE)
        val stationaryRadius = prefs.getInt("stationaryRadius", 50)
        val stationaryTime = prefs.getInt("stationaryTime", 300) * 1000L // Convert to milliseconds

        val last = lastLocation
        if (last == null) {
            lastLocation = location
            stationaryStartTime = System.currentTimeMillis()
            return
        }

        val distance = calculateDistance(
            last.latitude, last.longitude,
            location.latitude, location.longitude
        )

        if (distance <= stationaryRadius) {
            // Still within radius
            val startTime = stationaryStartTime ?: System.currentTimeMillis()
            val elapsed = System.currentTimeMillis() - startTime

            if (elapsed >= stationaryTime && !isStationary) {
                // Detected stationary visit - send entry event
                isStationary = true
                visitEntryTime = System.currentTimeMillis()
                Log.d(TAG, "Visit detected (entry): ${location.latitude}, ${location.longitude}")

                // Send visit entry to server
                serviceScope.launch {
                    sendVisitEventToServer(location, visitEntryTime!!, isEntry = true)
                }
            }
        } else {
            // Moved outside radius
            if (isStationary) {
                // Send visit exit event
                val exitTime = System.currentTimeMillis()
                Log.d(TAG, "Left visit location (exit): ${location.latitude}, ${location.longitude}")

                serviceScope.launch {
                    sendVisitEventToServer(location, exitTime, isEntry = false)
                }
            }
            lastLocation = location
            stationaryStartTime = System.currentTimeMillis()
            isStationary = false
            visitEntryTime = null
        }
    }

    private fun calculateDistance(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val R = 6371000.0 // Earth radius in meters
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
                sin(dLon / 2) * sin(dLon / 2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return R * c
    }

    private suspend fun sendPendingLocations() = withContext(Dispatchers.IO) {
        val prefs = getSharedPreferences("StationTrackerGeo", Context.MODE_PRIVATE)
        val apiUrl = prefs.getString("apiUrl", null)
        val apiKey = prefs.getString("apiKey", null)
        val endpoint = prefs.getString("endpoint", "/dev/location")

        if (apiUrl == null || apiKey == null) {
            Log.w(TAG, "API not configured, skipping send")
            return@withContext
        }

        val pendingLocations = locationDatabase.getPendingLocations(50)
        if (pendingLocations.isEmpty()) {
            return@withContext
        }

        Log.d(TAG, "Sending ${pendingLocations.size} pending locations")

        var sentCount = 0
        var failedCount = 0

        for (record in pendingLocations) {
            val success = sendLocationToServer(apiUrl, apiKey, endpoint, record)
            if (success) {
                locationDatabase.markAsSent(record.id)
                sentCount++
            } else {
                locationDatabase.incrementRetryCount(record.id)
                failedCount++

                // Exponential backoff: stop sending if failed
                if (record.retryCount >= 3) {
                    Log.w(TAG, "Record ${record.id} failed after ${record.retryCount} retries, stopping batch")
                    break
                }
            }

            delay(100) // Small delay between requests
        }

        Log.d(TAG, "Send complete: $sentCount sent, $failedCount failed")

        // Cleanup old sent records
        val oneWeekAgo = System.currentTimeMillis() - (7 * 24 * 60 * 60 * 1000L)
        locationDatabase.deleteSentLocations(oneWeekAgo)
    }

    private fun sendLocationToServer(
        apiUrl: String,
        apiKey: String,
        endpoint: String,
        record: LocationRecord
    ): Boolean {
        return try {
            val url = URL("$apiUrl$endpoint")
            val connection = url.openConnection() as HttpURLConnection

            connection.apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("x-api-key", apiKey)
                doOutput = true
                connectTimeout = 10000
                readTimeout = 10000
            }

            val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
            dateFormat.timeZone = TimeZone.getTimeZone("UTC")
            val timestamp = dateFormat.format(Date(record.timestamp))

            val jsonBody = """
                {
                    "user_id": "${record.userId}",
                    "lat": ${record.latitude},
                    "lng": ${record.longitude},
                    "timestamp": "$timestamp"
                }
            """.trimIndent()

            connection.outputStream.use { os ->
                os.write(jsonBody.toByteArray())
            }

            val responseCode = connection.responseCode
            Log.d(TAG, "Server response: $responseCode for record ${record.id}")

            responseCode in 200..299
        } catch (e: IOException) {
            Log.e(TAG, "Network error sending location", e)
            false
        } catch (e: Exception) {
            Log.e(TAG, "Error sending location", e)
            false
        }
    }

    private suspend fun sendVisitEventToServer(location: Location, eventTime: Long, isEntry: Boolean) = withContext(Dispatchers.IO) {
        val prefs = getSharedPreferences("StationTrackerGeo", Context.MODE_PRIVATE)
        val apiUrl = prefs.getString("apiUrl", null)
        val apiKey = prefs.getString("apiKey", null)
        val endpoint = prefs.getString("endpoint", "/dev/location")
        val userId = prefs.getString("userId", "default_user") ?: "default_user"

        if (apiUrl == null || apiKey == null) {
            Log.w(TAG, "API not configured, skipping visit event")
            return@withContext
        }

        val eventType = if (isEntry) "entry" else "exit"
        Log.d(TAG, "Sending visit $eventType event to server")

        try {
            val url = URL("$apiUrl$endpoint")
            val connection = url.openConnection() as HttpURLConnection

            connection.apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("x-api-key", apiKey)
                doOutput = true
                connectTimeout = 10000
                readTimeout = 10000
            }

            val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
            dateFormat.timeZone = TimeZone.getTimeZone("UTC")
            val timestamp = dateFormat.format(Date(eventTime))

            val jsonBody = """
                {
                    "user_id": "$userId",
                    "lat": ${location.latitude},
                    "lng": ${location.longitude},
                    "timestamp": "$timestamp",
                    "event_type": "$eventType"
                }
            """.trimIndent()

            connection.outputStream.use { os ->
                os.write(jsonBody.toByteArray())
            }

            val responseCode = connection.responseCode
            Log.d(TAG, "Visit $eventType event sent: $responseCode")

            if (responseCode !in 200..299) {
                Log.w(TAG, "Visit $eventType event failed with code: $responseCode")
            }
        } catch (e: IOException) {
            Log.e(TAG, "Network error sending visit $eventType event", e)
        } catch (e: Exception) {
            Log.e(TAG, "Error sending visit $eventType event", e)
        }
    }
}
