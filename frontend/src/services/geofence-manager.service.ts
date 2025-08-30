import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Station } from '../app/models/station.model';
import BackgroundGeofence, { GeofenceRegion } from '../plugins/background-geofence';

export interface GeofenceRegionInfo extends GeofenceRegion {
  station: Station;
  priority: number;
  lastUpdated: Date;
  distanceFromUser?: number;
}

export interface GeofenceStats {
  activeRegions: number;
  maxRegions: number;
  nearbyStations: number;
  totalStations: number;
  lastOptimization: Date | null;
}

@Injectable({
  providedIn: 'root'
})
export class GeofenceManagerService {
  
  // OS limits for geofence regions
  private readonly MAX_ANDROID_REGIONS = 100;
  private readonly MAX_IOS_REGIONS = 20;
  private readonly OPTIMIZATION_RADIUS = 10000; // 10km
  private readonly HIGH_PRIORITY_RADIUS = 2000; // 2km
  private readonly MEDIUM_PRIORITY_RADIUS = 5000; // 5km
  
  private currentLocation = new BehaviorSubject<{ latitude: number; longitude: number } | null>(null);
  private activeRegions = new BehaviorSubject<GeofenceRegionInfo[]>([]);
  private stats = new BehaviorSubject<GeofenceStats>({
    activeRegions: 0,
    maxRegions: this.getMaxRegions(),
    nearbyStations: 0,
    totalStations: 0,
    lastOptimization: null
  });

  private allStations: Station[] = [];
  private regionStorage: Map<string, GeofenceRegionInfo> = new Map();
  
  constructor() {
    this.loadStoredRegions();
  }

  async initialize(stations: Station[]) {
    this.allStations = stations;
    this.updateStats({ totalStations: stations.length });
    console.log(`GeofenceManager initialized with ${stations.length} stations`);
  }

  /**
   * Update user location and optimize geofence regions
   */
  async updateLocation(latitude: number, longitude: number) {
    const newLocation = { latitude, longitude };
    const previousLocation = this.currentLocation.value;
    
    this.currentLocation.next(newLocation);

    // Check if significant movement occurred
    if (previousLocation) {
      const distance = this.calculateDistance(
        previousLocation.latitude, previousLocation.longitude,
        latitude, longitude
      );
      
      // Only optimize if moved more than 1km
      if (distance < 1000) {
        return;
      }
    }

    await this.optimizeGeofenceRegions(newLocation);
  }

  /**
   * Optimize geofence regions based on current location and OS limits
   */
  private async optimizeGeofenceRegions(location: { latitude: number; longitude: number }) {
    try {
      console.log('Optimizing geofence regions...');
      
      // Find nearby stations within optimization radius
      const nearbyStations = this.allStations
        .map(station => ({
          station,
          distance: this.calculateDistance(
            location.latitude, location.longitude,
            station.latitude, station.longitude
          )
        }))
        .filter(item => item.distance <= this.OPTIMIZATION_RADIUS)
        .sort((a, b) => a.distance - b.distance);

      this.updateStats({ nearbyStations: nearbyStations.length });

      // Prioritize stations
      const prioritizedStations = this.prioritizeStations(nearbyStations, location);
      
      // Select top stations within OS limits
      const maxRegions = this.getMaxRegions();
      const selectedStations = prioritizedStations.slice(0, maxRegions);

      // Create geofence regions
      const newRegions: GeofenceRegionInfo[] = selectedStations.map((item, index) => {
        const station = item.station;
        const radius = this.calculateOptimalRadius(station, item.distance);
        
        return {
          identifier: `station-${station.id}`,
          latitude: station.latitude,
          longitude: station.longitude,
          radius,
          notifyOnEntry: true,
          notifyOnExit: true,
          data: {
            stationId: station.id,
            stationName: station.name,
            line: station.line,
            priority: item.priority
          },
          station,
          priority: item.priority,
          lastUpdated: new Date(),
          distanceFromUser: item.distance
        };
      });

      // Update active regions
      await this.updateActiveRegions(newRegions);
      
      this.updateStats({ 
        activeRegions: newRegions.length,
        lastOptimization: new Date()
      });

      console.log(`Optimized to ${newRegions.length} geofence regions`);
      
    } catch (error) {
      console.error('Failed to optimize geofence regions:', error);
    }
  }

  /**
   * Prioritize stations based on distance, line importance, and user behavior
   */
  private prioritizeStations(
    nearbyStations: { station: Station; distance: number }[],
    location: { latitude: number; longitude: number }
  ) {
    return nearbyStations.map(item => {
      let priority = 0;
      const distance = item.distance;
      
      // Distance-based priority (closer = higher priority)
      if (distance <= 500) priority += 100; // Very close
      else if (distance <= 1000) priority += 80;
      else if (distance <= 2000) priority += 60;
      else if (distance <= 5000) priority += 40;
      else priority += 20;
      
      // Line-based priority (major lines get higher priority)
      const line = item.station.line?.toLowerCase() || '';
      if (line.includes('山手') || line.includes('yamanote')) priority += 30;
      else if (line.includes('中央') || line.includes('総武')) priority += 25;
      else if (line.includes('京浜東北')) priority += 20;
      else if (line.includes('東海道')) priority += 15;
      else priority += 10;
      
      // Station type priority (major stations)
      const stationName = item.station.name?.toLowerCase() || '';
      if (stationName.includes('新宿') || stationName.includes('東京') || 
          stationName.includes('渋谷') || stationName.includes('品川')) {
        priority += 25;
      }
      
      // Direction-based priority (stations in direction of movement)
      // This would require historical location data to implement properly
      
      return {
        ...item,
        priority
      };
    }).sort((a, b) => b.priority - a.priority);
  }

