import { WebPlugin } from '@capacitor/core';
import type { StationTrackerGeolocationPlugin, StartTrackingOptions, ConfigureOptions } from './definitions';
export declare class StationTrackerGeolocationWeb extends WebPlugin implements StationTrackerGeolocationPlugin {
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
}
//# sourceMappingURL=web.d.ts.map