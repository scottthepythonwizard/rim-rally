from datetime import timedelta
import uuid
from django.conf import settings
from django.core.mail import EmailMessage
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from payments.models import ConfirmationEmail


class Command(BaseCommand):
    help = "Send queued confirmation emails; retry failures with backoff. Run every minute."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=50)

    def handle(self, *args, **options):
        sent = failed = 0
        for _ in range(max(0, min(options["limit"], 1000))):
            with transaction.atomic():
                now = timezone.now()
                mail = ConfirmationEmail.objects.select_for_update().filter(
                    Q(locked_until__isnull=True) | Q(locked_until__lte=now),
                    sent_at__isnull=True, next_attempt_at__lte=now).order_by("pk").first()
                if not mail:
                    break
                mail.attempts += 1
                mail.lease_token = uuid.uuid4()
                mail.locked_until = now + timedelta(minutes=5)
                mail.save(update_fields=["attempts", "lease_token", "locked_until"])
            # Do not hold a database write lock while waiting for SMTP.
            update = {"lease_token": None, "locked_until": None}
            try:
                # SMTP has at-least-once delivery semantics after a process crash.
                message = EmailMessage(mail.subject, mail.body, settings.DEFAULT_FROM_EMAIL, [mail.recipient],
                    headers={"Message-ID": f"<booking-{mail.booking_id}@rim-rally.invalid>"})
                if message.send(fail_silently=False) != 1:
                    raise RuntimeError("Email backend did not accept the message")
                update["sent_at"] = timezone.now()
                sent += 1
            except Exception:
                # No SMTP credentials, receipt data or recipient address in worker logs.
                failed += 1
                update["next_attempt_at"] = timezone.now() + timedelta(minutes=min(60, 2 ** min(mail.attempts, 6)))
                self.stderr.write(f"Email job {mail.pk} failed; retry scheduled.")
            ConfirmationEmail.objects.filter(pk=mail.pk, lease_token=mail.lease_token).update(**update)
        self.stdout.write(f"Sent {sent}; failed {failed}.")
