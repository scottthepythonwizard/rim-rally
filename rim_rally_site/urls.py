from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("api/payments/", include("payments.rest_urls")),
    path("api/", include("staff_api.urls")),
    path("admin/", admin.site.urls),
    path("payments/", include("payments.urls")),
]