  /**
   * Calculate optimal radius for geofence based on station polygon or fallback
   */
  private calculateOptimalRadius(station: Station, distanceFromUser: number): number {
    try {
      // Try to use polygon data if available
      const polygon = JSON.parse(station.polygon_data);
      if (polygon.type === 'Polygon' && polygon.coordinates && polygon.coordinates[0]) {
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
        
        // Use polygon size + buffer
        const polygonRadius = Math.max(latDistance, lngDistance) / 2;
        return Math.max(polygonRadius + 30, 50); // Minimum 50m, add 30m buffer
      }
    } catch (error) {
      // Fallback to distance-based radius
    }
    
    // Fallback radius based on distance from user
    if (distanceFromUser <= 500) return 80; // Close stations need smaller radius
    else if (distanceFromUser <= 1000) return 100;
    else if (distanceFromUser <= 2000) return 120;
    else if (distanceFromUser <= 5000) return 150;
    else return 200; // Distant stations need larger radius for reliability
  }

  /**
   * Update active geofence regions in native system
   */
  private async updateActiveRegions(newRegions: GeofenceRegionInfo[]) {
    const currentRegions = this.activeRegions.value;
    
    // Find regions to remove
    const currentIds = new Set(currentRegions.map(r => r.identifier));
    const newIds = new Set(newRegions.map(r => r.identifier));
    
    const toRemove = currentRegions.filter(r => !newIds.has(r.identifier));
    const toAdd = newRegions.filter(r => !currentIds.has(r.identifier));
    
    // Remove outdated regions
    if (toRemove.length > 0) {
      const identifiers = toRemove.map(r => r.identifier);
      await BackgroundGeofence.removeGeofences({ identifiers });
      console.log(`Removed ${toRemove.length} geofence regions`);
    }
    
    // Add new regions
    if (toAdd.length > 0) {
      const geofences = toAdd.map(r => ({
        identifier: r.identifier,
        latitude: r.latitude,
        longitude: r.longitude,
        radius: r.radius,
        notifyOnEntry: r.notifyOnEntry,
        notifyOnExit: r.notifyOnExit,
        data: r.data
      }));
      
      await BackgroundGeofence.addGeofences({ geofences });
      console.log(`Added ${toAdd.length} geofence regions`);
    }
    
    // Update stored regions
    this.activeRegions.next(newRegions);
    this.saveRegionsToStorage(newRegions);
  }

  /**
   * Get maximum geofence regions for current platform
   */
  private getMaxRegions(): number {
    // Detect platform - in real app you'd use Capacitor.getPlatform()
    const platform = 'ios'; // or 'android' 
    return platform === 'ios' ? this.MAX_IOS_REGIONS : this.MAX_ANDROID_REGIONS;
  }

  /**
   * Calculate distance between two coordinates
   */
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

    return R * c;
  }

  /**
   * Save regions to local storage for persistence
   */
  private saveRegionsToStorage(regions: GeofenceRegionInfo[]) {
    const serializable = regions.map(region => ({
      identifier: region.identifier,
      latitude: region.latitude,
      longitude: region.longitude,
      radius: region.radius,
      stationId: region.station.id,
      priority: region.priority,
      lastUpdated: region.lastUpdated.toISOString()
    }));
    
    localStorage.setItem('geofence_regions', JSON.stringify(serializable));
  }

  /**
   * Load regions from local storage
   */
  private loadStoredRegions() {
    try {
      const stored = localStorage.getItem('geofence_regions');
      if (stored) {
        const regions = JSON.parse(stored);
        console.log(`Loaded ${regions.length} stored geofence regions`);
      }
    } catch (error) {
      console.error('Failed to load stored regions:', error);
    }
  }

  /**
   * Update statistics
   */
  private updateStats(updates: Partial<GeofenceStats>) {
    const current = this.stats.value;
    this.stats.next({ ...current, ...updates });
  }

  // Observable getters
  getCurrentLocation() {
    return this.currentLocation.asObservable();
  }

  getActiveRegions() {
    return this.activeRegions.asObservable();
  }

  getStats() {
    return this.stats.asObservable();
  }

  // Public methods for manual control
  async forceOptimization() {
    const location = this.currentLocation.value;
    if (location) {
      await this.optimizeGeofenceRegions(location);
    }
  }

  async clearAllRegions() {
    const current = this.activeRegions.value;
    if (current.length > 0) {
      const identifiers = current.map(r => r.identifier);
      await BackgroundGeofence.removeGeofences({ identifiers });
      this.activeRegions.next([]);
      localStorage.removeItem('geofence_regions');
      
      this.updateStats({ 
        activeRegions: 0,
        lastOptimization: new Date()
      });
    }
  }
}