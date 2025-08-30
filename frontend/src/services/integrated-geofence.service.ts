import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, combineLatest, Subscription } from 'rxjs';
import { debounceTime, filter } from 'rxjs/operators';

import { GeofenceManagerService, GeofenceStats } from './geofence-manager.service';
import { GeofenceOptimizerService, LocationContext, MovementPattern } from './geofence-optimizer.service';
import { CloudSyncService, SyncStatus } from './cloud-sync.service';
import { StationService } from '../app/services/station.service';
import BackgroundGeofence, { GeofenceEvent } from '../plugins/background-geofence';
import { Station } from '../app/models/station.model';

export interface IntegratedTrackingStatus {
  isActive: boolean;
  nativeGeofencing: boolean;
  jsGeofencing: boolean;
  backgroundMode: boolean;
  cloudSync: boolean;
  activeRegions: number;
  lastLocationUpdate: Date | null;
  batteryOptimized: boolean;
}

export interface TrackingConfiguration {
  useNativeGeofencing: boolean;
  useFallbackJS: boolean;
  enableCloudSync: boolean;
  optimizationLevel: 'battery' | 'balanced' | 'accuracy';
  syncInterval: number;
  maxRegions: number;
}

@Injectable({
  providedIn: 'root'
})
export class IntegratedGeofenceService implements OnDestroy {

  private trackingStatus = new BehaviorSubject<IntegratedTrackingStatus>({
    isActive: false,
    nativeGeofencing: false,
    jsGeofencing: false,
    backgroundMode: false,
    cloudSync: false,
    activeRegions: 0,
    lastLocationUpdate: null,
    batteryOptimized: true
  });

  private configuration: TrackingConfiguration = {
    useNativeGeofencing: true,
    useFallbackJS: true,
    enableCloudSync: true,
    optimizationLevel: 'balanced',
    syncInterval: 30000,
    maxRegions: 20 // Default for iOS
  };

  private subscriptions: Subscription[] = [];
  private stations: Station[] = [];
  private isInitialized = false;

  constructor(
    private geofenceManager: GeofenceManagerService,
    private optimizer: GeofenceOptimizerService,
    private cloudSync: CloudSyncService,
    private stationService: StationService
  ) {
    this.setupSubscriptions();
    this.loadConfiguration();
  }

  /**
   * Initialize the integrated geofence system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('Initializing integrated geofence system...');

      // Load stations
      this.stations = await this.stationService.getAllStations().toPromise() || [];
      console.log(`Loaded ${this.stations.length} stations`);

      // Initialize geofence manager
      await this.geofenceManager.initialize(this.stations);

      // Setup native plugin listeners
      this.setupNativeListeners();

      // Update configuration based on device capabilities
      await this.updateConfigurationForDevice();

      this.isInitialized = true;
      console.log('Integrated geofence system initialized successfully');

    } catch (error) {
      console.error('Failed to initialize integrated geofence system:', error);
      throw error;
    }
  }

  /**
   * Start integrated tracking
   */
  async startTracking(): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      console.log('Starting integrated geofence tracking...');

      let nativeSuccess = false;
      let jsSuccess = false;

      // Try native geofencing first
      if (this.configuration.useNativeGeofencing) {
        try {
          const permissions = await BackgroundGeofence.checkPermissions();
          if (permissions.backgroundLocation === 'granted') {
            await BackgroundGeofence.startGeofencing({
              enableHighAccuracy: this.configuration.optimizationLevel === 'accuracy',
              notification: {
                title: '駅記録アプリ',
                text: 'バックグラウンドで駅への到着・出発を記録中...'
              },
              distanceFilter: this.getDistanceFilterForOptimization(),
              interval: this.configuration.syncInterval
            });
            
            nativeSuccess = true;
            console.log('Native geofencing started successfully');
          } else {
            console.warn('Background location permission not granted, requesting...');
            const requested = await BackgroundGeofence.requestPermissions();
            if (requested.backgroundLocation === 'granted') {
              await BackgroundGeofence.startGeofencing({
                enableHighAccuracy: this.configuration.optimizationLevel === 'accuracy',
                notification: {
                  title: '駅記録アプリ',
                  text: 'バックグラウンドで駅への到着・出発を記録中...'
                }
              });
              nativeSuccess = true;
            }
          }
        } catch (error) {
          console.error('Native geofencing failed to start:', error);
        }
      }

      // Fallback to JS geofencing if native failed and fallback enabled
      if (!nativeSuccess && this.configuration.useFallbackJS) {
        // Implement JS-based geofencing as fallback
        jsSuccess = await this.startJSGeofencing();
      }

      const trackingStarted = nativeSuccess || jsSuccess;
      
      this.updateTrackingStatus({
        isActive: trackingStarted,
        nativeGeofencing: nativeSuccess,
        jsGeofencing: jsSuccess,
        backgroundMode: nativeSuccess, // Native geofencing includes background mode
        cloudSync: this.configuration.enableCloudSync
      });

