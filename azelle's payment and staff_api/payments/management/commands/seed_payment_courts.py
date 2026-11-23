from django.core.management.base import BaseCommand
from payments.models import Court


class Command(BaseCommand):
    help = "Add the two fixture court types at PHP 400/hour; does not overwrite existing courts."

    def handle(self, *args, **options):
        for name, sport in [("Pickleball Court", "pickleball"), ("Basketball Half-Court", "basketball")]:
            Court.objects.get_or_create(name=name, sport=sport, defaults={"hourly_amount": 40000})
        self.stdout.write("Court setup complete. Confirm the actual inventory and rates in /admin/ before accepting payments.")
