import json
from django.core.management.base import BaseCommand, CommandError
from staff_api.legacy import snapshot, import_snapshot


class Command(BaseCommand):
    help = "Back up legacy SQLite, then import atomically. Use --dry-run on a separate target first."

    def add_arguments(self, parser):
        parser.add_argument("source")
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--backup")

    def handle(self, *args, **options):
        try:
            backup = snapshot(options["source"], options["backup"])
            report = import_snapshot(backup["backup"], options["dry_run"])
        except (ValueError, OSError, KeyError) as error:
            raise CommandError(str(error)) from None
        self.stdout.write(json.dumps({"backup": backup, "migration": report}, indent=2))
