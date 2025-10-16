#!/usr/bin/env python3
"""
Export station data from Django SQLite database to Amazon Location Service

This script:
1. Reads station data from Django SQLite database
2. Creates geofences in Amazon Location Service
3. Each station becomes a circular geofence with 100m radius
"""

import os
import sys
import json
import boto3
import sqlite3
from pathlib import Path

# Configuration
GEOFENCE_RADIUS_METERS = 100
BATCH_SIZE = 10  # ALS allows max 10 geofences per batch request


def get_db_path():
    """Find Django database file"""
    # Try common locations
    possible_paths = [
        '../backend/db.sqlite3',
        '../../backend/db.sqlite3',
        os.path.join(os.path.dirname(__file__), '../../backend/db.sqlite3'),
    ]

    for db_path in possible_paths:
        full_path = os.path.abspath(db_path)
        if os.path.exists(full_path):
            return full_path

    raise FileNotFoundError(
        "Could not find Django database. Please specify the path to db.sqlite3"
    )


def load_stations_from_db(db_path):
    """Load stations from SQLite database"""
    print(f"Loading stations from {db_path}...")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Query stations table
    cursor.execute("""
        SELECT id, name, name_kana, latitude, longitude
        FROM stations_station
        ORDER BY name
    """)

    stations = []
    for row in cursor.fetchall():
        station_id, name, name_kana, lat, lng = row
        stations.append({
            'id': station_id,
            'name': name,
            'name_kana': name_kana,
            'latitude': lat,
            'longitude': lng
        })

    conn.close()

    print(f"Loaded {len(stations)} stations from database")
    return stations


def create_geofences(stations, collection_name, region='ap-northeast-1'):
    """Create geofences in Amazon Location Service"""
    print(f"Creating geofences in collection '{collection_name}'...")

    location_client = boto3.client('location', region_name=region)

    # Process stations in batches
    total_created = 0
    total_failed = 0

    for i in range(0, len(stations), BATCH_SIZE):
        batch = stations[i:i + BATCH_SIZE]

        # Prepare geofence entries
        geofence_entries = []
        for station in batch:
            geofence_entry = {
                'GeofenceId': f"station_{station['id']}",
                'Geometry': {
                    'Circle': {
                        'Center': [station['longitude'], station['latitude']],  # [lng, lat]
                        'Radius': GEOFENCE_RADIUS_METERS
                    }
                },
                'GeofenceProperties': {
                    'station_name': station['name'],
                    'station_name_kana': station['name_kana'],
                    'station_id': str(station['id'])
                }
            }
            geofence_entries.append(geofence_entry)

        try:
            # Batch put geofences
            response = location_client.batch_put_geofence(
                CollectionName=collection_name,
                Entries=geofence_entries
            )

            # Check for errors
            if response.get('Errors'):
                for error in response['Errors']:
                    print(f"Error creating geofence {error['GeofenceId']}: {error['Error']}")
                    total_failed += 1

            # Count successes
            successes = response.get('Successes', [])
            total_created += len(successes)

            print(f"Batch {i // BATCH_SIZE + 1}: Created {len(successes)} geofences")

        except Exception as e:
            print(f"Error creating geofence batch: {e}")
            total_failed += len(batch)

    print(f"\nSummary:")
    print(f"  Total created: {total_created}")
    print(f"  Total failed: {total_failed}")

    return total_created, total_failed


def list_existing_geofences(collection_name, region='ap-northeast-1'):
    """List existing geofences in the collection"""
    print(f"Listing existing geofences in '{collection_name}'...")

    location_client = boto3.client('location', region_name=region)

    try:
        response = location_client.list_geofences(
            CollectionName=collection_name
        )

        geofences = response.get('Entries', [])
        print(f"Found {len(geofences)} existing geofences")

        for geofence in geofences[:5]:  # Show first 5
            print(f"  - {geofence['GeofenceId']}")

        if len(geofences) > 5:
            print(f"  ... and {len(geofences) - 5} more")

        return geofences

    except Exception as e:
        print(f"Error listing geofences: {e}")
        return []


def main():
    """Main execution"""
    import argparse

    parser = argparse.ArgumentParser(
        description='Export stations from Django DB to Amazon Location Service'
    )
    parser.add_argument(
        '--collection',
        required=True,
        help='Amazon Location Service Geofence Collection Name'
    )
    parser.add_argument(
        '--region',
        default='ap-northeast-1',
        help='AWS Region (default: ap-northeast-1)'
    )
    parser.add_argument(
        '--db-path',
        help='Path to Django SQLite database (default: auto-detect)'
    )
    parser.add_argument(
        '--list-only',
        action='store_true',
        help='Only list existing geofences without creating new ones'
    )
    parser.add_argument(
        '--radius',
        type=int,
        default=100,
        help='Geofence radius in meters (default: 100)'
    )

    args = parser.parse_args()

    global GEOFENCE_RADIUS_METERS
    GEOFENCE_RADIUS_METERS = args.radius

    # List existing geofences if requested
    if args.list_only:
        list_existing_geofences(args.collection, args.region)
        return

    # Get database path
    try:
        db_path = args.db_path if args.db_path else get_db_path()
    except FileNotFoundError as e:
        print(f"Error: {e}")
        sys.exit(1)

    # Load stations
    try:
        stations = load_stations_from_db(db_path)
    except Exception as e:
        print(f"Error loading stations: {e}")
        sys.exit(1)

    if not stations:
        print("No stations found in database!")
        sys.exit(1)

    # Create geofences
    try:
        created, failed = create_geofences(stations, args.collection, args.region)

        if failed > 0:
            print(f"\n⚠️  Warning: {failed} geofences failed to create")
            sys.exit(1)
        else:
            print(f"\n✅ Successfully created {created} geofences!")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
