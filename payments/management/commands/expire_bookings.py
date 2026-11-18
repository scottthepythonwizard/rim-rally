from django.core.management.base import BaseCommand
from payments.services import expire_bookings


class Command(BaseCommand):
    help = "Release expired unpaid and pending-verification bookings; retain receipts for reconciliation."

    def handle(self, *args, **options):
        self.stdout.write(f"Expired {expire_bookings()} bookings.")
