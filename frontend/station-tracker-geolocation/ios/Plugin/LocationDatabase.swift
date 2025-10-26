import Foundation
import CoreData

struct LocationRecord {
    let id: UUID
    let latitude: Double
    let longitude: Double
    let accuracy: Double
    let timestamp: Date
    let userId: String
    var retryCount: Int
    var sent: Bool
}

class LocationDatabase {
    static let shared = LocationDatabase()

    private let container: NSPersistentContainer

    private init() {
        container = NSPersistentContainer(name: "StationTrackerLocations")

        // Create model programmatically
        let model = NSManagedObjectModel()

        let entity = NSEntityDescription()
        entity.name = "LocationEntity"
        entity.managedObjectClassName = NSStringFromClass(LocationEntity.self)

        var properties = [NSAttributeDescription]()

        let idAttr = NSAttributeDescription()
        idAttr.name = "id"
        idAttr.attributeType = .UUIDAttributeType
        idAttr.isOptional = false
        properties.append(idAttr)

        let latAttr = NSAttributeDescription()
        latAttr.name = "latitude"
        latAttr.attributeType = .doubleAttributeType
        latAttr.isOptional = false
        properties.append(latAttr)

        let lonAttr = NSAttributeDescription()
        lonAttr.name = "longitude"
        lonAttr.attributeType = .doubleAttributeType
        lonAttr.isOptional = false
        properties.append(lonAttr)

        let accAttr = NSAttributeDescription()
        accAttr.name = "accuracy"
        accAttr.attributeType = .doubleAttributeType
        accAttr.isOptional = false
        properties.append(accAttr)

        let tsAttr = NSAttributeDescription()
        tsAttr.name = "timestamp"
        tsAttr.attributeType = .dateAttributeType
        tsAttr.isOptional = false
        properties.append(tsAttr)

        let userAttr = NSAttributeDescription()
        userAttr.name = "userId"
        userAttr.attributeType = .stringAttributeType
        userAttr.isOptional = false
        properties.append(userAttr)

        let retryAttr = NSAttributeDescription()
        retryAttr.name = "retryCount"
        retryAttr.attributeType = .integer32AttributeType
        retryAttr.isOptional = false
        retryAttr.defaultValue = 0
        properties.append(retryAttr)

        let sentAttr = NSAttributeDescription()
        sentAttr.name = "sent"
        sentAttr.attributeType = .booleanAttributeType
        sentAttr.isOptional = false
        sentAttr.defaultValue = false
        properties.append(sentAttr)

        entity.properties = properties

        model.entities = [entity]

        container = NSPersistentContainer(name: "StationTrackerLocations", managedObjectModel: model)
        container.loadPersistentStores { _, error in
            if let error = error {
                NSLog("LocationDatabase: Failed to load store: \\(error)")
            }
        }
    }

    func insertLocation(
        latitude: Double,
        longitude: Double,
        accuracy: Double,
        timestamp: Date,
        userId: String
    ) {
        let context = container.viewContext
        let entity = LocationEntity(context: context)

        entity.id = UUID()
        entity.latitude = latitude
        entity.longitude = longitude
        entity.accuracy = accuracy
        entity.timestamp = timestamp
        entity.userId = userId
        entity.retryCount = 0
        entity.sent = false

        do {
            try context.save()
        } catch {
            NSLog("LocationDatabase: Failed to save location: \\(error)")
        }
    }

    func getPendingLocations(limit: Int) -> [LocationRecord] {
        let context = container.viewContext
        let fetchRequest: NSFetchRequest<LocationEntity> = LocationEntity.fetchRequest()

        fetchRequest.predicate = NSPredicate(format: "sent == NO")
        fetchRequest.sortDescriptors = [NSSortDescriptor(key: "timestamp", ascending: true)]
        fetchRequest.fetchLimit = limit

        do {
            let entities = try context.fetch(fetchRequest)
            return entities.map { entity in
                LocationRecord(
                    id: entity.id!,
                    latitude: entity.latitude,
                    longitude: entity.longitude,
                    accuracy: entity.accuracy,
                    timestamp: entity.timestamp!,
                    userId: entity.userId!,
                    retryCount: Int(entity.retryCount),
                    sent: entity.sent
                )
            }
        } catch {
            NSLog("LocationDatabase: Failed to fetch pending locations: \\(error)")
            return []
        }
    }

    func markAsSent(id: UUID) {
        let context = container.viewContext
        let fetchRequest: NSFetchRequest<LocationEntity> = LocationEntity.fetchRequest()
        fetchRequest.predicate = NSPredicate(format: "id == %@", id as CVarArg)

        do {
            let entities = try context.fetch(fetchRequest)
            if let entity = entities.first {
                entity.sent = true
                try context.save()
            }
        } catch {
            NSLog("LocationDatabase: Failed to mark as sent: \\(error)")
        }
    }

    func incrementRetryCount(id: UUID) {
        let context = container.viewContext
        let fetchRequest: NSFetchRequest<LocationEntity> = LocationEntity.fetchRequest()
        fetchRequest.predicate = NSPredicate(format: "id == %@", id as CVarArg)

        do {
            let entities = try context.fetch(fetchRequest)
            if let entity = entities.first {
                entity.retryCount += 1
                try context.save()
            }
        } catch {
            NSLog("LocationDatabase: Failed to increment retry count: \\(error)")
        }
    }

    func deleteSentLocations(olderThan date: Date) {
        let context = container.viewContext
        let fetchRequest: NSFetchRequest<LocationEntity> = LocationEntity.fetchRequest()
        fetchRequest.predicate = NSPredicate(format: "sent == YES AND timestamp < %@", date as CVarArg)

        do {
            let entities = try context.fetch(fetchRequest)
            for entity in entities {
                context.delete(entity)
            }
            try context.save()
        } catch {
            NSLog("LocationDatabase: Failed to delete sent locations: \\(error)")
        }
    }

    func getPendingCount() -> Int {
        let context = container.viewContext
        let fetchRequest: NSFetchRequest<LocationEntity> = LocationEntity.fetchRequest()
        fetchRequest.predicate = NSPredicate(format: "sent == NO")

        do {
            return try context.count(for: fetchRequest)
        } catch {
            NSLog("LocationDatabase: Failed to get pending count: \\(error)")
            return 0
        }
    }
}

@objc(LocationEntity)
class LocationEntity: NSManagedObject {
    @NSManaged var id: UUID?
    @NSManaged var latitude: Double
    @NSManaged var longitude: Double
    @NSManaged var accuracy: Double
    @NSManaged var timestamp: Date?
    @NSManaged var userId: String?
    @NSManaged var retryCount: Int32
    @NSManaged var sent: Bool
}
