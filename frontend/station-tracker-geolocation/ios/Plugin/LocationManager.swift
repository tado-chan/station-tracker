import Foundation
import CoreLocation
import UIKit

class LocationManager: NSObject, CLLocationManagerDelegate {
    weak var plugin: StationTrackerGeolocationPlugin?
    private let clLocationManager = CLLocationManager()
    private var lastLocation: CLLocation?
    private var stationaryStartTime: Date?
    private var isStationary = false
    private var visitEntryTime: Date?
    private var sendTimer: Timer?

    override init() {
        super.init()
        clLocationManager.delegate = self
        clLocationManager.desiredAccuracy = kCLLocationAccuracyBest
        clLocationManager.allowsBackgroundLocationUpdates = true
        clLocationManager.pausesLocationUpdatesAutomatically = false
        clLocationManager.showsBackgroundLocationIndicator = true
    }

    func startTracking() {
        let defaults = UserDefaults.standard
        let distanceFilter = defaults.integer(forKey: "StationTracker.distanceFilter")

        clLocationManager.distanceFilter = Double(distanceFilter > 0 ? distanceFilter : 10)

        // Request permissions
        if CLLocationManager.authorizationStatus() == .notDetermined {
            clLocationManager.requestWhenInUseAuthorization()
        }

        if CLLocationManager.authorizationStatus() == .authorizedWhenInUse {
            clLocationManager.requestAlwaysAuthorization()
        }

        clLocationManager.startUpdatingLocation()
        scheduleSendTimer()

        NSLog("LocationManager: Started tracking with distance filter: \\(clLocationManager.distanceFilter)m")
    }

    func stopTracking() {
        clLocationManager.stopUpdatingLocation()
        sendTimer?.invalidate()
        sendTimer = nil

        NSLog("LocationManager: Stopped tracking")
    }

    func forceSendQueue() {
        Task {
            await sendPendingLocations()
        }
    }

