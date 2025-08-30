
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count, Avg
from .models import StationVisit
from .serializers import StationVisitSerializer, StationVisitCreateSerializer

class StationVisitViewSet(viewsets.ModelViewSet):
    serializer_class = StationVisitSerializer
    
    def get_queryset(self):
        return StationVisit.objects.filter(user=self.request.user)
    
    def get_serializer_class(self):
        if self.action == 'create':
            return StationVisitCreateSerializer
        return StationVisitSerializer
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
    
    @action(detail=False, methods=['get'])
    def stats(self, request):
        queryset = self.get_queryset()
        stats = {
            'total_visits': queryset.count(),
            'unique_stations': queryset.values('station').distinct().count(),
            'avg_duration': queryset.aggregate(avg_duration=Avg('duration_minutes'))['avg_duration'] or 0,
            'most_visited': queryset.values('station__name').annotate(
                visit_count=Count('id')
            ).order_by('-visit_count').first()
        }
        return Response(stats)
