import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import BackgroundGeofence, { GeofenceEvent, GeofenceRegion } from '../plugins/background-geofence';
import { Station } from '../app/models/station.model';
import { StationService } from '../app/services/station.service';

@Injectable({
  providedIn: 'root'
})
export class BackgroundGeofenceService {
  private isTracking = new BehaviorSubject<boolean>(false);
  private geofenceEvents = new BehaviorSubject<GeofenceEvent[]>([]);
  private stations: Station[] = [];
  private activeRegions: GeofenceRegion[] = [];

  constructor(private stationService: StationService) {
    this.loadStations();
    this.setupEventListeners();
  }

  async loadStations() {
    try {
      this.stations = await this.stationService.getAllStations().toPromise() || [];
      console.log(`Loaded ${this.stations.length} stations for geofencing`);
    } catch (error) {
      console.error('Failed to load stations:', error);
    }
  }

  private setupEventListeners() {
    // Listen for geofence events from native plugin
    BackgroundGeofence.addListener('geofenceEvent', (event: GeofenceEvent) => {
      this.handleGeofenceEvent(event);
    });

    // Listen for location updates
    BackgroundGeofence.addListener('locationUpdate', (location: any) => {
      console.log('Location update:', location);
    });
  }

  async startNativeGeofencing(): Promise<boolean> {
    try {
      // Check permissions first
      const permissions = await BackgroundGeofence.checkPermissions();
      if (permissions.backgroundLocation !== 'granted') {
        const requested = await BackgroundGeofence.requestPermissions();
        if (requested.backgroundLocation !== 'granted') {
          throw new Error('Background location permission required');
        }
      }

      // Start native geofencing
      await BackgroundGeofence.startGeofencing({
        enableHighAccuracy: true,
        notification: {
          title: '駅記録アプリ',
          text: 'バックグラウンドで位置を追跡中...'
        },
        distanceFilter: 10,
        interval: 15000 // 15 seconds for Android WorkManager
      });

      // Add nearby stations as geofence regions
      await this.setupNearbyGeofences();

      this.isTracking.next(true);
      return true;

    } catch (error) {
      console.error('Failed to start native geofencing:', error);
      this.isTracking.next(false);
      return false;
    }
  }

  async stopNativeGeofencing(): Promise<void> {
    try {
      await BackgroundGeofence.stopGeofencing();
      
      // Remove all geofences
      if (this.activeRegions.length > 0) {
        const identifiers = this.activeRegions.map(r => r.identifier);
        await BackgroundGeofence.removeGeofences({ identifiers });
        this.activeRegions = [];
      }

      this.isTracking.next(false);
    } catch (error) {
      console.error('Failed to stop native geofencing:', error);
    }
  }

  private async setupNearbyGeofences(currentLocation?: { latitude: number; longitude: number }) {
    try {
      let location = currentLocation;
      
      if (!location) {
        try {
          location = await BackgroundGeofence.getCurrentLocation();
        } catch (error) {
          console.warn('Could not get current location for geofence setup');
          return;
        }
      }

      // Find nearby stations (within 5km)
      const nearbyStations = this.stations.filter(station => {
        const distance = this.calculateDistance(
          location!.latitude, location!.longitude,
          station.latitude, station.longitude
        );
        return distance <= 5000; // 5km radius
      });

      console.log(`Setting up geofences for ${nearbyStations.length} nearby stations`);

      // Convert stations to geofence regions
      const geofenceRegions: GeofenceRegion[] = nearbyStations.map(station => ({
        identifier: `station-${station.id}`,
        latitude: station.latitude,
        longitude: station.longitude,
        radius: this.getStationRadius(station),
        notifyOnEntry: true,
        notifyOnExit: true,
        data: {
          stationId: station.id,
          stationName: station.name,
          line: station.line
        }
      }));

      // Add geofences to native system
      if (geofenceRegions.length > 0) {
        await BackgroundGeofence.addGeofences({ geofences: geofenceRegions });
        this.activeRegions = geofenceRegions;
        
        console.log(`Added ${geofenceRegions.length} geofence regions`);
      }

    } catch (error) {
      console.error('Failed to setup nearby geofences:', error);
    }
  }

  private getStationRadius(station: Station): number {
    // Try to parse polygon data to determine optimal radius
    try {
      const polygon = JSON.parse(station.polygon_data);
      if (polygon.type === 'Polygon' && polygon.coordinates && polygon.coordinates[0]) {
        // Calculate bounding box and use as radius
        const coords = polygon.coordinates[0];
        let minLat = coords[0][1], maxLat = coords[0][1];
        let minLng = coords[0][0], maxLng = coords[0][0];
        
        for (const coord of coords) {
          minLat = Math.min(minLat, coord[1]);
          maxLat = Math.max(maxLat, coord[1]);
          minLng = Math.min(minLng, coord[0]);
          maxLng = Math.max(maxLng, coord[0]);
        }
        
        const latDistance = this.calculateDistance(minLat, station.longitude, maxLat, station.longitude);
        const lngDistance = this.calculateDistance(station.latitude, minLng, station.latitude, maxLng);
        
        return Math.max(latDistance, lngDistance) / 2 + 50; // Add 50m buffer
      }
    } catch (error) {
      console.warn('Could not parse polygon for station', station.id);
    }
    
    // Fallback to default radius
    return 100; // 100m default
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  }

  private handleGeofenceEvent(event: GeofenceEvent) {
    console.log('Native geofence event:', event);
    
    // Find corresponding station
    const stationId = event.data?.stationId;
    const station = this.stations.find(s => s.id === stationId);
    
    if (station) {
      // Record station visit
      this.recordStationVisit(station, event);
    }

    // Update events list
    const currentEvents = this.geofenceEvents.value;
    this.geofenceEvents.next([...currentEvents, event]);
  }

  private async recordStationVisit(station: Station, event: GeofenceEvent) {
    try {
      if (event.action === 'enter') {
        const visit = {
          station: station.id,
          arrived_at: new Date(event.timestamp).toISOString(),
          latitude: event.latitude,
          longitude: event.longitude,
          weather: await this.getCurrentWeather({ latitude: event.latitude, longitude: event.longitude })
        };

        await this.stationService.createVisit(visit).toPromise();
        console.log(`Recorded visit to ${station.name}`);
      }
    } catch (error) {
      console.error('Failed to record station visit:', error);
    }
  }

  private async getCurrentWeather(location: { latitude: number; longitude: number }): Promise<string> {
    // Mock implementation - replace with real weather API
    const weatherTypes = ['晴れ', '曇り', '雨', '雪'];
    return weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
  }

  // Observable getters
  getTrackingStatus() {
    return this.isTracking.asObservable();
  }

  getGeofenceEvents() {
    return this.geofenceEvents.asObservable();
  }

  // Update geofences based on location change
  async updateGeofencesForLocation(latitude: number, longitude: number) {
    await this.setupNearbyGeofences({ latitude, longitude });
  }
}