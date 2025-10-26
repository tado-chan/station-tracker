export interface StationTrackerGeolocationPlugin {
  /**
   * Start background location tracking
   */
  startTracking(options: StartTrackingOptions): Promise<{ success: boolean }>;

  /**
   * Stop background location tracking
   */
  stopTracking(): Promise<{ success: boolean }>;

  /**
   * Get tracking status
   */
  getTrackingStatus(): Promise<{ isTracking: boolean }>;

  /**
   * Get pending queue size (unsent locations)
   */
  getQueueSize(): Promise<{ size: number }>;

  /**
   * Force send all pending data
   */
  forceSendQueue(): Promise<{ sent: number; failed: number }>;

  /**
   * Configure API endpoint and credentials
   */
  configure(options: ConfigureOptions): Promise<{ success: boolean }>;

  /**
   * Add listener for location updates
   */
  addListener(
    eventName: 'locationUpdate',
    listenerFunc: (location: LocationUpdate) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Add listener for visit detection
   */
  addListener(
    eventName: 'visitDetected',
    listenerFunc: (visit: VisitEvent) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Add listener for errors
   */
  addListener(
    eventName: 'error',
    listenerFunc: (error: { message: string }) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Remove all listeners for an event
   */
  removeAllListeners(): Promise<void>;
}

export interface StartTrackingOptions {
  /**
   * Distance filter in meters (default: 10)
   */
  distanceFilter?: number;

  /**
   * Notification title for foreground service
   */
  notificationTitle?: string;

  /**
   * Notification text for foreground service
   */
  notificationText?: string;

  /**
   * Stationary radius in meters (default: 50)
   */
  stationaryRadius?: number;

  /**
   * Stationary time in seconds (default: 300 = 5 minutes)
   */
  stationaryTime?: number;
}

export interface ConfigureOptions {
  /**
   * API base URL
   */
  apiUrl: string;

  /**
   * API key for authentication
   */
  apiKey: string;

  /**
   * User ID for tracking
   */
  userId: string;

  /**
   * Location endpoint path (default: '/dev/location')
   */
  endpoint?: string;
}

export interface LocationUpdate {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  speed?: number;
  bearing?: number;
}

export interface VisitEvent {
  latitude: number;
  longitude: number;
  arrivedAt: string;
  departedAt?: string;
  duration?: number;
}

export interface PluginListenerHandle {
  remove: () => Promise<void>;
}
