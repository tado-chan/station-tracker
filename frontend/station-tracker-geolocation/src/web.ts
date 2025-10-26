import { WebPlugin } from '@capacitor/core';

import type {
  StationTrackerGeolocationPlugin,
  StartTrackingOptions,
  ConfigureOptions,
  LocationUpdate,
  VisitEvent,
} from './definitions';

export class StationTrackerGeolocationWeb
  extends WebPlugin
  implements StationTrackerGeolocationPlugin
{
  async startTracking(options: StartTrackingOptions): Promise<{ success: boolean }> {
    console.log('startTracking', options);
    throw new Error('Not implemented on web');
  }

  async stopTracking(): Promise<{ success: boolean }> {
    throw new Error('Not implemented on web');
  }

  async getTrackingStatus(): Promise<{ isTracking: boolean }> {
    return { isTracking: false };
  }

  async getQueueSize(): Promise<{ size: number }> {
    return { size: 0 };
  }

  async forceSendQueue(): Promise<{ sent: number; failed: number }> {
    return { sent: 0, failed: 0 };
  }

  async configure(options: ConfigureOptions): Promise<{ success: boolean }> {
    console.log('configure', options);
    return { success: true };
  }
}
