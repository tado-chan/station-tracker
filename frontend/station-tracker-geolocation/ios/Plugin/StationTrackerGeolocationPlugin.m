#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(StationTrackerGeolocationPlugin, "StationTrackerGeolocation",
    CAP_PLUGIN_METHOD(configure, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(startTracking, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stopTracking, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getTrackingStatus, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getQueueSize, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(forceSendQueue, CAPPluginReturnPromise);
)
