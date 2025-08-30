import { Component, OnInit, OnDestroy } from '@angular/core';
import { GeolocationService, GeofenceEvent } from '../../services/geolocation.service';
import { NotificationService } from '../../services/notification.service';
import { StationService } from '../../services/station.service';
import { Station, StationVisit } from '../../models/station.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss']
})
export class HomePage implements OnInit, OnDestroy {
  isTracking = false;
  currentLocation: { latitude: number; longitude: number } | null = null;
  nearbyStations: Station[] = [];
  recentEvents: GeofenceEvent[] = [];
  todayVisits: StationVisit[] = [];
  
  private subscriptions: Subscription[] = [];

  constructor(
    private geolocationService: GeolocationService,
    private notificationService: NotificationService,
    private stationService: StationService
  ) {}

  async ngOnInit() {
    // Subscribe to location updates
    this.subscriptions.push(
      this.geolocationService.getCurrentLocation().subscribe(location => {
        this.currentLocation = location;
        if (location) {
          this.loadNearbyStations(location.latitude, location.longitude);
        }
      })
    );

    // Subscribe to geofence events
    this.subscriptions.push(
      this.geolocationService.getGeofenceEvents().subscribe(events => {
        this.recentEvents = events.slice(-5).reverse(); // Show last 5 events
        
        // Handle notifications for new events
        const latestEvent = events[events.length - 1];
        if (latestEvent) {
          this.handleGeofenceEvent(latestEvent);
        }
      })
    );

    // Load today's visits
    this.loadTodayVisits();
    
    // Check current tracking status
    this.isTracking = this.geolocationService.getTrackingStatus();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  async toggleTracking() {
    try {
      if (this.isTracking) {
        await this.geolocationService.stopTracking();
        this.isTracking = false;
      } else {
        await this.geolocationService.startTracking();
        this.isTracking = true;
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

  private handleGeofenceEvent(event: GeofenceEvent) {
    if (event.type === 'enter') {
      this.notificationService.sendStationEntryNotification(event.station);
    } else if (event.type === 'exit') {
      // Calculate duration if available
      const enterEvent = this.recentEvents.find(e => 
        e.station.id === event.station.id && 
        e.type === 'enter' && 
        e.timestamp < event.timestamp
      );
      
      const durationMinutes = enterEvent 
        ? Math.round((event.timestamp.getTime() - enterEvent.timestamp.getTime()) / (1000 * 60))
        : undefined;
        
      this.notificationService.sendStationExitNotification(event.station, durationMinutes);
    }
  }

  async getCurrentPosition() {
    try {
      const position = await this.geolocationService.getCurrentPosition();
      this.currentLocation = position;
      this.loadNearbyStations(position.latitude, position.longitude);
    } catch (error) {
      console.error('Failed to get current position:', error);
    }
  }

  async testNotification() {
    await this.notificationService.testNotification();
  }

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