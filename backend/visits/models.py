
from django.db import models
from django.contrib.auth.models import User
from stations.models import Station

class StationVisit(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    station = models.ForeignKey(Station, on_delete=models.CASCADE)
    arrived_at = models.DateTimeField()
    departed_at = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    weather = models.CharField(max_length=50, blank=True)
    notes = models.TextField(blank=True)
    latitude = models.FloatField(help_text='Actual location when visit was recorded')
    longitude = models.FloatField(help_text='Actual location when visit was recorded')
    
    def save(self, *args, **kwargs):
        if self.arrived_at and self.departed_at:
            duration = self.departed_at - self.arrived_at
            self.duration_minutes = int(duration.total_seconds() / 60)
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f'{self.user.username} - {self.station.name} at {self.arrived_at}'
    
    class Meta:
        ordering = ['-arrived_at']
        unique_together = ['user', 'station', 'arrived_at']
