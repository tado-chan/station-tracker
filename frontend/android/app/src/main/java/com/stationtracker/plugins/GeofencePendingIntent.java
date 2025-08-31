package com.stationtracker.plugins;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;

import java.util.List;

/**
 * Handles geofence transition events from Google Play Services
 */
public class GeofencePendingIntent {
    
    private static final String TAG = "GeofencePendingIntent";
    private static PendingIntent pendingIntent;

    public static PendingIntent getPendingIntent(Context context) {
        if (pendingIntent != null) {
            return pendingIntent;
        }
        
        Intent intent = new Intent(context, GeofenceReceiver.class);
        pendingIntent = PendingIntent.getBroadcast(
            context, 
            0, 
            intent, 
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
        );
        
        return pendingIntent;
    }

    /**
     * BroadcastReceiver for geofence transition events
     */
    public static class GeofenceReceiver extends BroadcastReceiver {
        
        @Override
        public void onReceive(Context context, Intent intent) {
            GeofencingEvent geofencingEvent = GeofencingEvent.fromIntent(intent);
            
            if (geofencingEvent == null) {
                Log.e(TAG, "Geofencing event is null");
                return;
            }
            
            if (geofencingEvent.hasError()) {
                Log.e(TAG, "Geofencing error: " + geofencingEvent.getErrorCode());
                return;
            }

            // Get the transition type
            int geofenceTransition = geofencingEvent.getGeofenceTransition();
            String action;
            
            switch (geofenceTransition) {
                case Geofence.GEOFENCE_TRANSITION_ENTER:
                    action = "enter";
                    break;
                case Geofence.GEOFENCE_TRANSITION_EXIT:
                    action = "exit";
                    break;
                default:
                    Log.e(TAG, "Invalid geofence transition type: " + geofenceTransition);
                    return;
            }

            // Get the geofences that were triggered
            List<Geofence> triggeringGeofences = geofencingEvent.getTriggeringGeofences();
            if (triggeringGeofences == null || triggeringGeofences.isEmpty()) {
                Log.e(TAG, "No triggering geofences");
                return;
            }

            // Get location information
            android.location.Location location = geofencingEvent.getTriggeringLocation();
            double latitude = location != null ? location.getLatitude() : 0.0;
            double longitude = location != null ? location.getLongitude() : 0.0;
            long timestamp = location != null ? location.getTime() : System.currentTimeMillis();

            // Process each triggered geofence
            for (Geofence geofence : triggeringGeofences) {
                String identifier = geofence.getRequestId();
                
                Log.d(TAG, "Geofence transition: " + action + " for " + identifier + 
                    " at (" + latitude + ", " + longitude + ")");

                // Send broadcast to notify the app
                Intent broadcastIntent = new Intent("com.stationtracker.GEOFENCE_EVENT");
                broadcastIntent.putExtra("identifier", identifier);
                broadcastIntent.putExtra("action", action);
                broadcastIntent.putExtra("latitude", latitude);
                broadcastIntent.putExtra("longitude", longitude);
                broadcastIntent.putExtra("timestamp", timestamp);
                
                context.sendBroadcast(broadcastIntent);
                
                // Also save to local storage for app retrieval
                GeofenceEventStorage.saveEvent(context, identifier, action, latitude, longitude, timestamp);
            }
        }
    }
}