
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import register, user_login, UserProfileViewSet

router = DefaultRouter()
router.register(r'profile', UserProfileViewSet, basename='userprofile')

urlpatterns = [
    path('register/', register, name='register'),
    path('login/', user_login, name='login'),
    path('', include(router.urls)),
]
