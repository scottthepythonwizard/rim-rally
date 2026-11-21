from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.db import transaction
from payments.models import Court
from staff_api.models import CourtIdentity


class Command(BaseCommand):
    help = "Seed the existing frontend's development inventory in an empty local database only."

    def handle(self, *args, **options):
        if not settings.DEBUG or settings.DATABASES["default"]["ENGINE"] != "django.db.backends.sqlite3":
            raise CommandError("This fixture command is only for local SQLite development.")
        if Court.objects.exists():
            if CourtIdentity.objects.count() == Court.objects.count():
                self.stdout.write("Development courts are already configured.")
                return
            raise CommandError("Courts already exist. Keep your team's inventory and configure aliases explicitly.")
        with transaction.atomic():
            for sport, count in [("pickleball", 3), ("basketball", 1)]:
                for i in range(1, count + 1):
                    court = Court.objects.create(name=f"Court {i}" if sport == "pickleball" else f"Half-court {i}", sport=sport, hourly_amount=40000)
                    CourtIdentity.objects.create(pk=f"{sport}-{i}", court=court)
        self.stdout.write("Local development courts configured.")
