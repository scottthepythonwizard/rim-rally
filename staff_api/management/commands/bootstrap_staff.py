from django.core.management.base import BaseCommand
from django.conf import settings
from django.db import transaction
from staff_api.auth import invite


class Command(BaseCommand):
    help = "Create a single-use first-admin invitation in the configured backend."

    def add_arguments(self, parser):
        parser.add_argument("email")

    def handle(self, *args, **options):
        with transaction.atomic():
            token = invite(options["email"], "admin", bootstrap=True)
        self.stdout.write(settings.FRONTEND_ORIGIN + "/join#" + token)
