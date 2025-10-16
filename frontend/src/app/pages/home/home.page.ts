import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonCard, IonCardContent,
  IonCardHeader, IonCardTitle, IonIcon, IonItem, IonLabel, IonBadge, IonList,
  IonProgressBar, IonToggle
} from '@ionic/angular/standalone';

import { StationService } from '../../services/station.service';
import { GeolocationService } from '../../services/geolocation.service';
import { Station, StationVisit } from '../../models/station.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonCard, IonCardContent,
    IonCardHeader, IonCardTitle, IonIcon, IonItem, IonLabel, IonBadge, IonList,
    IonProgressBar, IonToggle
  ]
})
export class HomePage implements OnInit, OnDestroy {

  currentLocation: { latitude: number; longitude: number } | null = null;
  nearbyStations: Station[] = [];
  todayVisits: StationVisit[] = [];
  isInitializing = false;

  trackingStatus = {
    isActive: false,
    nativeGeofencing: false,
    backgroundMode: false,
    locationServices: false,
    activeRegions: 0,
    lastLocationUpdate: null as Date | null,
    batteryOptimized: false
  };

  syncStatus = {
    isOnline: navigator.onLine,
    lastSync: null as Date | null,
    pendingCount: 0,
    pendingEvents: 0,
    syncErrors: 0,
    totalEventsSynced: 0
  };

  geofenceStats = {
    maxRegions: 20,
    activeRegions: 0,
    nearbyStations: 0,
    totalStations: 0,
    lastOptimization: null as Date | null
  };

  private subscriptions: Subscription[] = [];

  constructor(
    private stationService: StationService,
    private geolocationService: GeolocationService
  ) {}

  async ngOnInit() {
    try {
      this.isInitializing = true;

      // Subscribe to location updates
      const locationSub = this.geolocationService.getCurrentLocation().subscribe(location => {
        if (location) {
          this.currentLocation = location;
          this.trackingStatus.lastLocationUpdate = new Date();
          this.loadNearbyStations(location.latitude, location.longitude);
        }
      });
      this.subscriptions.push(locationSub);

      // Load today's visits
      await this.loadTodayVisits();

      // Check if tracking is active
      this.trackingStatus.isActive = this.geolocationService.getTrackingStatus();

    } catch (error) {
      console.error('Failed to initialize home page:', error);
    } finally {
      this.isInitializing = false;
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }


  private async loadNearbyStations(lat: number, lng: number) {
    try {
      this.nearbyStations = await this.stationService.getNearbyStations(lat, lng).toPromise() || [];
    } catch (error) {
      console.error('Failed to load nearby stations:', error);
    }
  }

  private async loadTodayVisits() {
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      this.todayVisits = await this.stationService.getVisitsByDateRange(
        startOfDay.toISOString(),
        endOfDay.toISOString()
      ).toPromise() || [];
    } catch (error) {
      console.error('Failed to load today visits:', error);
    }
  }


  // Removed old unused methods

  formatEventTime(timestamp: Date): string {
    return new Date(timestamp).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  getEventIcon(type: 'enter' | 'exit'): string {
    return type === 'enter' ? 'log-in' : 'log-out';
  }

  getEventColor(type: 'enter' | 'exit'): string {
    return type === 'enter' ? 'success' : 'warning';
  }

  getTrackingStatusColor(): string {
    return this.trackingStatus.isActive ? 'success' : 'medium';
  }

  toggleTracking(): void {
    this.trackingStatus.isActive = !this.trackingStatus.isActive;
    if (this.trackingStatus.isActive) {
      this.startTracking();
    } else {
      this.stopTracking();
    }
  }

  private async startTracking(): Promise<void> {
    try {
      console.log('Starting background tracking...');
      await this.geolocationService.startBackgroundTracking();
      this.trackingStatus.nativeGeofencing = true;
      this.trackingStatus.backgroundMode = true;
      this.trackingStatus.locationServices = true;
    } catch (error) {
      console.error('Failed to start tracking:', error);
      this.trackingStatus.isActive = false;
    }
  }

  private async stopTracking(): Promise<void> {
    try {
      console.log('Stopping background tracking...');
      await this.geolocationService.stopBackgroundTracking();
      this.trackingStatus.nativeGeofencing = false;
      this.trackingStatus.backgroundMode = false;
      this.trackingStatus.locationServices = false;
    } catch (error) {
      console.error('Failed to stop tracking:', error);
    }
  }

  forceOptimization(): void {
    console.log('Force optimization requested');
  }

  forcSync(): void {
    if (this.syncStatus.isOnline) {
      console.log('Force sync requested');
      this.syncStatus.lastSync = new Date();
    }
  }

  getSystemStatus(): void {
    console.log('System status check requested');
  }

  calculateDistance(station: Station): number | null {
    if (!this.currentLocation) {
      return null;
    }

    const lat1 = this.currentLocation.latitude;
    const lon1 = this.currentLocation.longitude;
    const lat2 = station.latitude;
    const lon2 = station.longitude;

    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c);
  }

  getSyncStatusColor(): string {
    if (!this.syncStatus.isOnline) return 'danger';
    if (this.syncStatus.syncErrors > 0) return 'warning';
    return 'success';
  }

  getBatteryOptimizationColor(): string {
    return this.trackingStatus.batteryOptimized ? 'success' : 'warning';
  }

}