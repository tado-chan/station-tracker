
from rest_framework import serializers
from .models import StationVisit
from stations.serializers import StationSerializer

class StationVisitSerializer(serializers.ModelSerializer):
    station_data = StationSerializer(source='station', read_only=True)
    
    class Meta:
        model = StationVisit
        fields = '__all__'
        read_only_fields = ['user', 'duration_minutes']

class StationVisitCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = StationVisit
        fields = ['station', 'arrived_at', 'departed_at', 'weather', 'notes', 'latitude', 'longitude']