      if (trackingStarted) {
        // Report analytics
        await this.cloudSync.reportAnalytics('tracking_started', {
          native: nativeSuccess,
          fallback: jsSuccess,
          configuration: this.configuration
        });
      }

      return trackingStarted;

    } catch (error) {
      console.error('Failed to start integrated tracking:', error);
      this.updateTrackingStatus({ isActive: false });
      return false;
    }
  }

  /**
   * Stop all tracking
   */
  async stopTracking(): Promise<void> {
    try {
      console.log('Stopping integrated geofence tracking...');

      // Stop native geofencing
      if (this.trackingStatus.value.nativeGeofencing) {
        await BackgroundGeofence.stopGeofencing();
      }

      // Stop JS geofencing
      if (this.trackingStatus.value.jsGeofencing) {
        await this.stopJSGeofencing();
      }

      this.updateTrackingStatus({
        isActive: false,
        nativeGeofencing: false,
        jsGeofencing: false,
        backgroundMode: false,
        activeRegions: 0
      });

      // Report analytics
      await this.cloudSync.reportAnalytics('tracking_stopped', {
        reason: 'user_requested'
      });

    } catch (error) {
      console.error('Failed to stop tracking:', error);
    }
  }

  /**
   * Update location and optimize geofences
   */
  async updateLocation(latitude: number, longitude: number, accuracy: number = 10): Promise<void> {
    if (!this.isInitialized) return;

    const location: LocationContext = {
      latitude,
      longitude,
      accuracy,
      timestamp: new Date()
    };

    // Update optimizer with new location
    this.optimizer.updateLocation(location);

    // Update geofence manager
    await this.geofenceManager.updateLocation(latitude, longitude);

    this.updateTrackingStatus({
      lastLocationUpdate: new Date()
    });
  }

  /**
   * Setup native plugin listeners
   */
  private setupNativeListeners() {
    // Listen for geofence events
    BackgroundGeofence.addListener('geofenceEvent', async (event: GeofenceEvent) => {
      console.log('Native geofence event received:', event);
      
      // Process the event
      await this.handleGeofenceEvent(event);
      
      // Queue for cloud sync if enabled
      if (this.configuration.enableCloudSync) {
        await this.cloudSync.queueGeofenceEvent(event);
      }
    });

    // Listen for location updates
    BackgroundGeofence.addListener('locationUpdate', (location: any) => {
      this.updateLocation(location.latitude, location.longitude, location.accuracy);
    });
  }

  /**
   * Setup service subscriptions
   */
  private setupSubscriptions() {
    // Monitor geofence statistics
    this.subscriptions.push(
      this.geofenceManager.getStats().subscribe(stats => {
        this.updateTrackingStatus({
          activeRegions: stats.activeRegions,
          batteryOptimized: stats.activeRegions <= stats.maxRegions
        });
      })
    );

    // Monitor cloud sync status
    this.subscriptions.push(
      this.cloudSync.getSyncStatus().subscribe(status => {
        this.updateTrackingStatus({
          cloudSync: status.isOnline && status.syncErrors < 5
        });
      })
    );

    // Auto-optimization based on movement patterns
    this.subscriptions.push(
      combineLatest([
        this.geofenceManager.getCurrentLocation(),
        this.optimizer.getMovementPattern()
      ]).pipe(
        filter(([location, pattern]) => location !== null),
        debounceTime(30000) // 30 second debounce
      ).subscribe(([location, pattern]) => {
        if (location && this.trackingStatus.value.isActive) {
          this.performIntelligentOptimization(location, pattern);
        }
      })
    );
  }

  /**
   * Perform intelligent optimization based on movement patterns
   */
  private async performIntelligentOptimization(
    location: { latitude: number; longitude: number },
    pattern: MovementPattern | null
  ): Promise<void> {
    try {
      if (this.configuration.optimizationLevel === 'battery' && pattern) {
        // Reduce geofence count when stationary
        if (pattern.averageSpeed < 1) {
          // Very stationary - use fewer, closer regions
          await this.geofenceManager.updateLocation(location.latitude, location.longitude);
        } else if (pattern.averageSpeed > 20) {
          // High speed movement - use larger, fewer regions
          const currentStats = await this.geofenceManager.getStats().pipe().toPromise();
          if (currentStats && currentStats.activeRegions > 10) {
            await this.geofenceManager.forceOptimization();
          }
        }
      }
    } catch (error) {
      console.error('Intelligent optimization failed:', error);
    }
  }

  /**
   * Handle geofence events from any source
   */
  private async handleGeofenceEvent(event: GeofenceEvent): Promise<void> {
    try {
      console.log('Processing geofence event:', event);

      // Find the station
      const stationId = event.data?.stationId;
      const station = this.stations.find(s => s.id === stationId);

      if (station && event.action === 'enter') {
        // Record station visit
        const visit = {
          station: station.id,
          arrived_at: new Date(event.timestamp).toISOString(),
          latitude: event.latitude,
          longitude: event.longitude,
          weather: await this.getCurrentWeather({ latitude: event.latitude, longitude: event.longitude })
        };

        try {
          await this.stationService.createVisit(visit).toPromise();
          console.log(`Recorded visit to ${station.name}`);

          // Sync visit to cloud if enabled
          if (this.configuration.enableCloudSync) {
            await this.cloudSync.syncStationVisit(visit);
          }
        } catch (error) {
          console.error('Failed to record station visit:', error);
        }
      }

      // Report analytics
      await this.cloudSync.reportAnalytics('geofence_event', {
        stationId,
        stationName: station?.name,
        eventType: event.action,
        source: 'native'
      });

    } catch (error) {
      console.error('Failed to handle geofence event:', error);
    }
  }

  /**
   * Fallback JS geofencing (simplified)
   */
  private async startJSGeofencing(): Promise<boolean> {
    // This would be a simplified JS implementation for when native fails
    console.log('Starting JS fallback geofencing...');
    // Implementation would use regular geolocation API with setInterval
    return true; // Placeholder
  }

  private async stopJSGeofencing(): Promise<void> {
    console.log('Stopping JS fallback geofencing...');
    // Stop JS-based tracking
  }

  /**
   * Update device-specific configuration
   */
  private async updateConfigurationForDevice(): Promise<void> {
    try {
      // Detect platform capabilities
      const permissions = await BackgroundGeofence.checkPermissions();
      
      // Adjust max regions based on platform
      // iOS: 20 regions, Android: 100 regions
      // This would be detected via Capacitor.getPlatform() in real implementation
      this.configuration.maxRegions = 20; // Assume iOS for now
      
      // Adjust optimization level based on permissions
      if (permissions.backgroundLocation !== 'granted') {
        this.configuration.optimizationLevel = 'battery';
        this.configuration.useNativeGeofencing = false;
      }

      console.log('Updated configuration for device:', this.configuration);
    } catch (error) {
      console.error('Failed to update device configuration:', error);
    }
  }

  /**
   * Get distance filter based on optimization level
   */
  private getDistanceFilterForOptimization(): number {
    switch (this.configuration.optimizationLevel) {
      case 'accuracy': return 5; // 5 meters
      case 'balanced': return 10; // 10 meters
      case 'battery': return 25; // 25 meters
      default: return 10;
    }
  }

  /**
   * Get current weather (mock implementation)
   */
  private async getCurrentWeather(location: { latitude: number; longitude: number }): Promise<string> {
    const weatherTypes = ['晴れ', '曇り', '雨', '雪'];
    return weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
  }

  /**
   * Load configuration from storage
   */
  private loadConfiguration(): void {
    try {
      const stored = localStorage.getItem('tracking_configuration');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.configuration = { ...this.configuration, ...parsed };
        console.log('Loaded tracking configuration:', this.configuration);
      }
    } catch (error) {
      console.error('Failed to load configuration:', error);
    }
  }

  /**
   * Save configuration to storage
   */
  private saveConfiguration(): void {
    try {
      localStorage.setItem('tracking_configuration', JSON.stringify(this.configuration));
    } catch (error) {
      console.error('Failed to save configuration:', error);
    }
  }

  /**
   * Update tracking status
   */
  private updateTrackingStatus(updates: Partial<IntegratedTrackingStatus>): void {
    const current = this.trackingStatus.value;
    this.trackingStatus.next({ ...current, ...updates });
  }

  // Public API methods
  getTrackingStatus() {
    return this.trackingStatus.asObservable();
  }

  getCurrentConfiguration(): TrackingConfiguration {
    return { ...this.configuration };
  }

  async updateConfiguration(updates: Partial<TrackingConfiguration>): Promise<void> {
    this.configuration = { ...this.configuration, ...updates };
    this.saveConfiguration();
    
    // Restart tracking with new configuration if currently active
    if (this.trackingStatus.value.isActive) {
      await this.stopTracking();
      await this.startTracking();
    }
  }

  async getSystemStatus(): Promise<any> {
    const geofenceStats = await this.geofenceManager.getStats().pipe().toPromise();
    const syncStatus = this.cloudSync.getSyncStats();
    const optimizationMetrics = await this.optimizer.getOptimizationMetrics().pipe().toPromise();
    
    return {
      tracking: this.trackingStatus.value,
      configuration: this.configuration,
      geofence: geofenceStats,
      sync: syncStatus,
      optimization: optimizationMetrics
    };
  }

  // Cleanup
  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.optimizer.destroy();
    this.cloudSync.destroy();
  }
}