    private func scheduleSendTimer() {
        sendTimer?.invalidate()
        sendTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task {
                await self?.sendPendingLocations()
            }
        }
    }

    // MARK: - CLLocationManagerDelegate

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }

        NSLog("LocationManager: Location update: \\(location.coordinate.latitude), \\(location.coordinate.longitude), accuracy: \\(location.horizontalAccuracy)")

        let defaults = UserDefaults.standard
        let userId = defaults.string(forKey: "StationTracker.userId") ?? "default_user"

        // Save to local database
        LocationDatabase.shared.insertLocation(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            accuracy: location.horizontalAccuracy,
            timestamp: location.timestamp,
            userId: userId
        )

        // Check stationary detection
        checkStationaryDetection(location: location)

        // Try to send immediately
        Task {
            await sendPendingLocations()
        }

        // Notify plugin
        plugin?.notifyLocationUpdate(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            accuracy: location.horizontalAccuracy,
            timestamp: location.timestamp
        )
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        NSLog("LocationManager: Error: \\(error.localizedDescription)")
        plugin?.notifyError(message: error.localizedDescription)
    }

    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        NSLog("LocationManager: Authorization status changed: \\(status.rawValue)")

        switch status {
        case .authorizedAlways, .authorizedWhenInUse:
            clLocationManager.startUpdatingLocation()
        case .denied, .restricted:
            plugin?.notifyError(message: "Location permission denied")
        case .notDetermined:
            break
        @unknown default:
            break
        }
    }

    // MARK: - Stationary Detection

    private func checkStationaryDetection(location: CLLocation) {
        let defaults = UserDefaults.standard
        let stationaryRadius = defaults.integer(forKey: "StationTracker.stationaryRadius")
        let stationaryTime = defaults.integer(forKey: "StationTracker.stationaryTime")

        let radius = Double(stationaryRadius > 0 ? stationaryRadius : 50)
        let time = TimeInterval(stationaryTime > 0 ? stationaryTime : 300)

        guard let last = lastLocation else {
            lastLocation = location
            stationaryStartTime = Date()
            return
        }

        let distance = location.distance(from: last)

        if distance <= radius {
            // Still within radius
            guard let startTime = stationaryStartTime else {
                stationaryStartTime = Date()
                return
            }

            let elapsed = Date().timeIntervalSince(startTime)

            if elapsed >= time && !isStationary {
                // Detected stationary visit - send entry event
                isStationary = true
                visitEntryTime = Date()
                NSLog("LocationManager: Visit detected (entry) at: \\(location.coordinate.latitude), \\(location.coordinate.longitude)")

                // Send visit entry to server
                Task {
                    await sendVisitEventToServer(location: location, eventTime: visitEntryTime!, isEntry: true)
                }

                plugin?.notifyVisitDetected(
                    latitude: location.coordinate.latitude,
                    longitude: location.coordinate.longitude,
                    arrivedAt: startTime
                )
            }
        } else {
            // Moved outside radius
            if isStationary {
                // Send visit exit event
                let exitTime = Date()
                NSLog("LocationManager: Left visit location (exit) at: \\(location.coordinate.latitude), \\(location.coordinate.longitude)")

                Task {
                    await sendVisitEventToServer(location: location, eventTime: exitTime, isEntry: false)
                }
            }
            lastLocation = location
            stationaryStartTime = Date()
            isStationary = false
            visitEntryTime = nil
        }
    }

    // MARK: - Server Communication

    private func sendPendingLocations() async {
        let defaults = UserDefaults.standard
        guard let apiUrl = defaults.string(forKey: "StationTracker.apiUrl"),
              let apiKey = defaults.string(forKey: "StationTracker.apiKey"),
              let endpoint = defaults.string(forKey: "StationTracker.endpoint") else {
            NSLog("LocationManager: API not configured, skipping send")
            return
        }

        let pendingLocations = LocationDatabase.shared.getPendingLocations(limit: 50)
        if pendingLocations.isEmpty {
            return
        }

        NSLog("LocationManager: Sending \\(pendingLocations.count) pending locations")

        var sentCount = 0
        var failedCount = 0

        for record in pendingLocations {
            let success = await sendLocationToServer(
                apiUrl: apiUrl,
                apiKey: apiKey,
                endpoint: endpoint,
                record: record
            )

            if success {
                LocationDatabase.shared.markAsSent(id: record.id)
                sentCount += 1
            } else {
                LocationDatabase.shared.incrementRetryCount(id: record.id)
                failedCount += 1

                // Stop batch if too many retries
                if record.retryCount >= 3 {
                    NSLog("LocationManager: Record \\(record.id) failed after \\(record.retryCount) retries, stopping batch")
                    break
                }
            }

            try? await Task.sleep(nanoseconds: 100_000_000) // 100ms delay
        }

        NSLog("LocationManager: Send complete: \\(sentCount) sent, \\(failedCount) failed")

        // Cleanup old sent records
        let oneWeekAgo = Date().addingTimeInterval(-7 * 24 * 60 * 60)
        LocationDatabase.shared.deleteSentLocations(olderThan: oneWeekAgo)
    }

    private func sendLocationToServer(
        apiUrl: String,
        apiKey: String,
        endpoint: String,
        record: LocationRecord
    ) async -> Bool {
        guard let url = URL(string: "\\(apiUrl)\\(endpoint)") else {
            return false
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.timeoutInterval = 10

        let formatter = ISO8601DateFormatter()
        let timestamp = formatter.string(from: record.timestamp)

        let body: [String: Any] = [
            "user_id": record.userId,
            "lat": record.latitude,
            "lng": record.longitude,
            "timestamp": timestamp
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (_, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse {
                NSLog("LocationManager: Server response: \\(httpResponse.statusCode) for record \\(record.id)")
                return (200...299).contains(httpResponse.statusCode)
            }

            return false
        } catch {
            NSLog("LocationManager: Error sending location: \\(error.localizedDescription)")
            return false
        }
    }

    private func sendVisitEventToServer(location: CLLocation, eventTime: Date, isEntry: Bool) async {
        let defaults = UserDefaults.standard
        guard let apiUrl = defaults.string(forKey: "StationTracker.apiUrl"),
              let apiKey = defaults.string(forKey: "StationTracker.apiKey"),
              let endpoint = defaults.string(forKey: "StationTracker.endpoint"),
              let userId = defaults.string(forKey: "StationTracker.userId") else {
            NSLog("LocationManager: API not configured, skipping visit event")
            return
        }

        let eventType = isEntry ? "entry" : "exit"
        NSLog("LocationManager: Sending visit \\(eventType) event to server")

        guard let url = URL(string: "\\(apiUrl)\\(endpoint)") else {
            NSLog("LocationManager: Invalid API URL")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.timeoutInterval = 10

        let formatter = ISO8601DateFormatter()
        let timestamp = formatter.string(from: eventTime)

        let body: [String: Any] = [
            "user_id": userId,
            "lat": location.coordinate.latitude,
            "lng": location.coordinate.longitude,
            "timestamp": timestamp,
            "event_type": eventType
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (_, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse {
                NSLog("LocationManager: Visit \\(eventType) event sent: \\(httpResponse.statusCode)")

                if !(200...299).contains(httpResponse.statusCode) {
                    NSLog("LocationManager: Visit \\(eventType) event failed with code: \\(httpResponse.statusCode)")
                }
            }
        } catch {
            NSLog("LocationManager: Error sending visit \\(eventType) event: \\(error.localizedDescription)")
        }
    }
}
