import { Injectable } from '@angular/core';
import { BehaviorSubject, interval, Subscription } from 'rxjs';
import { Station } from '../app/models/station.model';
import { GeofenceRegionInfo } from './geofence-manager.service';

export interface LocationContext {
  latitude: number;
  longitude: number;
  timestamp: Date;
  accuracy: number;
  speed?: number;
  heading?: number;
}

export interface MovementPattern {
  averageSpeed: number;
  primaryDirection: number;
  frequentAreas: { lat: number; lng: number; visits: number }[];
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayType: 'weekday' | 'weekend';
}

export interface OptimizationMetrics {
  hitRate: number; // Percentage of actual station visits detected
  falsePositiveRate: number;
  batteryScore: number; // Estimated battery efficiency
  regionCount: number;
  lastOptimization: Date;
}

@Injectable({
  providedIn: 'root'
})
export class GeofenceOptimizerService {
  
  private locationHistory: LocationContext[] = [];
  private movementPattern = new BehaviorSubject<MovementPattern | null>(null);
  private optimizationMetrics = new BehaviorSubject<OptimizationMetrics>({
    hitRate: 0,
    falsePositiveRate: 0,
    batteryScore: 100,
    regionCount: 0,
    lastOptimization: new Date()
  });
  
  private readonly MAX_LOCATION_HISTORY = 1000;
  private readonly OPTIMIZATION_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private optimizationSubscription?: Subscription;
  
  constructor() {
    this.loadLocationHistory();
    this.startPeriodicOptimization();
  }

  /**
   * Add new location to history and trigger analysis
   */
  updateLocation(location: LocationContext) {
    this.locationHistory.unshift(location);
    
    // Keep history within limits
    if (this.locationHistory.length > this.MAX_LOCATION_HISTORY) {
      this.locationHistory = this.locationHistory.slice(0, this.MAX_LOCATION_HISTORY);
    }
    
    this.saveLocationHistory();
    this.analyzeMovementPattern();
  }

  /**
   * Analyze movement patterns from location history
   */
  private analyzeMovementPattern() {
    if (this.locationHistory.length < 10) return;
    
    const recentLocations = this.locationHistory.slice(0, 50); // Last 50 locations
    
    // Calculate average speed
    let totalSpeed = 0;
    let speedSamples = 0;
    
    for (let i = 1; i < recentLocations.length; i++) {
      const current = recentLocations[i-1];
      const previous = recentLocations[i];
      
      const distance = this.calculateDistance(
        current.latitude, current.longitude,
        previous.latitude, previous.longitude
      );
      
      const timeDiff = (current.timestamp.getTime() - previous.timestamp.getTime()) / 1000; // seconds
      
      if (timeDiff > 0 && timeDiff < 600) { // Within 10 minutes
        const speed = distance / timeDiff; // m/s
        if (speed < 50) { // Filter out unrealistic speeds
          totalSpeed += speed;
          speedSamples++;
        }
      }
    }
    
    const averageSpeed = speedSamples > 0 ? totalSpeed / speedSamples : 0;
    
    // Calculate primary direction
    const primaryDirection = this.calculatePrimaryDirection(recentLocations);
    
    // Find frequent areas
    const frequentAreas = this.findFrequentAreas(this.locationHistory);
    
    // Determine time context
    const now = new Date();
    const hour = now.getHours();
    const timeOfDay = hour < 6 ? 'night' : 
                     hour < 12 ? 'morning' :
                     hour < 18 ? 'afternoon' : 'evening';
    
    const dayOfWeek = now.getDay();
    const dayType = dayOfWeek === 0 || dayOfWeek === 6 ? 'weekend' : 'weekday';
    
    const pattern: MovementPattern = {
      averageSpeed,
      primaryDirection,
      frequentAreas,
      timeOfDay,
      dayType
    };
    
    this.movementPattern.next(pattern);
  }

  /**
   * Calculate primary direction of movement
   */
  private calculatePrimaryDirection(locations: LocationContext[]): number {
    if (locations.length < 5) return 0;
    
    let totalDeltaLat = 0;
    let totalDeltaLng = 0;
    
    for (let i = 1; i < Math.min(locations.length, 20); i++) {
      totalDeltaLat += locations[i-1].latitude - locations[i].latitude;
      totalDeltaLng += locations[i-1].longitude - locations[i].longitude;
    }
    
    const angle = Math.atan2(totalDeltaLat, totalDeltaLng) * 180 / Math.PI;
    return (angle + 360) % 360; // Normalize to 0-360 degrees
  }

