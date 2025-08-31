package com.stationtracker.plugins;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.work.WorkManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingRequest;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(
    name = "BackgroundGeofence",
    permissions = {
        @Permission(
            strings = { 
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.ACCESS_FINE_LOCATION
            },
            alias = "location"
        ),
        @Permission(
            strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION },
            alias = "backgroundLocation"
        )
    }
)
public class BackgroundGeofencePlugin extends Plugin {

    private static final String TAG = "BackgroundGeofence";
    private FusedLocationProviderClient fusedLocationClient;
    private GeofencingClient geofencingClient;
    private LocationCallback locationCallback;
    private boolean isTracking = false;

    @Override
    public void load() {
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(getContext());
        geofencingClient = LocationServices.getGeofencingClient(getContext());
        
        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                if (locationResult == null) return;
                
                for (Location location : locationResult.getLocations()) {
                    JSObject locationData = new JSObject();
                    locationData.put("latitude", location.getLatitude());
                    locationData.put("longitude", location.getLongitude());
                    locationData.put("accuracy", location.getAccuracy());
                    locationData.put("timestamp", location.getTime());
                    
                    notifyListeners("locationUpdate", locationData);
                }
            }
        };
    }

    @PluginMethod
    public void startGeofencing(PluginCall call) {
        if (!hasLocationPermission()) {
            requestPermissionForAlias("location", call, "locationPermsCallback");
            return;
        }

        JSObject notification = call.getObject("notification", new JSObject());
        String title = notification.getString("title", "Location Tracking");
        String text = notification.getString("text", "Tracking location in background");

        // Start Foreground Service
        Intent serviceIntent = new Intent(getContext(), LocationForegroundService.class);
        serviceIntent.putExtra("title", title);
        serviceIntent.putExtra("text", text);
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(serviceIntent);
        } else {
            getContext().startService(serviceIntent);
        }

        isTracking = true;
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stopGeofencing(PluginCall call) {
        // Stop Foreground Service
        Intent serviceIntent = new Intent(getContext(), LocationForegroundService.class);
        getContext().stopService(serviceIntent);

        // Stop location updates
        if (locationCallback != null) {
            fusedLocationClient.removeLocationUpdates(locationCallback);
        }

        // Cancel WorkManager tasks
        WorkManager.getInstance(getContext()).cancelAllWorkByTag("location-tracking");

        isTracking = false;
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void addGeofences(PluginCall call) {
        if (!hasLocationPermission()) {
            requestPermissionForAlias("location", call, "locationPermsCallback");
            return;
        }

        try {
            List<Geofence> geofenceList = new ArrayList<>();
            JSObject[] geofences = call.getArray("geofences", JSObject[].class);

            for (JSObject geofenceData : geofences) {
                String identifier = geofenceData.getString("identifier");
                double latitude = geofenceData.getDouble("latitude");
                double longitude = geofenceData.getDouble("longitude");
                float radius = geofenceData.getDouble("radius", 100.0).floatValue();
                boolean notifyOnEntry = geofenceData.getBoolean("notifyOnEntry", true);
                boolean notifyOnExit = geofenceData.getBoolean("notifyOnExit", true);

                int transitionTypes = 0;
                if (notifyOnEntry) transitionTypes |= Geofence.GEOFENCE_TRANSITION_ENTER;
                if (notifyOnExit) transitionTypes |= Geofence.GEOFENCE_TRANSITION_EXIT;

                Geofence geofence = new Geofence.Builder()
                    .setRequestId(identifier)
                    .setCircularRegion(latitude, longitude, radius)
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(transitionTypes)
                    .build();

                geofenceList.add(geofence);
            }

            GeofencingRequest geofencingRequest = new GeofencingRequest.Builder()
                .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
                .addGeofences(geofenceList)
                .build();

            // Add geofences
            geofencingClient.addGeofences(geofencingRequest, GeofencePendingIntent.getPendingIntent(getContext()))
                .addOnSuccessListener(aVoid -> {
                    JSObject result = new JSObject();
                    result.put("success", true);
                    call.resolve(result);
                })
                .addOnFailureListener(e -> {
                    JSObject result = new JSObject();
                    result.put("success", false);
                    result.put("error", e.getMessage());
                    call.reject(e.getMessage());
                });

        } catch (SecurityException e) {
            call.reject("Location permission not granted", e);
        }
    }

    @PluginMethod
    public void removeGeofences(PluginCall call) {
        String[] identifiers = call.getArray("identifiers", String[].class);
        List<String> geofenceIds = new ArrayList<>();
        for (String id : identifiers) {
            geofenceIds.add(id);
        }

        geofencingClient.removeGeofences(geofenceIds)
            .addOnSuccessListener(aVoid -> {
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
            })
            .addOnFailureListener(e -> {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", e.getMessage());
                call.reject(e.getMessage());
            });
    }

    @PluginMethod
    public void getCurrentLocation(PluginCall call) {
        if (!hasLocationPermission()) {
            requestPermissionForAlias("location", call, "locationPermsCallback");
            return;
        }

        try {
            fusedLocationClient.getLastLocation()
                .addOnSuccessListener(location -> {
                    if (location != null) {
                        JSObject result = new JSObject();
                        result.put("latitude", location.getLatitude());
                        result.put("longitude", location.getLongitude());
                        result.put("accuracy", location.getAccuracy());
                        result.put("timestamp", location.getTime());
                        call.resolve(result);
                    } else {
                        call.reject("Unable to get location");
                    }
                })
                .addOnFailureListener(e -> call.reject("Location error", e));
        } catch (SecurityException e) {
            call.reject("Location permission not granted", e);
        }
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("location", getLocationPermissionStatus());
        result.put("backgroundLocation", getBackgroundLocationPermissionStatus());
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Android 10+ requires background location permission separately
            requestPermissionForAlias("backgroundLocation", call, "backgroundLocationPermsCallback");
        } else {
            requestPermissionForAlias("location", call, "locationPermsCallback");
        }
    }

    @PermissionCallback
    private void locationPermsCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("location", getLocationPermissionStatus());
        result.put("backgroundLocation", getBackgroundLocationPermissionStatus());
        
        if (call.getMethodName().equals("startGeofencing") && hasLocationPermission()) {
            startGeofencing(call);
            return;
        }
        
        call.resolve(result);
    }

    @PermissionCallback
    private void backgroundLocationPermsCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("location", getLocationPermissionStatus());
        result.put("backgroundLocation", getBackgroundLocationPermissionStatus());
        call.resolve(result);
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) 
            == PackageManager.PERMISSION_GRANTED;
    }

    private String getLocationPermissionStatus() {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) 
            == PackageManager.PERMISSION_GRANTED) {
            return "granted";
        }
        return "denied";
    }

    private String getBackgroundLocationPermissionStatus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION) 
                == PackageManager.PERMISSION_GRANTED) {
                return "granted";
            }
            return "denied";
        }
        return "not-available";
    }
}