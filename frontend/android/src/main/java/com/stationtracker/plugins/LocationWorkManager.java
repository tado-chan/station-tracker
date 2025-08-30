package com.stationtracker.plugins;

import android.content.Context;
import android.location.Location;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;

import java.util.concurrent.TimeUnit;

public class LocationWorkManager {
    
    private static final String TAG = "LocationWorkManager";
    private static final String WORK_TAG = "location-tracking";
    private static final String GEOFENCE_CHECK_WORK = "geofence-check";

    /**
     * Schedule periodic location checks
     */
    public static void scheduleLocationTracking(Context context, long intervalMinutes) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(false)
            .build();

        PeriodicWorkRequest locationWork = new PeriodicWorkRequest.Builder(
                LocationWorker.class,
                intervalMinutes,
                TimeUnit.MINUTES
            )
            .setConstraints(constraints)
            .addTag(WORK_TAG)
            .build();

        WorkManager.getInstance(context).enqueue(locationWork);
        Log.d(TAG, "Scheduled periodic location tracking every " + intervalMinutes + " minutes");
    }

    /**
     * Schedule one-time geofence check with current location
     */
    public static void scheduleGeofenceCheck(Context context, Location location) {
        Data inputData = new Data.Builder()
            .putDouble("latitude", location.getLatitude())
            .putDouble("longitude", location.getLongitude())
            .putFloat("accuracy", location.getAccuracy())
            .putLong("timestamp", location.getTime())
            .build();

        OneTimeWorkRequest geofenceWork = new OneTimeWorkRequest.Builder(GeofenceWorker.class)
            .setInputData(inputData)
            .addTag(GEOFENCE_CHECK_WORK)
            .build();

        WorkManager.getInstance(context).enqueue(geofenceWork);
    }

    /**
     * Cancel all location tracking work
     */
    public static void cancelLocationTracking(Context context) {
        WorkManager.getInstance(context).cancelAllWorkByTag(WORK_TAG);
        WorkManager.getInstance(context).cancelAllWorkByTag(GEOFENCE_CHECK_WORK);
        Log.d(TAG, "Cancelled all location tracking work");
    }

    /**
     * Worker for periodic location updates
     */
    public static class LocationWorker extends Worker {
        
        public LocationWorker(@NonNull Context context, @NonNull WorkerParameters params) {
            super(context, params);
        }

        @NonNull
        @Override
        public Result doWork() {
            try {
                FusedLocationProviderClient fusedLocationClient = 
                    LocationServices.getFusedLocationProviderClient(getApplicationContext());

                // Get last known location
                fusedLocationClient.getLastLocation()
                    .addOnSuccessListener(location -> {
                        if (location != null) {
                            // Trigger geofence check
                            scheduleGeofenceCheck(getApplicationContext(), location);
                            
                            Log.d(TAG, "Location worker executed: " + 
                                location.getLatitude() + ", " + location.getLongitude());
                        }
                    })
                    .addOnFailureListener(e -> Log.e(TAG, "Failed to get location", e));

                return Result.success();
                
            } catch (SecurityException e) {
                Log.e(TAG, "Location permission not granted", e);
                return Result.failure();
            } catch (Exception e) {
                Log.e(TAG, "Location worker failed", e);
                return Result.retry();
            }
        }
    }

    /**
     * Worker for geofence checking
     */
    public static class GeofenceWorker extends Worker {
        
        public GeofenceWorker(@NonNull Context context, @NonNull WorkerParameters params) {
            super(context, params);
        }

        @NonNull
        @Override
        public Result doWork() {
            try {
                // Get location from input data
                Data inputData = getInputData();
                double latitude = inputData.getDouble("latitude", 0.0);
                double longitude = inputData.getDouble("longitude", 0.0);
                float accuracy = inputData.getFloat("accuracy", 0.0f);
                long timestamp = inputData.getLong("timestamp", 0L);

                if (latitude == 0.0 && longitude == 0.0) {
                    return Result.failure();
                }

                // Perform geofence checking logic
                GeofenceChecker checker = new GeofenceChecker(getApplicationContext());
                checker.checkGeofences(latitude, longitude, accuracy, timestamp);

                Log.d(TAG, "Geofence check completed for: " + latitude + ", " + longitude);
                return Result.success();
                
            } catch (Exception e) {
                Log.e(TAG, "Geofence worker failed", e);
                return Result.failure();
            }
        }
    }
}