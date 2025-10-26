import Foundation
import Capacitor
import CoreLocation

@objc(StationTrackerGeolocationPlugin)
public class StationTrackerGeolocationPlugin: CAPPlugin {
    private let locationManager = LocationManager()

    override public func load() {
        locationManager.plugin = self
    }

    @objc func configure(_ call: CAPPluginCall) {
        guard let apiUrl = call.getString("apiUrl") else {
            call.reject("apiUrl is required")
            return
        }
        guard let apiKey = call.getString("apiKey") else {
            call.reject("apiKey is required")
            return
        }
        guard let userId = call.getString("userId") else {
            call.reject("userId is required")
            return
        }
        let endpoint = call.getString("endpoint") ?? "/dev/location"

        // Save config to UserDefaults
        let defaults = UserDefaults.standard
        defaults.set(apiUrl, forKey: "StationTracker.apiUrl")
        defaults.set(apiKey, forKey: "StationTracker.apiKey")
        defaults.set(userId, forKey: "StationTracker.userId")
        defaults.set(endpoint, forKey: "StationTracker.endpoint")

        call.resolve(["success": true])
    }

    @objc func startTracking(_ call: CAPPluginCall) {
        let distanceFilter = call.getInt("distanceFilter") ?? 10
        let notificationTitle = call.getString("notificationTitle") ?? "駅記録アプリ"
        let notificationText = call.getString("notificationText") ?? "バックグラウンドで位置を追跡中"
        let stationaryRadius = call.getInt("stationaryRadius") ?? 50
        let stationaryTime = call.getInt("stationaryTime") ?? 300

        // Save tracking options
        let defaults = UserDefaults.standard
        defaults.set(distanceFilter, forKey: "StationTracker.distanceFilter")
        defaults.set(notificationTitle, forKey: "StationTracker.notificationTitle")
        defaults.set(notificationText, forKey: "StationTracker.notificationText")
        defaults.set(stationaryRadius, forKey: "StationTracker.stationaryRadius")
        defaults.set(stationaryTime, forKey: "StationTracker.stationaryTime")
        defaults.set(true, forKey: "StationTracker.isTracking")

        locationManager.startTracking()

        call.resolve(["success": true])
    }

    @objc func stopTracking(_ call: CAPPluginCall) {
        let defaults = UserDefaults.standard
        defaults.set(false, forKey: "StationTracker.isTracking")

        locationManager.stopTracking()

        call.resolve(["success": true])
    }

    @objc func getTrackingStatus(_ call: CAPPluginCall) {
        let defaults = UserDefaults.standard
        let isTracking = defaults.bool(forKey: "StationTracker.isTracking")

        call.resolve(["isTracking": isTracking])
    }

    @objc func getQueueSize(_ call: CAPPluginCall) {
        let size = LocationDatabase.shared.getPendingCount()
        call.resolve(["size": size])
    }

    @objc func forceSendQueue(_ call: CAPPluginCall) {
        locationManager.forceSendQueue()
        call.resolve(["sent": 0, "failed": 0])
    }

    func notifyLocationUpdate(latitude: Double, longitude: Double, accuracy: Double, timestamp: Date) {
        notifyListeners("locationUpdate", data: [
            "latitude": latitude,
            "longitude": longitude,
            "accuracy": accuracy,
            "timestamp": ISO8601DateFormatter().string(from: timestamp)
        ])
    }

    func notifyVisitDetected(latitude: Double, longitude: Double, arrivedAt: Date) {
        notifyListeners("visitDetected", data: [
            "latitude": latitude,
            "longitude": longitude,
            "arrivedAt": ISO8601DateFormatter().string(from: arrivedAt)
        ])
    }

    func notifyError(message: String) {
        notifyListeners("error", data: ["message": message])
    }
}
