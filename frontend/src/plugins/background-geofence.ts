import { registerPlugin } from '@capacitor/core';

export interface BackgroundGeofencePlugin {
  /**
   * Start native background geofencing
   */
  startGeofencing(options: GeofencingOptions): Promise<{ success: boolean }>;

  /**
   * Stop native background geofencing
   */
  stopGeofencing(): Promise<{ success: boolean }>;

  /**
   * Add geofence regions
   */
  addGeofences(options: { geofences: GeofenceRegion[] }): Promise<{ success: boolean }>;

  /**
   * Remove geofence regions
   */
  removeGeofences(options: { identifiers: string[] }): Promise<{ success: boolean }>;

  /**
   * Get current location
   */
  getCurrentLocation(): Promise<LocationResult>;

  /**
   * Check if background location permission is granted
   */
  checkPermissions(): Promise<PermissionStatus>;

  /**
   * Request background location permission
   */
  requestPermissions(): Promise<PermissionStatus>;

  /**
   * Add event listener
   */
  addListener(eventName: string, listenerFunc: (data: any) => void): Promise<any>;

  /**
   * Remove event listener
   */
  removeAllListeners(): Promise<void>;
}

export interface GeofencingOptions {
  /**
   * Enable high accuracy GPS
   */
  enableHighAccuracy?: boolean;
  
  /**
   * Notification settings for Android Foreground Service
   */
  notification?: {
    title: string;
    text: string;
    iconName?: string;
  };

  /**
   * Minimum distance between updates (meters)
   */
  distanceFilter?: number;

  /**
   * Update interval in milliseconds (Android WorkManager)
   */
  interval?: number;
}

export interface GeofenceRegion {
  /**
   * Unique identifier for the region
   */
  identifier: string;

  /**
   * Center latitude
   */
  latitude: number;

  /**
   * Center longitude
   */
  longitude: number;

  /**
   * Radius in meters
   */
  radius: number;

  /**
   * Monitor for entry events
   */
  notifyOnEntry?: boolean;

  /**
   * Monitor for exit events
   */
  notifyOnExit?: boolean;

  /**
   * Additional data to associate with region
   */
  data?: any;
}

export interface LocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface PermissionStatus {
  location: 'granted' | 'denied' | 'prompt';
  backgroundLocation: 'granted' | 'denied' | 'prompt' | 'not-available';
}

export interface GeofenceEvent {
  identifier: string;
  action: 'enter' | 'exit';
  latitude: number;
  longitude: number;
  timestamp: number;
  data?: any;
}

const BackgroundGeofence = registerPlugin<BackgroundGeofencePlugin>('BackgroundGeofence', {
  web: () => import('./background-geofence.web').then(m => new m.BackgroundGeofenceWeb()),
});

export default BackgroundGeofence;