import { WebPlugin } from '@capacitor/core';
export class StationTrackerGeolocationWeb extends WebPlugin {
    async startTracking(options) {
        console.log('startTracking', options);
        throw new Error('Not implemented on web');
    }
    async stopTracking() {
        throw new Error('Not implemented on web');
    }
    async getTrackingStatus() {
        return { isTracking: false };
    }
    async getQueueSize() {
        return { size: 0 };
    }
    async forceSendQueue() {
        return { sent: 0, failed: 0 };
    }
    async configure(options) {
        console.log('configure', options);
        return { success: true };
    }
}
