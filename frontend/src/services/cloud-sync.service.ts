import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, interval, Subscription } from 'rxjs';
import { catchError, retry, timeout } from 'rxjs/operators';
import { GeofenceEvent } from '../plugins/background-geofence';

export interface CloudGeofenceEvent {
  id?: string;
  stationId: number;
  stationName: string;
  line: string;
  eventType: 'enter' | 'exit';
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy?: number;
  deviceId: string;
  appVersion?: string;
  synced?: boolean;
  localTimestamp?: string;
}

export interface SyncStatus {
  isOnline: boolean;
  lastSync: Date | null;
  pendingEvents: number;
  syncErrors: number;
  totalEventsSynced: number;
}

export interface CloudResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CloudSyncService {
  
  private readonly API_BASE_URL = 'https://api.station-tracker.com'; // Replace with actual API
  private readonly SYNC_INTERVAL = 30 * 1000; // 30 seconds
  private readonly MAX_BATCH_SIZE = 50;
  private readonly RETRY_ATTEMPTS = 3;
  private readonly OFFLINE_STORAGE_KEY = 'pending_geofence_events';
  
  private syncStatus = new BehaviorSubject<SyncStatus>({
    isOnline: navigator.onLine,
    lastSync: null,
    pendingEvents: 0,
    syncErrors: 0,
    totalEventsSynced: 0
  });
  
  private pendingEvents: CloudGeofenceEvent[] = [];
  private syncSubscription?: Subscription;
  private deviceId: string;
  
  constructor(private http: HttpClient) {
    this.deviceId = this.getOrCreateDeviceId();
    this.loadPendingEvents();
    this.setupNetworkListeners();
    this.startPeriodicSync();
  }

  /**
   * Add geofence event to sync queue
   */
  async queueGeofenceEvent(event: GeofenceEvent): Promise<void> {
    const cloudEvent: CloudGeofenceEvent = {
      stationId: event.data?.stationId || 0,
      stationName: event.data?.stationName || 'Unknown',
      line: event.data?.line || 'Unknown',
      eventType: event.action,
      latitude: event.latitude,
      longitude: event.longitude,
      timestamp: new Date(event.timestamp).toISOString(),
      deviceId: this.deviceId,
      appVersion: '1.0.0', // Get from config
      synced: false,
      localTimestamp: new Date().toISOString()
    };
    
    this.pendingEvents.push(cloudEvent);
    this.updateSyncStatus({ pendingEvents: this.pendingEvents.length });
    
    // Save to offline storage
    this.savePendingEvents();
    
    // Try immediate sync if online
    if (navigator.onLine) {
      this.performSync();
    }
    
    console.log('Queued geofence event for sync:', cloudEvent);
  }

