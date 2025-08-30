
from django.contrib import admin
from .models import Station

@admin.register(Station)
class StationAdmin(admin.ModelAdmin):
    list_display = ['name', 'name_kana', 'latitude', 'longitude']
    search_fields = ['name', 'name_kana']
    list_filter = ['created_at']
