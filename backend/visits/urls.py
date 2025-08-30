
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import StationVisitViewSet

router = DefaultRouter()
router.register(r'', StationVisitViewSet, basename='stationvisit')

urlpatterns = [
    path('', include(router.urls)),
]
