"""
Station Tracker CDK Stack

Defines all AWS resources for the Station Tracker application.
"""

from pathlib import Path
from typing import Dict, Any

from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    CfnOutput,
    aws_dynamodb as dynamodb,
    aws_lambda as _lambda,
    aws_apigateway as apigateway,
    aws_iam as iam,
    aws_location as location,
)
from constructs import Construct


class StationTrackerStack(Stack):
    """Main CDK Stack for Station Tracker"""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        stage: str,
        location_service_config: Dict[str, str],
        api_config: Dict[str, Any],
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        self.stage = stage
        self.location_config = location_service_config
        self.api_config = api_config

        # Create resources
        self.visit_logs_table = self._create_dynamodb_table()
        self.map = self._create_location_map()
        self.place_index = self._create_place_index()
        self.geofence_collection = self._create_geofence_collection()
        self.location_processor = self._create_lambda_function()
        self.api = self._create_api_gateway()

        # Create outputs
        self._create_outputs()

    def _create_dynamodb_table(self) -> dynamodb.Table:
        """Create DynamoDB table for visit logs"""
        table = dynamodb.Table(
            self,
            "VisitLogsTable",
            table_name=f"station-tracker-visits-{self.stage}",
            partition_key=dynamodb.Attribute(
                name="user_id",
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="entered_at",
                type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=(
                RemovalPolicy.RETAIN if self.stage == 'prod'
                else RemovalPolicy.DESTROY
            ),
            point_in_time_recovery=(self.stage == 'prod')
        )

        return table

    def _create_location_map(self) -> location.CfnMap:
        """Create Amazon Location Service Map"""
        map_resource = location.CfnMap(
            self,
            "StationTrackerMap",
            map_name=self.location_config['mapName'],
            configuration=location.CfnMap.MapConfigurationProperty(
                style="VectorEsriStreets"
            ),
            description="Map for station tracker application"
        )

        return map_resource

    def _create_place_index(self) -> location.CfnPlaceIndex:
        """Create Amazon Location Service Place Index"""
        place_index = location.CfnPlaceIndex(
            self,
            "StationTrackerPlaceIndex",
            index_name=self.location_config['placeIndexName'],
            data_source="Esri",
            description="Place index for station tracker"
        )

        return place_index

    def _create_geofence_collection(self) -> location.CfnGeofenceCollection:
        """Create Amazon Location Service Geofence Collection"""
        geofence_collection = location.CfnGeofenceCollection(
            self,
            "GeofenceCollection",
            collection_name=self.location_config['geofenceCollectionName'],
            description="Geofence collection for station tracking"
        )

        return geofence_collection

    def _create_lambda_function(self) -> _lambda.Function:
        """Create Lambda function for location processing"""
        # Lambda function
        function = _lambda.Function(
            self,
            "LocationProcessor",
            function_name=f"station-tracker-location-processor-{self.stage}",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="lambda_function.lambda_handler",
            code=_lambda.Code.from_asset(
                str(Path(__file__).parent / "lambda" / "location-processor")
            ),
            timeout=Duration.seconds(30),
            memory_size=512,
            environment={
                "DYNAMODB_TABLE_NAME": self.visit_logs_table.table_name,
                "GEOFENCE_COLLECTION_NAME": self.geofence_collection.collection_name,
                "STAGE": self.stage,
            }
        )

        # Grant permissions to DynamoDB
        self.visit_logs_table.grant_read_write_data(function)

        # Grant permissions to Amazon Location Service
        function.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "geo:BatchEvaluateGeofences",
                    "geo:GetDevicePosition",
                    "geo:ListGeofences",
                    "geo:GetGeofence",
                    "geo:PutGeofence",
                    "geo:BatchPutGeofence",
                    "geo:BatchDeleteGeofence",
                ],
                resources=[self.geofence_collection.attr_collection_arn]
            )
        )

        function.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "geo:GetMapTile",
                    "geo:GetMapStyleDescriptor",
                    "geo:GetMapSprites",
                    "geo:GetMapGlyphs",
                ],
                resources=[self.map.attr_map_arn]
            )
        )

        function.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "geo:SearchPlaceIndexForPosition",
                    "geo:SearchPlaceIndexForText",
                ],
                resources=[self.place_index.attr_index_arn]
            )
        )

        return function

    def _create_api_gateway(self) -> apigateway.RestApi:
        """Create API Gateway with API Key authentication"""
        # REST API
        api = apigateway.RestApi(
            self,
            "StationTrackerApi",
            rest_api_name=f"station-tracker-api-{self.stage}",
            description="API for Station Tracker location processing",
            deploy_options=apigateway.StageOptions(
                stage_name=self.stage,
                throttling_rate_limit=self.api_config['throttle']['rateLimit'],
                throttling_burst_limit=self.api_config['throttle']['burstLimit'],
            ),
            default_cors_preflight_options=apigateway.CorsOptions(
                allow_origins=apigateway.Cors.ALL_ORIGINS,
                allow_methods=apigateway.Cors.ALL_METHODS,
                allow_headers=[
                    "Content-Type",
                    "X-Amz-Date",
                    "Authorization",
                    "X-Api-Key",
                    "X-Amz-Security-Token",
                ],
            )
        )

        # API Key
        api_key = api.add_api_key(
            "ApiKey",
            api_key_name=f"station-tracker-api-key-{self.stage}",
            description="API Key for Station Tracker"
        )

        # Usage Plan
        usage_plan = api.add_usage_plan(
            "UsagePlan",
            name=f"station-tracker-usage-plan-{self.stage}",
            throttle=apigateway.ThrottleSettings(
                rate_limit=self.api_config['throttle']['rateLimit'],
                burst_limit=self.api_config['throttle']['burstLimit']
            ),
            quota=apigateway.QuotaSettings(
                limit=10000,
                period=apigateway.Period.DAY
            )
        )

        usage_plan.add_api_key(api_key)
        usage_plan.add_api_stage(
            stage=api.deployment_stage
        )

        # Request validator
        request_validator = apigateway.RequestValidator(
            self,
            "RequestValidator",
            rest_api=api,
            request_validator_name="location-request-validator",
            validate_request_body=True
        )

        # Request model
        location_model = api.add_model(
            "LocationModel",
            content_type="application/json",
            model_name="LocationRequestModel",
            schema=apigateway.JsonSchema(
                schema=apigateway.JsonSchemaVersion.DRAFT4,
                type=apigateway.JsonSchemaType.OBJECT,
                required=["user_id", "lat", "lng", "timestamp"],
                properties={
                    "user_id": apigateway.JsonSchema(
                        type=apigateway.JsonSchemaType.STRING
                    ),
                    "lat": apigateway.JsonSchema(
                        type=apigateway.JsonSchemaType.NUMBER
                    ),
                    "lng": apigateway.JsonSchema(
                        type=apigateway.JsonSchemaType.NUMBER
                    ),
                    "timestamp": apigateway.JsonSchema(
                        type=apigateway.JsonSchemaType.STRING
                    ),
                }
            )
        )

        # API Resources
        location_resource = api.root.add_resource("location")

        location_integration = apigateway.LambdaIntegration(
            self.location_processor,
            request_templates={
                "application/json": '{ "statusCode": "200" }'
            }
        )

        location_resource.add_method(
            "POST",
            location_integration,
            api_key_required=True,
            request_validator=request_validator,
            request_models={
                "application/json": location_model
            }
        )

        # Store API key for outputs
        self.api_key = api_key

        return api

    def _create_outputs(self) -> None:
        """Create CloudFormation outputs"""
        CfnOutput(
            self,
            "ApiUrl",
            value=self.api.url,
            description="API Gateway URL",
            export_name=f"{self.stage}-api-url"
        )

        CfnOutput(
            self,
            "ApiKeyId",
            value=self.api_key.key_id,
            description="API Key ID (use AWS CLI to get the actual key value)",
            export_name=f"{self.stage}-api-key-id"
        )

        CfnOutput(
            self,
            "GeofenceCollectionName",
            value=self.geofence_collection.collection_name,
            description="Geofence Collection Name",
            export_name=f"{self.stage}-geofence-collection"
        )

        CfnOutput(
            self,
            "DynamoDBTableName",
            value=self.visit_logs_table.table_name,
            description="DynamoDB Table Name",
            export_name=f"{self.stage}-dynamodb-table"
        )

        CfnOutput(
            self,
            "ApiKeyCommand",
            value=f"aws apigateway get-api-key --api-key {self.api_key.key_id} --include-value --query 'value' --output text",
            description="Command to retrieve API Key value"
        )
