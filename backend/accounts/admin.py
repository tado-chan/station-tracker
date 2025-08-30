
from django.contrib import admin
from .models import UserProfile

@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'enable_notifications', 'created_at']
    list_filter = ['enable_notifications', 'created_at']
    search_fields = ['user__username', 'user__email']
