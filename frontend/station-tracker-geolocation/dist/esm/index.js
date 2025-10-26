import { registerPlugin } from '@capacitor/core';
const StationTrackerGeolocation = registerPlugin('StationTrackerGeolocation', {
    web: () => import('./web').then(m => new m.StationTrackerGeolocationWeb()),
});
export * from './definitions';
export { StationTrackerGeolocation };
