package com.stationtracker.plugins;

import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Handles geofence checking logic
 */
public class GeofenceChecker {
    
    private static final String TAG = "GeofenceChecker";
    private static final String PREFS_NAME = "geofence_prefs";
    private static final String KEY_ACTIVE_REGIONS = "active_regions";
    private static final String KEY_ENTERED_REGIONS = "entered_regions";
    
    private Context context;

    public GeofenceChecker(Context context) {
        this.context = context;
    }

    /**
     * Check if current location triggers any geofence events
     */
    public void checkGeofences(double latitude, double longitude, float accuracy, long timestamp) {
        List<GeofenceRegion> activeRegions = getActiveRegions();
        Set<String> previouslyEntered = getEnteredRegions();
        Set<String> currentlyEntered = new HashSet<>();

        for (GeofenceRegion region : activeRegions) {
            boolean isInside = isInsideRegion(latitude, longitude, region);
            boolean wasInside = previouslyEntered.contains(region.identifier);

            if (isInside) {
                currentlyEntered.add(region.identifier);
                
                if (!wasInside && region.notifyOnEntry) {
                    // Entered region
                    triggerGeofenceEvent(region, "enter", latitude, longitude, timestamp);
                }
            } else if (wasInside && region.notifyOnExit) {
                // Exited region
                triggerGeofenceEvent(region, "exit", latitude, longitude, timestamp);
            }
        }

        // Save currently entered regions
        saveEnteredRegions(currentlyEntered);
    }

    private boolean isInsideRegion(double latitude, double longitude, GeofenceRegion region) {
        float[] distance = new float[1];
        Location.distanceBetween(
            latitude, longitude,
            region.latitude, region.longitude,
            distance
        );
        
        return distance[0] <= region.radius;
    }

    private void triggerGeofenceEvent(GeofenceRegion region, String action, 
                                    double latitude, double longitude, long timestamp) {
        Log.d(TAG, "Geofence event: " + action + " for region " + region.identifier);
        
        // Send broadcast to notify the app
        Intent intent = new Intent("com.stationtracker.GEOFENCE_EVENT");
        intent.putExtra("identifier", region.identifier);
        intent.putExtra("action", action);
        intent.putExtra("latitude", latitude);
        intent.putExtra("longitude", longitude);
        intent.putExtra("timestamp", timestamp);
        if (region.data != null) {
            intent.putExtra("data", region.data.toString());
        }
        
        context.sendBroadcast(intent);
        
        // Also send to Capacitor plugin if available
        // This would need to be implemented through a singleton or static reference
    }

    public void addRegion(GeofenceRegion region) {
        List<GeofenceRegion> regions = getActiveRegions();
        
        // Remove existing region with same identifier
        regions.removeIf(r -> r.identifier.equals(region.identifier));
        
        // Add new region
        regions.add(region);
        
        saveActiveRegions(regions);
    }

    public void removeRegion(String identifier) {
        List<GeofenceRegion> regions = getActiveRegions();
        regions.removeIf(r -> r.identifier.equals(identifier));
        saveActiveRegions(regions);
        
        Set<String> enteredRegions = getEnteredRegions();
        enteredRegions.remove(identifier);
        saveEnteredRegions(enteredRegions);
    }

    private List<GeofenceRegion> getActiveRegions() {
        List<GeofenceRegion> regions = new ArrayList<>();
        
        try {
            String json = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_ACTIVE_REGIONS, "[]");
            
            JSONArray array = new JSONArray(json);
            for (int i = 0; i < array.length(); i++) {
                JSONObject obj = array.getJSONObject(i);
                GeofenceRegion region = new GeofenceRegion();
                region.identifier = obj.getString("identifier");
                region.latitude = obj.getDouble("latitude");
                region.longitude = obj.getDouble("longitude");
                region.radius = (float) obj.getDouble("radius");
                region.notifyOnEntry = obj.optBoolean("notifyOnEntry", true);
                region.notifyOnExit = obj.optBoolean("notifyOnExit", true);
                
                if (obj.has("data")) {
                    region.data = obj.getJSONObject("data");
                }
                
                regions.add(region);
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error parsing active regions", e);
        }
        
        return regions;
    }

    private void saveActiveRegions(List<GeofenceRegion> regions) {
        try {
            JSONArray array = new JSONArray();
            for (GeofenceRegion region : regions) {
                JSONObject obj = new JSONObject();
                obj.put("identifier", region.identifier);
                obj.put("latitude", region.latitude);
                obj.put("longitude", region.longitude);
                obj.put("radius", region.radius);
                obj.put("notifyOnEntry", region.notifyOnEntry);
                obj.put("notifyOnExit", region.notifyOnExit);
                
                if (region.data != null) {
                    obj.put("data", region.data);
                }
                
                array.put(obj);
            }
            
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_ACTIVE_REGIONS, array.toString())
                .apply();
                
        } catch (JSONException e) {
            Log.e(TAG, "Error saving active regions", e);
        }
    }

    private Set<String> getEnteredRegions() {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getStringSet(KEY_ENTERED_REGIONS, new HashSet<>());
    }

    private void saveEnteredRegions(Set<String> enteredRegions) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putStringSet(KEY_ENTERED_REGIONS, enteredRegions)
            .apply();
    }

    public static class GeofenceRegion {
        public String identifier;
        public double latitude;
        public double longitude;
        public float radius;
        public boolean notifyOnEntry = true;
        public boolean notifyOnExit = true;
        public JSONObject data;
    }
}