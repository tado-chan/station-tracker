import json
import boto3
import os
from datetime import datetime
from decimal import Decimal
import math

# AWS clients
dynamodb = boto3.resource('dynamodb')
location_client = boto3.client('location')

# Environment variables
TABLE_NAME = os.environ['DYNAMODB_TABLE_NAME']
GEOFENCE_COLLECTION = os.environ['GEOFENCE_COLLECTION_NAME']

table = dynamodb.Table(TABLE_NAME)


def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in meters using Haversine formula"""
    R = 6371000  # Earth's radius in meters

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    return R * c


def lambda_handler(event, context):
    """
    Process location data and evaluate geofences

    Expected input:
    {
        "user_id": "user123",
        "lat": 35.6812,
        "lng": 139.7671,
        "timestamp": "2025-10-15T10:00:00Z"
    }
    """

    try:
        # Parse request body
        if 'body' in event:
            body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
        else:
            body = event

        user_id = body.get('user_id')
        latitude = body.get('lat')
        longitude = body.get('lng')
        timestamp_str = body.get('timestamp')

        # Validate required fields
        if not all([user_id, latitude, longitude, timestamp_str]):
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing required fields'})
            }

        # Convert timestamp
        try:
            timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        except:
            timestamp = datetime.utcnow()

        print(f"Processing location for user {user_id}: ({latitude}, {longitude})")

        # Evaluate geofences using Amazon Location Service
        try:
            response = location_client.batch_evaluate_geofences(
                CollectionName=GEOFENCE_COLLECTION,
                DevicePositionUpdates=[
                    {
                        'DeviceId': user_id,
                        'Position': [longitude, latitude],  # Note: ALS uses [lng, lat] order
                        'SampleTime': timestamp
                    }
                ]
            )

            print(f"Geofence evaluation response: {response}")

            # Process results
            if response.get('Errors'):
                print(f"Geofence evaluation errors: {response['Errors']}")
                return {
                    'statusCode': 500,
                    'body': json.dumps({'error': 'Geofence evaluation failed'})
                }

            # Get geofence matches
            geofence_matches = []
            for error in response.get('Errors', []):
                print(f"Error: {error}")

            # Check if device is inside any geofence
            # Note: BatchEvaluateGeofences returns events, not current state
            # We need to query the device position to get current geofences
            try:
                device_position = location_client.get_device_position(
                    CollectionName=GEOFENCE_COLLECTION,
                    DeviceId=user_id
                )
                print(f"Device position: {device_position}")
            except Exception as e:
                print(f"Could not get device position: {e}")

            # Alternative: List geofences and manually check distance
            # This is more reliable for our use case
            geofences_response = location_client.list_geofences(
                CollectionName=GEOFENCE_COLLECTION
            )

            # Find the closest geofence within radius
            closest_geofence = None
            min_distance = float('inf')

            for geofence in geofences_response.get('Entries', []):
                # Geofence geometry is a circle with center and radius
                geofence_geometry = geofence.get('Geometry', {}).get('Circle', {})
                if geofence_geometry:
                    center = geofence_geometry['Center']
                    radius = geofence_geometry['Radius']

                    # Calculate distance from user to geofence center
                    distance = calculate_distance(
                        latitude, longitude,
                        center[1], center[0]  # ALS uses [lng, lat]
                    )

                    print(f"Distance to {geofence['GeofenceId']}: {distance}m (radius: {radius}m)")

                    # Check if user is within geofence
                    if distance <= radius:
                        if distance < min_distance:
                            min_distance = distance
                            closest_geofence = {
                                'station_id': geofence['GeofenceId'],
                                'distance': distance
                            }

            # If user is inside a geofence, record the visit
            if closest_geofence:
                station_id = closest_geofence['station_id']
                print(f"User {user_id} entered station {station_id}")

                # Check if there's an existing open visit
                try:
                    existing_visits = table.query(
                        KeyConditionExpression='user_id = :uid',
                        ExpressionAttributeValues={
                            ':uid': user_id
                        },
                        ScanIndexForward=False,
                        Limit=1
                    )

                    last_visit = existing_visits['Items'][0] if existing_visits['Items'] else None

                    # If last visit is to a different station or is closed, create new entry
                    if not last_visit or last_visit.get('exited_at') or last_visit.get('station_id') != station_id:
                        # Create new visit entry
                        table.put_item(
                            Item={
                                'user_id': user_id,
                                'entered_at': timestamp.isoformat(),
                                'station_id': station_id,
                                'exited_at': None,
                                'distance_meters': Decimal(str(round(closest_geofence['distance'], 2))),
                                'latitude': Decimal(str(latitude)),
                                'longitude': Decimal(str(longitude))
                            }
                        )
                        print(f"Created new visit record for {user_id} at {station_id}")
                    else:
                        print(f"User {user_id} already at station {station_id}")

                except Exception as e:
                    print(f"Error checking/creating visit: {e}")
                    return {
                        'statusCode': 500,
                        'body': json.dumps({'error': 'Database operation failed'})
                    }
            else:
                # User is not in any geofence - check if we need to close any open visits
                print(f"User {user_id} not in any geofence")

                try:
                    existing_visits = table.query(
                        KeyConditionExpression='user_id = :uid',
                        ExpressionAttributeValues={
                            ':uid': user_id
                        },
                        ScanIndexForward=False,
                        Limit=1
                    )

                    last_visit = existing_visits['Items'][0] if existing_visits['Items'] else None

                    # If there's an open visit, close it
                    if last_visit and not last_visit.get('exited_at'):
                        table.update_item(
                            Key={
                                'user_id': user_id,
                                'entered_at': last_visit['entered_at']
                            },
                            UpdateExpression='SET exited_at = :exit_time',
                            ExpressionAttributeValues={
                                ':exit_time': timestamp.isoformat()
                            }
                        )
                        print(f"Closed visit for {user_id} at {last_visit['station_id']}")

                except Exception as e:
                    print(f"Error closing visit: {e}")

            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': 'Location processed successfully',
                    'geofence': closest_geofence['station_id'] if closest_geofence else None
                })
            }

        except Exception as e:
            print(f"Error evaluating geofences: {e}")
            import traceback
            traceback.print_exc()
            return {
                'statusCode': 500,
                'body': json.dumps({'error': f'Geofence evaluation error: {str(e)}'})
            }

    except Exception as e:
        print(f"Error processing request: {e}")
        import traceback
        traceback.print_exc()
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
