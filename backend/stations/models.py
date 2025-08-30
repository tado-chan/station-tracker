
from django.db import models

class Station(models.Model):
    name = models.CharField(max_length=100, unique=True)
    name_kana = models.CharField(max_length=100)
    latitude = models.FloatField()
    longitude = models.FloatField()
    polygon_data = models.TextField(help_text='GeoJSON polygon data from OSM')
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return self.name
    
    class Meta:
        ordering = ['name']
