
from rest_framework import viewsets
from rest_framework.permissions import AllowAny
from .models import Station
from .serializers import StationSerializer

class StationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Station.objects.all()
    serializer_class = StationSerializer
    permission_classes = [AllowAny]
    
    def get_queryset(self):
        queryset = Station.objects.all()
        lat = self.request.query_params.get('lat', None)
        lng = self.request.query_params.get('lng', None)
        
        if lat is not None and lng is not None:
            # TODO: Implement distance-based filtering
            pass
            
        return queryset
