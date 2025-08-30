import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonCard, IonCardContent,
  IonCardHeader, IonCardTitle, IonIcon, IonItem, IonLabel, IonBadge, IonList,
  IonProgressBar, IonToggle
} from '@ionic/angular/standalone';

import { IntegratedGeofenceService, IntegratedTrackingStatus } from '../../../services/integrated-geofence.service';
import { GeofenceManagerService, GeofenceStats } from '../../../services/geofence-manager.service';
import { CloudSyncService, SyncStatus } from '../../../services/cloud-sync.service';
import { StationService } from '../../services/station.service';
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
  trackingStatus: IntegratedTrackingStatus = {
    isActive: false,
    nativeGeofencing: false,
    jsGeofencing: false,
    backgroundMode: false,
    cloudSync: false,
    activeRegions: 0,
    lastLocationUpdate: null,
    batteryOptimized: true
  };
  
  geofenceStats: GeofenceStats = {
    activeRegions: 0,
    maxRegions: 20,
    nearbyStations: 0,
    totalStations: 0,
    lastOptimization: null
  };
  
  syncStatus: SyncStatus = {
    isOnline: false,
    lastSync: null,
    pendingEvents: 0,
    syncErrors: 0,
    totalEventsSynced: 0
  };
  
  currentLocation: { latitude: number; longitude: number } | null = null;
  nearbyStations: Station[] = [];
  todayVisits: StationVisit[] = [];
  isInitializing = false;
  
  private subscriptions: Subscription[] = [];

  constructor(
    private integratedGeofence: IntegratedGeofenceService,
    private geofenceManager: GeofenceManagerService,
    private cloudSync: CloudSyncService,
    private stationService: StationService
  ) {}

  async ngOnInit() {
    try {
      this.isInitializing = true;
      
      // Initialize integrated geofence system
      await this.integratedGeofence.initialize();
      
      // Subscribe to tracking status
      this.subscriptions.push(
        this.integratedGeofence.getTrackingStatus().subscribe((status: any) => {
          this.trackingStatus = status;
        })
      );
      
      // Subscribe to geofence statistics
      this.subscriptions.push(
        this.geofenceManager.getStats().subscribe((stats: any) => {
          this.geofenceStats = stats;
        })
      );
      
      // Subscribe to cloud sync status
      this.subscriptions.push(
        this.cloudSync.getSyncStatus().subscribe((status: any) => {
          this.syncStatus = status;
        })
      );
      
      // Subscribe to current location
      this.subscriptions.push(
        this.geofenceManager.getCurrentLocation().subscribe((location: any) => {
          this.currentLocation = location;
          if (location) {
            this.loadNearbyStations(location.latitude, location.longitude);
          }
        })
      );

      // Load today's visits
      await this.loadTodayVisits();
      
    } catch (error) {
      console.error('Failed to initialize home page:', error);
    } finally {
      this.isInitializing = false;
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  async toggleTracking() {
    try {
      if (this.trackingStatus.isActive) {
        await this.integratedGeofence.stopTracking();
      } else {
        const success = await this.integratedGeofence.startTracking();
        if (!success) {
          console.error('Failed to start integrated tracking');
          // Show error message to user
        }
      }
    } catch (error) {
      console.error('Failed to toggle tracking:', error);
      // Show error message to user
    }
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

  // New methods for integrated system
  async forceOptimization() {
    try {
      await this.geofenceManager.forceOptimization();
      console.log('Manual optimization completed');
    } catch (error) {
      console.error('Manual optimization failed:', error);
    }
  }

  async forcSync() {
    try {
      await this.cloudSync.forcSync();
      console.log('Manual sync completed');
    } catch (error) {
      console.error('Manual sync failed:', error);
    }
  }

  async getSystemStatus() {
    try {
      const status = await this.integratedGeofence.getSystemStatus();
      console.log('System status:', status);
      return status;
    } catch (error) {
      console.error('Failed to get system status:', error);
      return null;
    }
  }

  getTrackingStatusColor(): string {
    if (!this.trackingStatus.isActive) return 'medium';
    if (this.trackingStatus.nativeGeofencing && this.trackingStatus.backgroundMode) return 'success';
    if (this.trackingStatus.jsGeofencing) return 'warning';
    return 'danger';
  }

  getSyncStatusColor(): string {
    if (!this.syncStatus.isOnline) return 'danger';
    if (this.syncStatus.pendingEvents > 10) return 'warning';
    if (this.syncStatus.syncErrors > 5) return 'warning';
    return 'success';
  }

  getBatteryOptimizationColor(): string {
    return this.trackingStatus.batteryOptimized ? 'success' : 'warning';
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

  calculateDistance(station: Station): number | null {
    if (!this.currentLocation) return null;
    
    const R = 6371e3; // Earth's radius in meters
    const φ1 = this.currentLocation.latitude * Math.PI/180;
    const φ2 = station.latitude * Math.PI/180;
    const Δφ = (station.latitude - this.currentLocation.latitude) * Math.PI/180;
    const Δλ = (station.longitude - this.currentLocation.longitude) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return Math.round(R * c); // Distance in meters
  }
}