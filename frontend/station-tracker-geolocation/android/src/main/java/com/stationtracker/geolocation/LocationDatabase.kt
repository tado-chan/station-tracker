package com.stationtracker.geolocation

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

data class LocationRecord(
    val id: Long,
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float,
    val timestamp: Long,
    val userId: String,
    val retryCount: Int = 0,
    val sent: Boolean = false
)

class LocationDatabase(context: Context) :
    SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    companion object {
        private const val DATABASE_NAME = "station_tracker_locations.db"
        private const val DATABASE_VERSION = 1
        private const val TABLE_LOCATIONS = "locations"

        private const val COLUMN_ID = "id"
        private const val COLUMN_LATITUDE = "latitude"
        private const val COLUMN_LONGITUDE = "longitude"
        private const val COLUMN_ACCURACY = "accuracy"
        private const val COLUMN_TIMESTAMP = "timestamp"
        private const val COLUMN_USER_ID = "user_id"
        private const val COLUMN_RETRY_COUNT = "retry_count"
        private const val COLUMN_SENT = "sent"
    }

    override fun onCreate(db: SQLiteDatabase) {
        val createTable = """
            CREATE TABLE $TABLE_LOCATIONS (
                $COLUMN_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                $COLUMN_LATITUDE REAL NOT NULL,
                $COLUMN_LONGITUDE REAL NOT NULL,
                $COLUMN_ACCURACY REAL NOT NULL,
                $COLUMN_TIMESTAMP INTEGER NOT NULL,
                $COLUMN_USER_ID TEXT NOT NULL,
                $COLUMN_RETRY_COUNT INTEGER DEFAULT 0,
                $COLUMN_SENT INTEGER DEFAULT 0
            )
        """.trimIndent()
        db.execSQL(createTable)

        // Index for faster queries
        db.execSQL("CREATE INDEX idx_sent ON $TABLE_LOCATIONS($COLUMN_SENT)")
        db.execSQL("CREATE INDEX idx_timestamp ON $TABLE_LOCATIONS($COLUMN_TIMESTAMP)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS $TABLE_LOCATIONS")
        onCreate(db)
    }

    fun insertLocation(
        latitude: Double,
        longitude: Double,
        accuracy: Float,
        timestamp: Long,
        userId: String
    ): Long {
        val db = writableDatabase
        val values = ContentValues().apply {
            put(COLUMN_LATITUDE, latitude)
            put(COLUMN_LONGITUDE, longitude)
            put(COLUMN_ACCURACY, accuracy)
            put(COLUMN_TIMESTAMP, timestamp)
            put(COLUMN_USER_ID, userId)
            put(COLUMN_RETRY_COUNT, 0)
            put(COLUMN_SENT, 0)
        }
        return db.insert(TABLE_LOCATIONS, null, values)
    }

    fun getPendingLocations(limit: Int = 50): List<LocationRecord> {
        val db = readableDatabase
        val records = mutableListOf<LocationRecord>()

        val cursor = db.query(
            TABLE_LOCATIONS,
            null,
            "$COLUMN_SENT = ?",
            arrayOf("0"),
            null,
            null,
            "$COLUMN_TIMESTAMP ASC",
            limit.toString()
        )

        cursor.use {
            while (it.moveToNext()) {
                val record = LocationRecord(
                    id = it.getLong(it.getColumnIndexOrThrow(COLUMN_ID)),
                    latitude = it.getDouble(it.getColumnIndexOrThrow(COLUMN_LATITUDE)),
                    longitude = it.getDouble(it.getColumnIndexOrThrow(COLUMN_LONGITUDE)),
                    accuracy = it.getFloat(it.getColumnIndexOrThrow(COLUMN_ACCURACY)),
                    timestamp = it.getLong(it.getColumnIndexOrThrow(COLUMN_TIMESTAMP)),
                    userId = it.getString(it.getColumnIndexOrThrow(COLUMN_USER_ID)),
                    retryCount = it.getInt(it.getColumnIndexOrThrow(COLUMN_RETRY_COUNT)),
                    sent = it.getInt(it.getColumnIndexOrThrow(COLUMN_SENT)) == 1
                )
                records.add(record)
            }
        }

        return records
    }

    fun markAsSent(id: Long): Boolean {
        val db = writableDatabase
        val values = ContentValues().apply {
            put(COLUMN_SENT, 1)
        }
        val rows = db.update(TABLE_LOCATIONS, values, "$COLUMN_ID = ?", arrayOf(id.toString()))
        return rows > 0
    }

    fun incrementRetryCount(id: Long): Boolean {
        val db = writableDatabase
        db.execSQL(
            "UPDATE $TABLE_LOCATIONS SET $COLUMN_RETRY_COUNT = $COLUMN_RETRY_COUNT + 1 WHERE $COLUMN_ID = ?",
            arrayOf(id.toString())
        )
        return true
    }

    fun deleteSentLocations(olderThanTimestamp: Long) {
        val db = writableDatabase
        db.delete(
            TABLE_LOCATIONS,
            "$COLUMN_SENT = ? AND $COLUMN_TIMESTAMP < ?",
            arrayOf("1", olderThanTimestamp.toString())
        )
    }

    fun getPendingCount(): Int {
        val db = readableDatabase
        val cursor = db.rawQuery(
            "SELECT COUNT(*) FROM $TABLE_LOCATIONS WHERE $COLUMN_SENT = 0",
            null
        )
        cursor.use {
            if (it.moveToFirst()) {
                return it.getInt(0)
            }
        }
        return 0
    }

    fun deleteOldRecords(olderThanDays: Int = 7) {
        val db = writableDatabase
        val cutoffTimestamp = System.currentTimeMillis() - (olderThanDays * 24 * 60 * 60 * 1000L)
        db.delete(
            TABLE_LOCATIONS,
            "$COLUMN_TIMESTAMP < ?",
            arrayOf(cutoffTimestamp.toString())
        )
    }
}