  /**
   * Find frequently visited areas
   */
  private findFrequentAreas(locations: LocationContext[]): { lat: number; lng: number; visits: number }[] {
    const gridSize = 0.001; // ~100m grid
    const areaMap = new Map<string, { lat: number; lng: number; visits: number }>();
    
    for (const location of locations) {
      const gridLat = Math.round(location.latitude / gridSize) * gridSize;
      const gridLng = Math.round(location.longitude / gridSize) * gridSize;
      const key = `${gridLat},${gridLng}`;
      
      if (areaMap.has(key)) {
        areaMap.get(key)!.visits++;
      } else {
        areaMap.set(key, { lat: gridLat, lng: gridLng, visits: 1 });
      }
    }
    
    return Array.from(areaMap.values())
      .filter(area => area.visits >= 5)
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 10); // Top 10 frequent areas
  }

  /**
   * Optimize geofence selection based on movement patterns and context
   */
  optimizeGeofenceSelection(
    nearbyStations: { station: Station; distance: number }[],
    currentLocation: { latitude: number; longitude: number },
    maxRegions: number
  ): GeofenceRegionInfo[] {
    
    const pattern = this.movementPattern.value;
    const optimizedStations = nearbyStations.map(item => ({
      ...item,
      score: this.calculateStationScore(item, currentLocation, pattern)
    })).sort((a, b) => b.score - a.score);
    
    // Apply context-based filtering
    const contextFiltered = this.applyContextFiltering(optimizedStations, pattern);
    
    // Select top stations within limits
    const selected = contextFiltered.slice(0, maxRegions);
    
    // Create optimized geofence regions
    return selected.map((item, index) => {
      const radius = this.calculateDynamicRadius(item, pattern);
      
      return {
        identifier: `station-${item.station.id}`,
        latitude: item.station.latitude,
        longitude: item.station.longitude,
        radius,
        notifyOnEntry: true,
        notifyOnExit: true,
        data: {
          stationId: item.station.id,
          stationName: item.station.name,
          line: item.station.line,
          score: item.score,
          optimized: true
        },
        station: item.station,
        priority: Math.round(item.score),
        lastUpdated: new Date(),
        distanceFromUser: item.distance
      };
    });
  }

  /**
   * Calculate station score based on multiple factors
   */
  private calculateStationScore(
    item: { station: Station; distance: number },
    currentLocation: { latitude: number; longitude: number },
    pattern: MovementPattern | null
  ): number {
    let score = 0;
    
    // Base distance score (closer = higher)
    const maxDistance = 10000; // 10km
    const distanceScore = Math.max(0, (maxDistance - item.distance) / maxDistance * 100);
    score += distanceScore * 0.4; // 40% weight
    
    // Movement direction alignment
    if (pattern) {
      const directionToStation = this.calculateBearing(
        currentLocation.latitude, currentLocation.longitude,
        item.station.latitude, item.station.longitude
      );
      
      const directionDiff = Math.abs(directionToStation - pattern.primaryDirection);
      const alignmentScore = Math.max(0, (180 - Math.min(directionDiff, 360 - directionDiff)) / 180 * 100);
      score += alignmentScore * 0.2; // 20% weight
    }
    
    // Frequent area proximity
    if (pattern && pattern.frequentAreas.length > 0) {
      const nearFrequentArea = pattern.frequentAreas.some(area => {
        const distToArea = this.calculateDistance(
          item.station.latitude, item.station.longitude,
          area.lat, area.lng
        );
        return distToArea <= 500; // Within 500m of frequent area
      });
      
      if (nearFrequentArea) {
        score += 30; // Bonus for frequent areas
      }
    }
    
    // Line importance (major lines get bonus)
    const line = item.station.line?.toLowerCase() || '';
    if (line.includes('山手') || line.includes('yamanote')) score += 25;
    else if (line.includes('中央') || line.includes('総武')) score += 20;
    else if (line.includes('京浜東北')) score += 15;
    else if (line.includes('東海道')) score += 10;
    
    // Time-based context
    if (pattern) {
      // Morning/evening rush hours - prioritize major stations
      if ((pattern.timeOfDay === 'morning' || pattern.timeOfDay === 'evening') && 
          pattern.dayType === 'weekday') {
        const stationName = item.station.name?.toLowerCase() || '';
        if (stationName.includes('新宿') || stationName.includes('東京') || 
            stationName.includes('渋谷') || stationName.includes('品川')) {
          score += 20;
        }
      }
    }
    
    // Speed-based radius adjustment factor
    if (pattern && pattern.averageSpeed > 10) { // Moving fast (>36 km/h)
      score += 10; // Prioritize when moving fast
    }
    
    return Math.round(score);
  }

  /**
   * Apply context-based filtering
   */
  private applyContextFiltering(
    stations: { station: Station; distance: number; score: number }[],
    pattern: MovementPattern | null
  ): { station: Station; distance: number; score: number }[] {
    
    if (!pattern) return stations;
    
    // Filter based on movement speed
    if (pattern.averageSpeed > 20) { // High speed (>72 km/h) - likely in vehicle
      // Prioritize major stations and reduce total count for better performance
      return stations.filter(s => s.score >= 50).slice(0, Math.floor(stations.length * 0.7));
    }
    
    if (pattern.averageSpeed < 2) { // Very low speed - likely stationary
      // Focus on very close stations
      return stations.filter(s => s.distance <= 2000);
    }
    
    // Weekend vs weekday filtering
    if (pattern.dayType === 'weekend') {
      // On weekends, focus more on leisure/shopping areas
      // This would need station category data to implement properly
    }
    
    return stations;
  }

  /**
   * Calculate dynamic radius based on context
   */
  private calculateDynamicRadius(
    item: { station: Station; distance: number; score: number },
    pattern: MovementPattern | null
  ): number {
    let baseRadius = 100; // Base 100m radius
    
    // Adjust based on distance
    if (item.distance > 5000) baseRadius = 150;
    else if (item.distance > 2000) baseRadius = 120;
    else if (item.distance < 500) baseRadius = 80;
    
    // Adjust based on movement speed
    if (pattern) {
      if (pattern.averageSpeed > 15) { // Fast movement
        baseRadius += 50; // Larger radius for better detection
      } else if (pattern.averageSpeed < 1) { // Stationary
        baseRadius -= 20; // Smaller radius to avoid false positives
      }
    }
    
    // Try to use polygon data for precision
    try {
      const polygon = JSON.parse(item.station.polygon_data);
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
        
        const latDistance = this.calculateDistance(minLat, item.station.longitude, maxLat, item.station.longitude);
        const lngDistance = this.calculateDistance(item.station.latitude, minLng, item.station.latitude, maxLng);
        
        const polygonRadius = Math.max(latDistance, lngDistance) / 2;
        baseRadius = Math.max(baseRadius, polygonRadius + 30);
      }
    } catch (error) {
      // Use calculated base radius
    }
    
    return Math.max(baseRadius, 50); // Minimum 50m
  }

  /**
   * Start periodic optimization
   */
  private startPeriodicOptimization() {
    this.optimizationSubscription = interval(this.OPTIMIZATION_INTERVAL).subscribe(() => {
      this.analyzeMovementPattern();
    });
  }

  /**
   * Calculate bearing between two points
   */
  private calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    
    const y = Math.sin(dLng) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
    
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  /**
   * Calculate distance between coordinates
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
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
   * Save location history to storage
   */
  private saveLocationHistory() {
    try {
      const recentHistory = this.locationHistory.slice(0, 200); // Save last 200 locations
      const serializable = recentHistory.map(loc => ({
        ...loc,
        timestamp: loc.timestamp.toISOString()
      }));
      
      localStorage.setItem('location_history', JSON.stringify(serializable));
    } catch (error) {
      console.error('Failed to save location history:', error);
    }
  }

  /**
   * Load location history from storage
   */
  private loadLocationHistory() {
    try {
      const stored = localStorage.getItem('location_history');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.locationHistory = parsed.map((loc: any) => ({
          ...loc,
          timestamp: new Date(loc.timestamp)
        }));
        
        console.log(`Loaded ${this.locationHistory.length} location history entries`);
      }
    } catch (error) {
      console.error('Failed to load location history:', error);
    }
  }

  // Observable getters
  getMovementPattern() {
    return this.movementPattern.asObservable();
  }

  getOptimizationMetrics() {
    return this.optimizationMetrics.asObservable();
  }

  // Cleanup
  destroy() {
    if (this.optimizationSubscription) {
      this.optimizationSubscription.unsubscribe();
    }
  }
}