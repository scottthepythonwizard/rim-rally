"""Explicit disposable fixture; cannot populate the existing application database."""
from pathlib import Path
from datetime import datetime, time, timedelta
from io import BytesIO
from PIL import Image, ImageDraw
from django.conf import settings
from django.core.management import BaseCommand, CommandError, call_command
from django.contrib.auth import get_user_model
from django.utils import timezone
from payments.models import Court, PaymentDestination, PlaySession
from staff_api.auth import grant_operations


class Command(BaseCommand):
    help = "Create non-payable fixtures in a separate integration-demo.sqlite3 database."

    def handle(self, *args, **options):
        database = settings.DATABASES["default"]
        if not settings.DEBUG or database["ENGINE"] != "django.db.backends.sqlite3" or Path(database["NAME"]).name != "integration-demo.sqlite3":
            raise CommandError("Use a separate local integration-demo.sqlite3 with DJANGO_DEBUG=1.")
        call_command("seed_frontend_courts")
        for sport in ("pickleball", "basketball"):
            court = Court.objects.filter(sport=sport, active=True).order_by("pk").first()
            for days in range(1, 8):
                start = datetime.combine(timezone.localdate() + timedelta(days=days), time(18), timezone.get_default_timezone())
                PlaySession.objects.get_or_create(court=court, name="Demo Open Play", starts_at=start,
                                                  defaults={"ends_at": start + timedelta(hours=2), "capacity": 12, "amount": 15000})
        buffer = BytesIO()
        image = Image.new("RGB", (300, 300), "white")
        ImageDraw.Draw(image).text((20, 130), "TEST ONLY - DO NOT PAY", fill="black")
        image.save(buffer, format="PNG")
        PaymentDestination.objects.get_or_create(label="Integration test instructions", defaults={"payee": "TEST ONLY - DO NOT PAY", "account": "NO REAL TRANSFERS", "qr_data": buffer.getvalue(), "active": True})
        user, created = get_user_model().objects.get_or_create(username="integration-admin", defaults={"email": "integration-admin@example.test", "is_staff": True, "is_superuser": True})
        if created:
            user.set_password("Integration-test-only!9331")
            user.save()
            grant_operations(user)
        self.stdout.write("Disposable test fixtures ready. Login: integration-admin@example.test / Integration-test-only!9331. No real payments.")
