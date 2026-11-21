import os
from urllib.parse import parse_qs, unquote, urlparse
from pathlib import Path
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
DEBUG = os.getenv("DJANGO_DEBUG", "0") == "1"
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured("Set DJANGO_SECRET_KEY (or DJANGO_DEBUG=1 for local development).")
    SECRET_KEY = "local-development-only-do-not-deploy"
ALLOWED_HOSTS = os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,testserver").split(",")
INSTALLED_APPS = [
    "django.contrib.admin", "django.contrib.auth", "django.contrib.contenttypes",
    "django.contrib.sessions", "django.contrib.messages", "django.contrib.staticfiles",
    "rest_framework", "payments", "staff_api",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware", "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware", "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware", "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "rim_rally_site.urls"
TEMPLATES = [{"BACKEND": "django.template.backends.django.DjangoTemplates", "DIRS": [], "APP_DIRS": True,
    "OPTIONS": {"context_processors": ["django.template.context_processors.request", "django.contrib.auth.context_processors.auth", "django.contrib.messages.context_processors.messages"]}}]
WSGI_APPLICATION = "rim_rally_site.wsgi.application"
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": os.getenv("PAYMENTS_DB_PATH", str(BASE_DIR / "payments.sqlite3")),
    "OPTIONS": {"timeout": 20, "transaction_mode": "IMMEDIATE"},
    "TEST": {"NAME": os.getenv("PAYMENTS_TEST_DB_PATH")}}}
database_url = os.getenv("DATABASE_URL", "")
if database_url:
    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ImproperlyConfigured("DATABASE_URL must reference your team's PostgreSQL database.")
    DATABASES = {"default": {"ENGINE": "django.db.backends.postgresql", "NAME": unquote(parsed.path.lstrip("/")),
        "USER": unquote(parsed.username or ""), "PASSWORD": unquote(parsed.password or ""),
        "HOST": parsed.hostname, "PORT": parsed.port or 5432, "CONN_MAX_AGE": 0,
        "OPTIONS": {"sslmode": parse_qs(parsed.query).get("sslmode", ["require"])[0], "prepare_threshold": None}}}
elif not DEBUG or os.getenv("VERCEL"):
    raise ImproperlyConfigured("Set your team's DATABASE_URL. Local SQLite is permitted only with DJANGO_DEBUG=1 outside Vercel.")
else:
    DATABASES["default"]["NAME"] = os.getenv("PAYMENTS_DB_PATH", str(BASE_DIR / ".rim-rally" / "django-development.sqlite3"))
    Path(DATABASES["default"]["NAME"]).parent.mkdir(parents=True, exist_ok=True)
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 12}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Manila"
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "public"]
NEXT_PORT = int(os.getenv("RIM_RALLY_NEXT_PORT", "3001"))
LOGIN_URL = "/payments/login/"
LOGIN_REDIRECT_URL = "/payments/book/"
LOGOUT_REDIRECT_URL = "/payments/book/"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_SSL_REDIRECT = not DEBUG
SECURE_HSTS_SECONDS = 0 if DEBUG else 31536000
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
DATA_UPLOAD_MAX_MEMORY_SIZE = 6 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 6 * 1024 * 1024
PAYMENT_HOLD_MINUTES = int(os.getenv("PAYMENT_HOLD_MINUTES", "10"))
PAYMENT_REVIEW_HOURS = int(os.getenv("PAYMENT_REVIEW_HOURS", "24"))
PAYMENT_ALLOCATION_GUARD = "staff_api.domain.guard_allocation"
if not (1 <= PAYMENT_HOLD_MINUTES <= 60 and 1 <= PAYMENT_REVIEW_HOURS <= 168):
    raise ImproperlyConfigured("PAYMENT_HOLD_MINUTES must be 1–60 and PAYMENT_REVIEW_HOURS must be 1–168.")
EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "1") == "1"
EMAIL_TIMEOUT = 20
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "Rim & Rally <noreply@example.com>")
FRONTEND_ORIGIN = os.getenv("STAFF_APP_ORIGIN", "http://127.0.0.1:3000").rstrip("/")
CSRF_TRUSTED_ORIGINS = [FRONTEND_ORIGIN]
SESSION_COOKIE_NAME = "rim_rally_staff"
CSRF_COOKIE_NAME = "rim_rally_csrf"
CSRF_COOKIE_HTTPONLY = True
SESSION_COOKIE_AGE = 28800
PASSWORD_HASHERS = ["django.contrib.auth.hashers.PBKDF2PasswordHasher", "staff_api.hashers.LegacyScryptHasher"]
