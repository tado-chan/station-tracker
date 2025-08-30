import Foundation
import Capacitor
import CoreLocation
import UIKit

/**
 * Capacitor plugin for native background geofencing on iOS
 */
@objc(BackgroundGeofencePlugin)
public class BackgroundGeofencePlugin: CAPPlugin, CLLocationManagerDelegate {
    
    private var locationManager: CLLocationManager?
    private var isTracking = false
    private var geofenceRegions: [String: CLCircularRegion] = [:]
    private var pendingCall: CAPPluginCall?
    
    override public func load() {
        super.load()
        setupLocationManager()
    }
    
    private func setupLocationManager() {
        locationManager = CLLocationManager()
        locationManager?.delegate = self
        locationManager?.desiredAccuracy = kCLLocationAccuracyBest
        locationManager?.distanceFilter = 10.0
        
        // Request permissions
        locationManager?.requestWhenInUseAuthorization()
    }
    
    @objc func startGeofencing(_ call: CAPPluginCall) {
        guard let locationManager = locationManager else {
            call.reject("Location manager not initialized")
            return
        }
        
        // Check location services
        guard CLLocationManager.locationServicesEnabled() else {
            call.reject("Location services not enabled")
            return
        }
        
        // Check authorization
        let authStatus = locationManager.authorizationStatus
        if authStatus == .denied || authStatus == .restricted {
            call.reject("Location permission denied")
            return
        }
        
        if authStatus == .notDetermined {
            pendingCall = call
            locationManager.requestWhenInUseAuthorization()
            return
        }
        
        // Request Always authorization for background location
        if authStatus == .authorizedWhenInUse {
            pendingCall = call
            locationManager.requestAlwaysAuthorization()
            return
        }
        
        // Start location updates and region monitoring
        startLocationServices()
        isTracking = true
        
        call.resolve(["success": true])
    }
    
    @objc func stopGeofencing(_ call: CAPPluginCall) {
        stopLocationServices()
        isTracking = false
        call.resolve(["success": true])
    }
    
    @objc func addGeofences(_ call: CAPPluginCall) {
        guard let geofencesArray = call.getArray("geofences", JSObject.self) else {
            call.reject("Invalid geofences parameter")
            return
        }
        
        guard let locationManager = locationManager else {
            call.reject("Location manager not initialized")
            return
        }
        
        var addedCount = 0
        
        for geofenceData in geofencesArray {
            guard let identifier = geofenceData["identifier"] as? String,
                  let latitude = geofenceData["latitude"] as? Double,
                  let longitude = geofenceData["longitude"] as? Double,
                  let radius = geofenceData["radius"] as? Double else {
                continue
            }
            
            let center = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
            let region = CLCircularRegion(center: center, radius: radius, identifier: identifier)
            
            // Configure notifications
            let notifyOnEntry = geofenceData["notifyOnEntry"] as? Bool ?? true
            let notifyOnExit = geofenceData["notifyOnExit"] as? Bool ?? true
            
            region.notifyOnEntry = notifyOnEntry
            region.notifyOnExit = notifyOnExit
            
            // Store region reference
            geofenceRegions[identifier] = region
            
            // Start monitoring
            locationManager.startMonitoring(for: region)
            addedCount += 1
            
            print("Added geofence region: \(identifier) at (\(latitude), \(longitude)) with radius \(radius)m")
        }
        
        call.resolve([
            "success": true,
            "addedCount": addedCount
        ])
    }
    
    @objc func removeGeofences(_ call: CAPPluginCall) {
        guard let identifiers = call.getArray("identifiers", String.self) else {
            call.reject("Invalid identifiers parameter")
            return
        }
        
        guard let locationManager = locationManager else {
            call.reject("Location manager not initialized")
            return
        }
        
        var removedCount = 0
        
        for identifier in identifiers {
            if let region = geofenceRegions[identifier] {
                locationManager.stopMonitoring(for: region)
                geofenceRegions.removeValue(forKey: identifier)
                removedCount += 1
                print("Removed geofence region: \(identifier)")
            }
        }
        
        call.resolve([
            "success": true,
            "removedCount": removedCount
        ])
    }
    
    @objc func getCurrentLocation(_ call: CAPPluginCall) {
        guard let locationManager = locationManager else {
            call.reject("Location manager not initialized")
            return
        }
        
        guard let location = locationManager.location else {
            call.reject("Unable to get current location")
            return
        }
        
        let result: [String: Any] = [
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "accuracy": location.horizontalAccuracy,
            "timestamp": Int64(location.timestamp.timeIntervalSince1970 * 1000)
        ]
        
        call.resolve(result)
    }
    
