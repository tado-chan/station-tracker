#!/usr/bin/env python3
"""
Station Tracker AWS CDK Application

This app deploys the infrastructure for the Station Tracker application:
- API Gateway (REST API with API Key authentication)
- Lambda function (Python 3.12)
- DynamoDB table (visit logs)
- Amazon Location Service (Map, Place Index, Geofence Collection)
"""

import os
import json
from pathlib import Path

import aws_cdk as cdk
from station_tracker_stack import StationTrackerStack


# Load configuration
config_path = Path(__file__).parent / 'config.json'

if not config_path.exists():
    print('Error: config.json not found!')
    print('Please copy config.example.json to config.json and update with your values.')
    exit(1)

with open(config_path) as f:
    config = json.load(f)


app = cdk.App()

StationTrackerStack(
    app,
    f"StationTrackerStack-{config['stage']}",
    env=cdk.Environment(
        account=config['aws']['account'],
        region=config['aws']['region']
    ),
    stage=config['stage'],
    location_service_config=config['locationService'],
    api_config=config['api'],
    description=f"Station Tracker Infrastructure - {config['stage']} environment"
)

app.synth()
