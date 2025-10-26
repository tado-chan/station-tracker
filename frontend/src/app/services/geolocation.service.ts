import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import { StationTrackerGeolocation } from '../../../station-tracker-geolocation/src';


@Injectable({
  providedIn: 'root'
})
export class GeolocationService {
  private currentLocation = new BehaviorSubject<{latitude: number, longitude: number} | null>(null);
  private isTracking = false;
  private userId: string = 'default_user';  // TODO: Get from authentication service

  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    StationTrackerGeolocation.addListener('locationUpdate', (location) => {
      console.log('Location update from native:', location);
      this.currentLocation.next({
        latitude: location.latitude,
        longitude: location.longitude
      });
    });

    StationTrackerGeolocation.addListener('visitDetected', (visit) => {
      console.log('Visit detected from native:', visit);
    });

    StationTrackerGeolocation.addListener('error', (error) => {
      console.error('Native plugin error:', error.message);
    });
  }

  async startBackgroundTracking() {
    if (this.isTracking) {
      console.log('Background tracking already started');
      return;
    }

    try {
      // Configure API settings
      await StationTrackerGeolocation.configure({
        apiUrl: environment.api.baseUrl,
        apiKey: environment.api.apiKey,
        userId: this.userId,
        endpoint: environment.api.endpoints.location
      });

      // Start tracking
      await StationTrackerGeolocation.startTracking({
        distanceFilter: 10,
        notificationTitle: "駅記録アプリ",
        notificationText: "バックグラウンドで位置を追跡中",
        stationaryRadius: 50,
        stationaryTime: 300
      });

      this.isTracking = true;
      console.log('Background tracking started with native plugin');
    } catch (error) {
      console.error('Failed to start background tracking:', error);
      throw error;
    }
  }

  async stopBackgroundTracking() {
    if (!this.isTracking) {
      console.log('Background tracking not active');
      return;
    }

    try {
      await StationTrackerGeolocation.stopTracking();
      this.isTracking = false;
      console.log('Background tracking stopped');
    } catch (error) {
      console.error('Failed to stop background tracking:', error);
      throw error;
    }
  }

  // Removed: checkNearbyStations - now handled by AWS Lambda

  getCurrentLocation() {
    return this.currentLocation.asObservable();
  }

  async getCurrentPosition() {
    try {
      // Return the last known location or wait for a new one
      const currentValue = this.currentLocation.value;
      if (currentValue) {
        return currentValue;
      }

      // If no location yet, wait for first location update
      return new Promise<{latitude: number, longitude: number}>((resolve, reject) => {
        const subscription = this.currentLocation.subscribe(location => {
          if (location) {
            subscription.unsubscribe();
            resolve(location);
          }
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          subscription.unsubscribe();
          reject(new Error('Location timeout'));
        }, 10000);
      });
    } catch (error) {
      console.error('Failed to get current position:', error);
      throw error;
    }
  }

  async openSettings() {
    // Native plugins don't need this method
    console.log('Open device settings manually for location permissions');
  }

  getTrackingStatus(): boolean {
    return this.isTracking;
  }

  /**
   * Get queue size (pending locations)
   */
  async getQueueSize(): Promise<number> {
    const result = await StationTrackerGeolocation.getQueueSize();
    return result.size;
  }

  /**
   * Force send all pending locations
   */
  async forceSendQueue() {
    await StationTrackerGeolocation.forceSendQueue();
  }

  /**
   * Set user ID for location tracking
   */
  setUserId(userId: string) {
    this.userId = userId;
  }

  /**
   * Get current user ID
   */
  getUserId(): string {
    return this.userId;
  }
}
