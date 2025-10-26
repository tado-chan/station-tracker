export interface StationTrackerGeolocationPlugin {
    startTracking(options: StartTrackingOptions): Promise<{
        success: boolean;
    }>;
    stopTracking(): Promise<{
        success: boolean;
    }>;
    getTrackingStatus(): Promise<{
        isTracking: boolean;
    }>;
    getQueueSize(): Promise<{
        size: number;
    }>;
    forceSendQueue(): Promise<{
        sent: number;
        failed: number;
    }>;
    configure(options: ConfigureOptions): Promise<{
        success: boolean;
    }>;
    addListener(eventName: 'locationUpdate', listenerFunc: (location: LocationUpdate) => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'visitDetected', listenerFunc: (visit: VisitEvent) => void): Promise<PluginListenerHandle>;
    addListener(eventName: 'error', listenerFunc: (error: {
        message: string;
    }) => void): Promise<PluginListenerHandle>;
    removeAllListeners(): Promise<void>;
}
export interface StartTrackingOptions {
    distanceFilter?: number;
    notificationTitle?: string;
    notificationText?: string;
    stationaryRadius?: number;
    stationaryTime?: number;
}
export interface ConfigureOptions {
    apiUrl: string;
    apiKey: string;
    userId: string;
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
//# sourceMappingURL=definitions.d.ts.map