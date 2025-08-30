import UIKit
import BackgroundTasks
import CoreLocation

/**
 * Extension for AppDelegate to handle background tasks and location updates
 */
extension AppDelegate {
    
    // Background App Refresh identifier
    static let backgroundAppRefreshTaskIdentifier = "com.stationtracker.app.background-location"
    
    func setupBackgroundTasks() {
        // Register background task
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.backgroundAppRefreshTaskIdentifier,
            using: nil
        ) { task in
            self.handleBackgroundLocationTask(task as! BGAppRefreshTask)
        }
        
        print("Registered background task: \(Self.backgroundAppRefreshTaskIdentifier)")
    }
    
    private func handleBackgroundLocationTask(_ task: BGAppRefreshTask) {
        // Schedule next background task
        scheduleBackgroundLocationTask()
        
        // Set expiration handler
        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }
        
        // Perform background location work
        performBackgroundLocationWork { success in
            task.setTaskCompleted(success: success)
        }
    }
    
    func scheduleBackgroundLocationTask() {
        let request = BGAppRefreshTaskRequest(identifier: Self.backgroundAppRefreshTaskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60) // 15 minutes from now
        
        do {
            try BGTaskScheduler.shared.submit(request)
            print("Scheduled background location task")
        } catch {
            print("Could not schedule background task: \(error)")
        }
    }
    
    private func performBackgroundLocationWork(completion: @escaping (Bool) -> Void) {
        // Create a location manager for background work
        let locationManager = CLLocationManager()
        locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        locationManager.distanceFilter = 50.0
        
        var locationReceived = false
        
        // Set a timeout for location retrieval
        let timeout = DispatchSource.makeTimerSource(queue: DispatchQueue.main)
        timeout.schedule(deadline: .now() + 25) // 25 seconds timeout
        timeout.setEventHandler {
            if !locationReceived {
                locationManager.stopUpdatingLocation()
                completion(false)
            }
            timeout.cancel()
        }
        timeout.resume()
        
        // Location update handler
        let locationDelegate = BackgroundLocationDelegate { location in
            locationReceived = true
            timeout.cancel()
            locationManager.stopUpdatingLocation()
            
            // Process location for geofence checking
            self.processBackgroundLocation(location)
            completion(true)
        }
        
        locationManager.delegate = locationDelegate
        
        // Start location updates
        if CLLocationManager.authorizationStatus == .authorizedAlways {
            locationManager.startUpdatingLocation()
        } else {
            completion(false)
        }
    }
    
    private func processBackgroundLocation(_ location: CLLocation) {
        // Store location update
        let locationData: [String: Any] = [
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "accuracy": location.horizontalAccuracy,
            "timestamp": Int64(location.timestamp.timeIntervalSince1970 * 1000),
            "background": true
        ]
        
        // Save to local storage
        BackgroundLocationStorage.shared.saveLocationUpdate(locationData)
        
        print("Background location update: (\(location.coordinate.latitude), \(location.coordinate.longitude))")
        
        // Trigger local geofence checking if needed
        // This would check against stored geofence regions
    }
    
    // Call this when app enters background
    func applicationDidEnterBackground() {
        scheduleBackgroundLocationTask()
        print("App entered background, scheduled background task")
    }
    
    // Call this when app becomes active
    func applicationDidBecomeActive() {
        // Cancel pending background tasks since app is now active
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.backgroundAppRefreshTaskIdentifier)
        print("App became active, cancelled background tasks")
    }
}

/**
 * Delegate for handling background location updates
 */
private class BackgroundLocationDelegate: NSObject, CLLocationManagerDelegate {
    
    private let locationHandler: (CLLocation) -> Void
    
    init(locationHandler: @escaping (CLLocation) -> Void) {
        self.locationHandler = locationHandler
        super.init()
    }
    
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        locationHandler(location)
    }
    
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("Background location manager failed: \(error)")
    }
}

/**
 * Storage for background location updates
 */
class BackgroundLocationStorage {
    
    static let shared = BackgroundLocationStorage()
    
    private let userDefaults = UserDefaults.standard
    private let locationUpdatesKey = "background_location_updates"
    private let maxStoredUpdates = 50
    
    private init() {}
    
    func saveLocationUpdate(_ locationData: [String: Any]) {
        var updates = getStoredLocationUpdates()
        updates.insert(locationData, at: 0) // Add to beginning
        
        // Keep only the most recent updates
        if updates.count > maxStoredUpdates {
            updates = Array(updates.prefix(maxStoredUpdates))
        }
        
        saveLocationUpdates(updates)
    }
    
    func getStoredLocationUpdates() -> [[String: Any]] {
        guard let data = userDefaults.data(forKey: locationUpdatesKey),
              let updates = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return []
        }
        
        return updates
    }
    
    func clearLocationUpdates() {
        userDefaults.removeObject(forKey: locationUpdatesKey)
    }
    
    func getAndClearLocationUpdates() -> [[String: Any]] {
        let updates = getStoredLocationUpdates()
        clearLocationUpdates()
        return updates
    }
    
    private func saveLocationUpdates(_ updates: [[String: Any]]) {
        do {
            let data = try JSONSerialization.data(withJSONObject: updates)
            userDefaults.set(data, forKey: locationUpdatesKey)
        } catch {
            print("Error saving location updates: \(error)")
        }
    }
}