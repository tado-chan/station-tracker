import { WebPlugin } from '@capacitor/core';
import type { BackgroundGeofencePlugin, GeofencingOptions, GeofenceRegion, LocationResult, PermissionStatus } from './background-geofence';

export class BackgroundGeofenceWeb extends WebPlugin implements BackgroundGeofencePlugin {
  
  async startGeofencing(options: GeofencingOptions): Promise<{ success: boolean }> {
    console.log('BackgroundGeofence: Web implementation - startGeofencing not fully supported');
    return { success: false };
  }

  async stopGeofencing(): Promise<{ success: boolean }> {
    console.log('BackgroundGeofence: Web implementation - stopGeofencing');
    return { success: true };
  }

  async addGeofences(options: { geofences: GeofenceRegion[] }): Promise<{ success: boolean }> {
    console.log('BackgroundGeofence: Web implementation - addGeofences', options.geofences.length);
    return { success: false };
  }

  async removeGeofences(options: { identifiers: string[] }): Promise<{ success: boolean }> {
    console.log('BackgroundGeofence: Web implementation - removeGeofences', options.identifiers);
    return { success: false };
  }

  async getCurrentLocation(): Promise<LocationResult> {
    if ('geolocation' in navigator) {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: position.timestamp
            });
          },
          (error) => reject(error),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      });
    }
    throw new Error('Geolocation not supported');
  }

  async checkPermissions(): Promise<PermissionStatus> {
    return {
      location: 'prompt',
      backgroundLocation: 'not-available'
    };
  }

  async requestPermissions(): Promise<PermissionStatus> {
    return {
      location: 'prompt',
      backgroundLocation: 'not-available'
    };
  }
}