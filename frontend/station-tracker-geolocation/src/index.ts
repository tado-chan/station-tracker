import { registerPlugin } from '@capacitor/core';

import type { StationTrackerGeolocationPlugin } from './definitions';

const StationTrackerGeolocation = registerPlugin<StationTrackerGeolocationPlugin>(
  'StationTrackerGeolocation',
  {
    web: () => import('./web').then(m => new m.StationTrackerGeolocationWeb()),
  },
);

export * from './definitions';
export { StationTrackerGeolocation };
