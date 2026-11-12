import os

from django.core.wsgi import get_wsgi_application


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "rim_rally_site.settings")
application = get_wsgi_application()
