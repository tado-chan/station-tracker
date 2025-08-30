import { Injectable } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { BackgroundMode } from '@anuradev/capacitor-background-mode';
import { BehaviorSubject } from 'rxjs';
import { Station, StationVisit } from '../models/station.model';
import { StationService } from './station.service';

export interface GeofenceEvent {
  station: Station;
  type: 'enter' | 'exit';
  timestamp: Date;
  location: { latitude: number; longitude: number };
}

@Injectable({
  providedIn: 'root'
})
export class GeolocationService {
  private watchId: string | null = null;
  private isTracking = false;
  private currentLocation = new BehaviorSubject<{latitude: number, longitude: number} | null>(null);
  private geofenceEvents = new BehaviorSubject<GeofenceEvent[]>([]);
  private stations: Station[] = [];
  private currentStationVisits = new Map<number, Date>();

  constructor(private stationService: StationService) {
    this.loadStations();
  }

  async loadStations() {
    try {
      this.stations = await this.stationService.getAllStations().toPromise() || [];
    } catch (error) {
      console.error('Failed to load stations:', error);
    }
  }

  async startTracking(): Promise<void> {
    try {
      // Request permissions
      const permissions = await Geolocation.requestPermissions();
      if (permissions.location !== 'granted') {
        throw new Error('Location permission not granted');
      }

      // Enable background mode for continuous tracking
      try {
        await BackgroundMode.enable({} as any);
      } catch (error) {
        console.warn('Background mode enable failed:', error);
      }
      console.log('Background mode enabled');

      this.isTracking = true;
      
      // Start watching position
      this.watchId = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 5000
        },
        (position, err) => {
          if (err) {
            console.error('Geolocation error:', err);
            return;
          }

          if (position) {
            const coords = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            };
            
            this.currentLocation.next(coords);
            this.checkGeofences(coords);
          }
        }
      );

      // Background mode configuration is handled in capacitor.config.ts
      // No additional settings method available

    } catch (error) {
      console.error('Failed to start tracking:', error);
      this.isTracking = false;
      throw error;
    }
  }

  async stopTracking(): Promise<void> {
    if (this.watchId) {
      await Geolocation.clearWatch({ id: this.watchId });
      this.watchId = null;
    }
    
    // Disable background mode
    try {
      await BackgroundMode.disable();
    } catch (error) {
      console.warn('Background mode disable failed:', error);
    }
    console.log('Background mode disabled');
    
    this.isTracking = false;
    this.currentLocation.next(null);
  }

  private checkGeofences(currentPos: { latitude: number; longitude: number }) {
    for (const station of this.stations) {
      const isInside = this.isInsideStation(currentPos, station);
      const wasInside = this.currentStationVisits.has(station.id);

      if (isInside && !wasInside) {
        // Entered station
        this.currentStationVisits.set(station.id, new Date());
        this.emitGeofenceEvent(station, 'enter', currentPos);
        this.recordStationVisit(station, currentPos, 'enter');
      } else if (!isInside && wasInside) {
        // Exited station
        const enterTime = this.currentStationVisits.get(station.id);
        this.currentStationVisits.delete(station.id);
        this.emitGeofenceEvent(station, 'exit', currentPos);
        this.recordStationVisit(station, currentPos, 'exit', enterTime);
      }
    }
  }

  private isInsideStation(
    point: { latitude: number; longitude: number },
    station: Station
  ): boolean {
    try {
      const polygon = JSON.parse(station.polygon_data);
      
      if (polygon.type === 'Polygon' && polygon.coordinates && polygon.coordinates[0]) {
        return this.pointInPolygon(point, polygon.coordinates[0]);
      }
      
      // Fallback to distance check if polygon parsing fails
      const distance = this.calculateDistance(
        point.latitude, point.longitude,
        station.latitude, station.longitude
      );
      return distance <= 100; // 100m radius
      
    } catch (error) {
      console.error('Error checking station polygon:', error);
      // Fallback to simple distance check
      const distance = this.calculateDistance(
        point.latitude, point.longitude,
        station.latitude, station.longitude
      );
      return distance <= 100;
    }
  }

  private pointInPolygon(
    point: { latitude: number; longitude: number },
    polygon: number[][]
  ): boolean {
    const x = point.longitude;
    const y = point.latitude;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];

      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
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

  private emitGeofenceEvent(
    station: Station,
    type: 'enter' | 'exit',
    location: { latitude: number; longitude: number }
  ) {
    const event: GeofenceEvent = {
      station,
      type,
      timestamp: new Date(),
      location
    };

    const currentEvents = this.geofenceEvents.value;
    this.geofenceEvents.next([...currentEvents, event]);
  }

  private async recordStationVisit(
    station: Station,
    location: { latitude: number; longitude: number },
    type: 'enter' | 'exit',
    enterTime?: Date
  ) {
    try {
      if (type === 'enter') {
        // Create new visit record
        const visit: Partial<StationVisit> = {
          station: station.id,
          arrived_at: new Date().toISOString(),
          latitude: location.latitude,
          longitude: location.longitude,
          weather: await this.getCurrentWeather(location)
        };

        await this.stationService.createVisit(visit).toPromise();
      } else if (type === 'exit' && enterTime) {
        // Update visit record with departure time
        // This would require a more complex implementation to track the visit ID
        console.log(`Exited ${station.name} after ${new Date().getTime() - enterTime.getTime()}ms`);
      }
    } catch (error) {
      console.error('Failed to record station visit:', error);
    }
  }

  private async getCurrentWeather(location: { latitude: number; longitude: number }): Promise<string> {
    // Mock weather data - in real implementation, call weather API
    const weatherTypes = ['晴れ', '曇り', '雨', '雪'];
    return weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
  }

  getCurrentLocation() {
    return this.currentLocation.asObservable();
  }

  getGeofenceEvents() {
    return this.geofenceEvents.asObservable();
  }

  getTrackingStatus(): boolean {
    return this.isTracking;
  }

  async getCurrentPosition() {
    try {
      const position = await Geolocation.getCurrentPosition();
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
    } catch (error) {
      console.error('Failed to get current position:', error);
      throw error;
    }
  }
}