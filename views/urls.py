from django.urls import path, re_path

from . import views


app_name = "rim_rally"

urlpatterns = [
    path("", views.home, name="home"),
    path("facilities/<slug:facility_id>", views.facility, name="facility"),
    path("book/<slug:facility_id>", views.next_page, name="book"),
    path("booking/<str:booking_id>/confirmation", views.next_page, name="confirmation"),
    path("login", views.next_page, name="login"),
    path("join", views.next_page, name="join"),
    path("dashboard", views.next_page, name="dashboard"),
    path("dashboard/accounts", views.next_page, name="accounts"),
    path("_next/<path:asset>", views.next_asset, name="next_asset"),
    re_path(r"^(?P<path>(?:fonts|images)/.+)$", views.public_asset, name="public_asset"),
    re_path(r"^.*$", views.not_found, name="not_found"),
]