  /**
   * Perform sync with cloud API
   */
  private async performSync(): Promise<void> {
    if (this.pendingEvents.length === 0) return;
    
    const currentStatus = this.syncStatus.value;
    
    try {
      // Take batch of events to sync
      const batchSize = Math.min(this.MAX_BATCH_SIZE, this.pendingEvents.length);
      const batch = this.pendingEvents.slice(0, batchSize);
      
      console.log(`Syncing batch of ${batch.length} events...`);
      
      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await this.getAuthToken()}` // Implement auth
      });
      
      const response = await this.http.post<CloudResponse<any>>(
        `${this.API_BASE_URL}/geofence-events`,
        { events: batch },
        { headers }
      ).pipe(
        timeout(30000), // 30 second timeout
        retry(this.RETRY_ATTEMPTS),
        catchError(error => {
          console.error('Sync failed:', error);
          throw error;
        })
      ).toPromise();
      
      if (response?.success) {
        // Remove synced events from pending
        this.pendingEvents.splice(0, batchSize);
        
        this.updateSyncStatus({
          lastSync: new Date(),
          pendingEvents: this.pendingEvents.length,
          totalEventsSynced: currentStatus.totalEventsSynced + batchSize,
          syncErrors: Math.max(0, currentStatus.syncErrors - 1) // Reduce errors on success
        });
        
        this.savePendingEvents();
        console.log(`Successfully synced ${batchSize} events`);
        
        // Continue with next batch if more events pending
        if (this.pendingEvents.length > 0) {
          setTimeout(() => this.performSync(), 1000); // 1 second delay
        }
        
      } else {
        throw new Error(response?.error || 'Sync failed');
      }
      
    } catch (error) {
      console.error('Failed to sync geofence events:', error);
      
      this.updateSyncStatus({
        syncErrors: currentStatus.syncErrors + 1
      });
      
      // Implement exponential backoff for retries
      const backoffDelay = Math.min(300000, Math.pow(2, currentStatus.syncErrors) * 1000); // Max 5 minutes
      setTimeout(() => {
        if (navigator.onLine) {
          this.performSync();
        }
      }, backoffDelay);
    }
  }

  /**
   * Get authentication token (implement based on your auth system)
   */
  private async getAuthToken(): Promise<string> {
    // Implement your authentication logic here
    // This might involve:
    // - Getting stored token from secure storage
    // - Refreshing token if expired
    // - Anonymous authentication for device
    
    return localStorage.getItem('auth_token') || 'anonymous';
  }

  /**
   * Setup network connectivity listeners
   */
  private setupNetworkListeners() {
    window.addEventListener('online', () => {
      console.log('Network back online, resuming sync...');
      this.updateSyncStatus({ isOnline: true });
      this.performSync();
    });
    
    window.addEventListener('offline', () => {
      console.log('Network offline, queueing events...');
      this.updateSyncStatus({ isOnline: false });
    });
  }

  /**
   * Start periodic sync process
   */
  private startPeriodicSync() {
    this.syncSubscription = interval(this.SYNC_INTERVAL).subscribe(() => {
      if (navigator.onLine && this.pendingEvents.length > 0) {
        this.performSync();
      }
    });
  }

  /**
   * Get or create unique device ID
   */
  private getOrCreateDeviceId(): string {
    let deviceId = localStorage.getItem('device_id');
    
    if (!deviceId) {
      deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('device_id', deviceId);
    }
    
    return deviceId;
  }

  /**
   * Save pending events to offline storage
   */
  private savePendingEvents() {
    try {
      localStorage.setItem(this.OFFLINE_STORAGE_KEY, JSON.stringify(this.pendingEvents));
    } catch (error) {
      console.error('Failed to save pending events:', error);
    }
  }

  /**
   * Load pending events from offline storage
   */
  private loadPendingEvents() {
    try {
      const stored = localStorage.getItem(this.OFFLINE_STORAGE_KEY);
      if (stored) {
        this.pendingEvents = JSON.parse(stored);
        this.updateSyncStatus({ pendingEvents: this.pendingEvents.length });
        console.log(`Loaded ${this.pendingEvents.length} pending events from storage`);
      }
    } catch (error) {
      console.error('Failed to load pending events:', error);
      this.pendingEvents = [];
    }
  }

  /**
   * Update sync status
   */
  private updateSyncStatus(updates: Partial<SyncStatus>) {
    const current = this.syncStatus.value;
    this.syncStatus.next({ ...current, ...updates });
  }

  /**
   * Manual sync trigger
   */
  async forcSync(): Promise<void> {
    if (!navigator.onLine) {
      throw new Error('Device is offline');
    }
    
    await this.performSync();
  }

  /**
   * Get sync statistics
   */
  getSyncStats(): SyncStatus {
    return this.syncStatus.value;
  }

  /**
   * Clear all pending events (use with caution)
   */
  clearPendingEvents(): void {
    this.pendingEvents = [];
    this.updateSyncStatus({ pendingEvents: 0 });
    localStorage.removeItem(this.OFFLINE_STORAGE_KEY);
    console.log('Cleared all pending events');
  }

  /**
   * Send station visit data to server
   */
  async syncStationVisit(visitData: any): Promise<void> {
    try {
      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await this.getAuthToken()}`
      });
      
      const response = await this.http.post<CloudResponse>(
        `${this.API_BASE_URL}/station-visits`,
        { ...visitData, deviceId: this.deviceId },
        { headers }
      ).pipe(
        timeout(15000),
        retry(2)
      ).toPromise();
      
      if (!response?.success) {
        throw new Error(response?.error || 'Failed to sync station visit');
      }
      
      console.log('Station visit synced successfully');
      
    } catch (error) {
      console.error('Failed to sync station visit:', error);
      // Could queue for later retry if needed
    }
  }

  /**
   * Fetch server configuration updates
   */
  async fetchServerConfig(): Promise<any> {
    try {
      const headers = new HttpHeaders({
        'Authorization': `Bearer ${await this.getAuthToken()}`
      });
      
      const response = await this.http.get<CloudResponse<any>>(
        `${this.API_BASE_URL}/config`,
        { headers }
      ).pipe(
        timeout(10000),
        retry(1)
      ).toPromise();
      
      if (response?.success && response.data) {
        console.log('Server config updated:', response.data);
        return response.data;
      }
      
    } catch (error) {
      console.error('Failed to fetch server config:', error);
    }
    
    return null;
  }

  /**
   * Report app analytics
   */
  async reportAnalytics(eventName: string, data: any): Promise<void> {
    try {
      const analyticsData = {
        event: eventName,
        data,
        deviceId: this.deviceId,
        timestamp: new Date().toISOString(),
        appVersion: '1.0.0'
      };
      
      // Fire and forget - don't block user experience
      this.http.post(`${this.API_BASE_URL}/analytics`, analyticsData, {
        headers: new HttpHeaders({ 'Content-Type': 'application/json' })
      }).subscribe({
        next: () => console.log('Analytics reported'),
        error: (error) => console.warn('Analytics failed:', error)
      });
      
    } catch (error) {
      console.warn('Analytics error:', error);
    }
  }

  // Observable getters
  getSyncStatus() {
    return this.syncStatus.asObservable();
  }

  // Cleanup
  destroy() {
    if (this.syncSubscription) {
      this.syncSubscription.unsubscribe();
    }
  }
}