import Foundation

/**
 * Storage for geofence events on iOS
 */
class GeofenceEventStorage {
    
    static let shared = GeofenceEventStorage()
    
    private let userDefaults = UserDefaults.standard
    private let eventsKey = "geofence_events"
    private let maxStoredEvents = 100
    
    private init() {}
    
    func saveEvent(_ eventData: [String: Any]) {
        var events = getStoredEvents()
        events.insert(eventData, at: 0) // Add to beginning
        
        // Keep only the most recent events
        if events.count > maxStoredEvents {
            events = Array(events.prefix(maxStoredEvents))
        }
        
        saveEvents(events)
        
        print("Saved geofence event: \(eventData["action"] ?? "unknown") for \(eventData["identifier"] ?? "unknown")")
    }
    
    func getStoredEvents() -> [[String: Any]] {
        guard let data = userDefaults.data(forKey: eventsKey),
              let events = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return []
        }
        
        return events
    }
    
    func clearEvents() {
        userDefaults.removeObject(forKey: eventsKey)
        print("Cleared stored geofence events")
    }
    
    func getAndClearEvents() -> [[String: Any]] {
        let events = getStoredEvents()
        clearEvents()
        return events
    }
    
    private func saveEvents(_ events: [[String: Any]]) {
        do {
            let data = try JSONSerialization.data(withJSONObject: events)
            userDefaults.set(data, forKey: eventsKey)
        } catch {
            print("Error saving geofence events: \(error)")
        }
    }
}