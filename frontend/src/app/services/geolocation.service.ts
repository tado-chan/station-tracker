import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BackgroundGeolocationPlugin, Location } from '@capacitor-community/background-geolocation';
import { registerPlugin } from '@capacitor/core';
import { BehaviorSubject } from 'rxjs';
import { Station } from '../models/station.model';
import { StationService } from './station.service';
import { environment } from '../../environments/environment';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');


@Injectable({
  providedIn: 'root'
})
export class GeolocationService {
  private http = inject(HttpClient);
  private currentLocation = new BehaviorSubject<{latitude: number, longitude: number} | null>(null);
  private isTracking = false;
  private watcherId: string | null = null;
  private userId: string = 'default_user';  // TODO: Get from authentication service

  constructor(private stationService: StationService) {}

  async startBackgroundTracking() {
    if (this.isTracking) {
      console.log('Background tracking already started');
      return;
    }

    try {
      // Add location update watcher
      this.watcherId = await BackgroundGeolocation.addWatcher(
        {
          // If backgroundMessage is defined, the watcher will provide location updates whether
          // the app is in the background or the foreground. If it is not defined, location updates
          // are only provided when the app is in the foreground. BackgroundGeolocation.addWatcher
          // must be called when the app is in the foreground.
          backgroundMessage: "駅への到着・出発を記録しています",
          backgroundTitle: "駅記録アプリ",
          requestPermissions: true,
          stale: false,
          distanceFilter: 10
        },
        (location?: Location, error?: any) => {
          if (error) {
            if (error.code === "NOT_AUTHORIZED") {
              console.error("Location permission not granted");
            }
            console.error('Location error:', error);
            return;
          }

          if (location) {
            console.log('Location update:', location);
            this.currentLocation.next({
              latitude: location.latitude,
              longitude: location.longitude
            });

            // Send location to AWS backend
            this.sendLocationToServer(location.latitude, location.longitude, new Date());

            // Check for nearby stations (legacy - will be replaced by AWS ALS)
            this.checkNearbyStations(location.latitude, location.longitude);
          }
        }
      );

      this.isTracking = true;
      console.log('Background tracking started with watcher ID:', this.watcherId);
    } catch (error) {
      console.error('Failed to start background tracking:', error);
      throw error;
    }
  }

  async stopBackgroundTracking() {
    if (!this.isTracking || !this.watcherId) {
      console.log('Background tracking not active');
      return;
    }

    try {
      await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
      this.watcherId = null;
      this.isTracking = false;
      console.log('Background tracking stopped');
    } catch (error) {
      console.error('Failed to stop background tracking:', error);
      throw error;
    }
  }

  private async checkNearbyStations(latitude: number, longitude: number) {
    try {
      // Get nearby stations
      const stations = await this.stationService.getNearbyStations(latitude, longitude).toPromise();

      if (stations && stations.length > 0) {
        console.log('Nearby stations detected:', stations);
        // You can trigger station visit recording here
      }
    } catch (error) {
      console.error('Failed to check nearby stations:', error);
    }
  }

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
    await BackgroundGeolocation.openSettings();
  }

  getTrackingStatus(): boolean {
    return this.isTracking;
  }

  /**
   * Send location data to AWS backend
   */
  private async sendLocationToServer(latitude: number, longitude: number, timestamp: Date) {
    try {
      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        'x-api-key': environment.api.apiKey
      });

      const body = {
        user_id: this.userId,
        lat: latitude,
        lng: longitude,
        timestamp: timestamp.toISOString()
      };

      const url = `${environment.api.baseUrl}${environment.api.endpoints.location}`;

      const response = await this.http.post(url, body, { headers }).toPromise();
      console.log('Location sent to server:', response);

    } catch (error) {
      console.error('Failed to send location to server:', error);
      // Don't throw - we don't want to break the app if the server is down
    }
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
