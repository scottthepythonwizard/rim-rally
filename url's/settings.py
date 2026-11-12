import os
from pathlib import Path

from django.core.management.utils import get_random_secret_key


BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY") or get_random_secret_key()
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "[::1]"]
ROOT_URLCONF = "rim_rally_site.urls"
WSGI_APPLICATION = "rim_rally_site.wsgi.application"

INSTALLED_APPS = ["django.contrib.staticfiles", "rim_rally"]
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "APP_DIRS": True,
    },
]
TIME_ZONE = "Asia/Manila"
USE_TZ = True

STATIC_URL = "/static/"
STATICFILES_DIRS = [
    BASE_DIR / "public",
    ("brand", BASE_DIR / "src" / "images"),
]

NEXT_PORT = int(os.environ.get("RIM_RALLY_NEXT_PORT", "3001"))
