package com.stationtracker.plugins;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Stores geofence events for retrieval by the Capacitor plugin
 */
public class GeofenceEventStorage {
    
    private static final String TAG = "GeofenceEventStorage";
    private static final String PREFS_NAME = "geofence_events";
    private static final String KEY_EVENTS = "events";
    private static final int MAX_STORED_EVENTS = 100;

    public static void saveEvent(Context context, String identifier, String action, 
                               double latitude, double longitude, long timestamp) {
        try {
            JSONObject event = new JSONObject();
            event.put("identifier", identifier);
            event.put("action", action);
            event.put("latitude", latitude);
            event.put("longitude", longitude);
            event.put("timestamp", timestamp);

            List<JSONObject> events = getStoredEvents(context);
            events.add(0, event); // Add to beginning

            // Keep only the most recent events
            if (events.size() > MAX_STORED_EVENTS) {
                events = events.subList(0, MAX_STORED_EVENTS);
            }

            saveEvents(context, events);
            
            Log.d(TAG, "Saved geofence event: " + action + " for " + identifier);
            
        } catch (JSONException e) {
            Log.e(TAG, "Error saving geofence event", e);
        }
    }

    public static List<JSONObject> getStoredEvents(Context context) {
        List<JSONObject> events = new ArrayList<>();
        
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String eventsJson = prefs.getString(KEY_EVENTS, "[]");
            
            JSONArray array = new JSONArray(eventsJson);
            for (int i = 0; i < array.length(); i++) {
                events.add(array.getJSONObject(i));
            }
            
        } catch (JSONException e) {
            Log.e(TAG, "Error loading stored events", e);
        }
        
        return events;
    }

    public static void clearEvents(Context context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_EVENTS)
            .apply();
            
        Log.d(TAG, "Cleared stored geofence events");
    }

    public static List<JSONObject> getAndClearEvents(Context context) {
        List<JSONObject> events = getStoredEvents(context);
        clearEvents(context);
        return events;
    }

    private static void saveEvents(Context context, List<JSONObject> events) {
        try {
            JSONArray array = new JSONArray();
            for (JSONObject event : events) {
                array.put(event);
            }
            
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_EVENTS, array.toString())
                .apply();
                
        } catch (Exception e) {
            Log.e(TAG, "Error saving events", e);
        }
    }
}