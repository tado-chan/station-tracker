var capacitorStationTrackerGeolocation = (function (exports, core) {
    'use strict';

    const StationTrackerGeolocation = core.registerPlugin('StationTrackerGeolocation', {
        web: () => Promise.resolve().then(function () { return web; }).then(m => new m.StationTrackerGeolocationWeb()),
    });

    class StationTrackerGeolocationWeb extends core.WebPlugin {
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

    var web = /*#__PURE__*/Object.freeze({
        __proto__: null,
        StationTrackerGeolocationWeb: StationTrackerGeolocationWeb
    });

    exports.StationTrackerGeolocation = StationTrackerGeolocation;

    Object.defineProperty(exports, '__esModule', { value: true });

    return exports;

})({}, capacitorExports);
//# sourceMappingURL=plugin.js.map
