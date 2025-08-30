
from django.contrib import admin
from .models import StationVisit

@admin.register(StationVisit)
class StationVisitAdmin(admin.ModelAdmin):
    list_display = ['user', 'station', 'arrived_at', 'duration_minutes', 'weather']
    list_filter = ['arrived_at', 'station', 'weather']
    search_fields = ['user__username', 'station__name']
    date_hierarchy = 'arrived_at'
