from django.contrib.auth import views as auth_views
from django.urls import path
from . import views
from .forms import CustomerAuthenticationForm

app_name = "payments"
urlpatterns = [
    path("book/", views.book, name="book"),
    path("signup/", views.signup, name="signup"),
    path("login/", auth_views.LoginView.as_view(template_name="payments/login.html", authentication_form=CustomerAuthenticationForm), name="login"),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("session/", views.session, name="session"),
    path("mine/", views.mine, name="mine"),
    path("<uuid:booking_id>/", views.detail, name="detail"),
    path("<uuid:booking_id>/qr/", views.qr, name="qr"),
    path("<uuid:booking_id>/receipt/", views.receipt, name="receipt"),
    path("<uuid:booking_id>/cancel/", views.cancel, name="cancel"),
]