    @objc func checkPermissions(_ call: CAPPluginCall) {
        let authStatus = CLLocationManager.authorizationStatus
        
        let locationStatus: String
        let backgroundLocationStatus: String
        
        switch authStatus {
        case .notDetermined:
            locationStatus = "prompt"
            backgroundLocationStatus = "prompt"
        case .denied, .restricted:
            locationStatus = "denied"
            backgroundLocationStatus = "denied"
        case .authorizedWhenInUse:
            locationStatus = "granted"
            backgroundLocationStatus = "denied"
        case .authorizedAlways:
            locationStatus = "granted"
            backgroundLocationStatus = "granted"
        @unknown default:
            locationStatus = "denied"
            backgroundLocationStatus = "denied"
        }
        
        call.resolve([
            "location": locationStatus,
            "backgroundLocation": backgroundLocationStatus
        ])
    }
    
    @objc func requestPermissions(_ call: CAPPluginCall) {
        guard let locationManager = locationManager else {
            call.reject("Location manager not initialized")
            return
        }
        
        pendingCall = call
        
        let authStatus = locationManager.authorizationStatus
        if authStatus == .notDetermined {
            locationManager.requestWhenInUseAuthorization()
        } else if authStatus == .authorizedWhenInUse {
            locationManager.requestAlwaysAuthorization()
        } else {
            // Already determined, return current status
            checkPermissions(call)
        }
    }
    
    private func startLocationServices() {
        guard let locationManager = locationManager else { return }
        
        // Start significant location changes for background updates
        locationManager.startSignificantLocationChanges()
        
        // Start standard location updates when app is active
        locationManager.startUpdatingLocation()
        
        print("Started iOS location services")
    }
    
    private func stopLocationServices() {
        guard let locationManager = locationManager else { return }
        
        locationManager.stopSignificantLocationChanges()
        locationManager.stopUpdatingLocation()
        
        // Stop monitoring all regions
        for region in locationManager.monitoredRegions {
            locationManager.stopMonitoring(for: region)
        }
        
        geofenceRegions.removeAll()
        print("Stopped iOS location services")
    }
    
    // MARK: - CLLocationManagerDelegate
    
    public func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        print("Location authorization changed to: \(status.rawValue)")
        
        if let call = pendingCall {
            pendingCall = nil
            
            if status == .authorizedAlways || status == .authorizedWhenInUse {
                if call.methodName == "startGeofencing" {
                    startLocationServices()
                    isTracking = true
                    call.resolve(["success": true])
                } else {
                    checkPermissions(call)
                }
            } else if status == .denied || status == .restricted {
                call.reject("Location permission denied")
            }
        }
    }
    
    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        
        let locationData: [String: Any] = [
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "accuracy": location.horizontalAccuracy,
            "timestamp": Int64(location.timestamp.timeIntervalSince1970 * 1000)
        ]
        
        notifyListeners("locationUpdate", data: locationData)
        
        print("iOS location update: (\(location.coordinate.latitude), \(location.coordinate.longitude))")
    }
    
    public func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        handleRegionEvent(region: region, eventType: "enter")
    }
    
    public func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        handleRegionEvent(region: region, eventType: "exit")
    }
    
    private func handleRegionEvent(region: CLRegion, eventType: String) {
        guard let circularRegion = region as? CLCircularRegion else { return }
        
        let eventData: [String: Any] = [
            "identifier": region.identifier,
            "action": eventType,
            "latitude": circularRegion.center.latitude,
            "longitude": circularRegion.center.longitude,
            "timestamp": Int64(Date().timeIntervalSince1970 * 1000)
        ]
        
        // Store event for app retrieval
        GeofenceEventStorage.shared.saveEvent(eventData)
        
        // Notify listeners
        notifyListeners("geofenceEvent", data: eventData)
        
        // Send local notification if app is in background
        if UIApplication.shared.applicationState != .active {
            sendLocalNotification(eventType: eventType, regionId: region.identifier)
        }
        
        print("iOS geofence event: \(eventType) for region \(region.identifier)")
    }
    
    private func sendLocalNotification(eventType: String, regionId: String) {
        let content = UNMutableNotificationContent()
        content.title = "駅記録アプリ"
        content.body = eventType == "enter" ? "\(regionId)に到着しました" : "\(regionId)から出発しました"
        content.sound = .default
        
        let request = UNNotificationRequest(
            identifier: "geofence-\(regionId)-\(eventType)",
            content: content,
            trigger: nil
        )
        
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                print("Failed to send notification: \(error)")
            }
        }
    }
    
    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("Location manager failed with error: \(error.localizedDescription)")
    }
    
    public func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        print("Monitoring failed for region \(region?.identifier ?? "unknown"): \(error.localizedDescription)")
    }
}