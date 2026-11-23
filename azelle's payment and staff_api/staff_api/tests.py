import hashlib
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
import uuid
import json
from contextlib import closing
from datetime import timedelta
from io import BytesIO
from pathlib import Path
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command, CommandError
from django.test import SimpleTestCase, TestCase
from django.urls import Resolver404, resolve
from django.utils import timezone
from PIL import Image
from payments.models import Booking
from .hashers import LegacyScryptHasher
from .legacy import snapshot, import_snapshot, legacy_password
from .models import BookingRecord, CustomerProfile, ImportRun, Proof

PASSWORD = "Test-only staff password 9331!"

def picture(color="white"):
    buffer = BytesIO()
    Image.new("RGB", (4, 4), color).save(buffer, format="PNG")
    return buffer.getvalue()


class LocalApiRegistrationTests(TestCase):
    def test_frontend_api_routes_resolve_without_exposing_staff_data(self):
        paths = ["/api/auth/csrf", "/api/auth/login", "/api/auth/logout", "/api/auth/join",
                 "/api/staff/me", "/api/staff/bookings", "/api/staff/accounts", "/api/staff/invitations",
                 "/api/staff/customers", "/api/staff/schedules", "/api/staff/sessions", "/api/staff/walk-ins",
                 "/api/staff/proofs/example", "/api/availability", "/api/open-play", "/api/holds",
                 "/api/payment-attempts", "/api/bookings/example/cancellations"]
        for path in paths:
            with self.subTest(path=path):
                self.assertIsNotNone(resolve(path).func)
                if path.startswith("/api/staff/"):
                    self.assertEqual(self.client.get(path).status_code, 401)
                    self.assertEqual(self.client.post(path, {}, content_type="application/json").status_code, 401)

    def test_unrelated_django_routes_and_default_csrf_view_remain(self):
        self.assertEqual(resolve("/payments/session/").url_name, "session")
        self.assertEqual(resolve("/admin/login/").url_name, "login")
        self.assertNotIn("staff_api", settings.CSRF_FAILURE_VIEW)
        result = self.client.get("/payments/session/")
        self.assertEqual(result.status_code, 200)
        self.assertFalse(result.json()["authenticated"])

    def test_staff_bootstrap_creates_only_a_private_invitation(self):
        from io import StringIO
        from .models import Invitation
        output = StringIO()
        call_command("bootstrap_staff", "test@example.test", stdout=output)
        self.assertIn("/join#", output.getvalue())
        self.assertEqual(Invitation.objects.filter(email="test@example.test", role="admin").count(), 1)
        self.assertFalse(get_user_model().objects.filter(is_staff=True).exists())


class ProductionConfigurationTests(TestCase):
    def test_production_and_vercel_refuse_local_sqlite(self):
        env = {**os.environ, "DJANGO_DEBUG": "0", "DJANGO_SECRET_KEY": "test-only-settings-secret", "VERCEL": "1"}
        env.pop("DATABASE_URL", None)
        result = subprocess.run([sys.executable, "-c", "import rim_rally_site.settings"], cwd=settings.BASE_DIR, env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("DATABASE_URL", result.stderr)

    def test_postgres_settings_are_portable_and_pooler_compatible(self):
        env = {**os.environ, "DJANGO_DEBUG": "0", "DJANGO_SECRET_KEY": "test-only-settings-secret", "DATABASE_URL": "postgresql://test_user:test_password@db.example.test:5432/rim_rally?sslmode=require"}
        code = "import rim_rally_site.settings as s; d=s.DATABASES['default']; assert d['ENGINE']=='django.db.backends.postgresql'; assert d['CONN_MAX_AGE']==0; assert d['OPTIONS']['prepare_threshold'] is None; assert d['OPTIONS']['sslmode']=='require'"
        result = subprocess.run([sys.executable, "-c", code], cwd=settings.BASE_DIR, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)


class LegacyImportTests(TestCase):
    def fixture(self, root):
        source = Path(root) / "legacy.sqlite"
        schema = re.search(r"database.exec\(`(.*?)`\);", (Path(settings.BASE_DIR) / "scripts/legacy/staff-store.mjs").read_text(encoding="utf-8"), re.S).group(1)
        salt = bytes.fromhex("ab" * 16)
        password_hash = salt.hex() + ":" + hashlib.scrypt(PASSWORD.encode(), salt=salt, n=32768, r=8, p=3, dklen=64, maxmem=64 * 1024 * 1024).hex()
        self.assertTrue(LegacyScryptHasher().verify(PASSWORD, legacy_password(password_hash)))
        admin, customer, hold, booking, payment, proof = [str(uuid.uuid4()) for _ in range(6)]
        date = (timezone.localdate() + timedelta(days=20)).isoformat()
        start, end = date + "T08:00:00+08:00", date + "T09:00:00+08:00"
        context = {"facilityId": "rim-and-rally", "sport": "pickleball", "date": date, "mode": "court"}
        h = {"id": hold, "context": context, "slots": [{"id": date + "_pickleball-1_8", "courtId": "pickleball-1", "startAt": start, "endAt": end, "amount": 40000, "priceBand": "off-peak"}], "session": None,
             "revision": 1, "expiresAt": end, "booked": True, "quote": {"currency": "PHP", "totalAmount": 40000, "items": [{"id": date + "_pickleball-1_8", "amount": 40000}]}}
        owner = hashlib.sha256(b"a-test-only-migration-credential").hexdigest()
        now = timezone.now().isoformat()
        with closing(sqlite3.connect(source)) as old:
            old.executescript(schema)
            old.execute("INSERT INTO accounts VALUES (?,?,?,?,?)", (admin, "imported@example.test", password_hash, "admin", 1))
            old.execute("INSERT INTO sessions VALUES (?,?,?)", ("old-session", admin, 9999999999999))
            old.execute("INSERT INTO customers VALUES (?,?,?,?)", (customer, "Imported Customer", "imported-customer@example.test", "+639171234567"))
            old.execute("INSERT INTO booking_holds VALUES (?,?,?)", (hold, owner, json.dumps(h)))
            old.execute("INSERT INTO bookings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (booking, hold, customer, "court", "Court 1", None, start, end, 40000, "confirmed", "online", now, "opaque-original-ticket", admin))
            old.execute("INSERT INTO booking_payments VALUES (?,?,?,?,?,?,?,?,?)", (payment, booking, "gcash", "succeeded", str(uuid.uuid4()), owner, admin, now, "Matched transfer"))
            old.execute("INSERT INTO payment_proofs VALUES (?,?,?,?,?,?,?,?,?,?)", (proof, payment, "original.png", "image/png", picture(), now, "verified", "Matched", admin, now))
            old.execute("INSERT INTO booking_audit VALUES (?,?,?,?,?,?)", (str(uuid.uuid4()), booking, admin, "proof_verified", now, "Matched"))
            old.commit()
        return source, booking, proof, customer

    def test_backup_dry_run_verified_import_password_and_file_bytes(self):
        with tempfile.TemporaryDirectory(prefix="rr-migration-fixture-") as root:
            source, booking, proof, customer = self.fixture(root)
            backup = snapshot(source)
            self.assertEqual(hashlib.sha256(Path(backup["backup"]).read_bytes()).hexdigest(), backup["sha256"])
            report = import_snapshot(backup["backup"], dry_run=True)
            self.assertTrue(report["dryRun"])
            self.assertFalse(get_user_model().objects.filter(email="imported@example.test").exists())
            result = import_snapshot(backup["backup"])
            self.assertEqual(result["verifiedCounts"]["bookings"], 1)
            self.assertEqual(result["sessionsRequireFreshLogin"], 1)
            self.assertEqual(Booking.objects.get(pk=booking).customer_id, CustomerProfile.objects.get(pk=customer).user_id)
            self.assertEqual(bytes(Proof.objects.get(pk=proof).content), picture())
            self.assertEqual(BookingRecord.objects.get(booking_id=booking).ticket, "opaque-original-ticket")
            user = get_user_model().objects.get(email="imported@example.test")
            self.assertTrue(user.check_password(PASSWORD))
            user.refresh_from_db()
            self.assertTrue(user.password.startswith("pbkdf2_sha256$"))
            self.assertTrue(import_snapshot(backup["backup"])["alreadyImported"])

    def test_conflicting_staff_identity_rolls_back_without_overwriting_credentials(self):
        with tempfile.TemporaryDirectory(prefix="rr-migration-conflict-") as root:
            source, _, _, _ = self.fixture(root)
            original = get_user_model().objects.create_user("existing", "imported@example.test", "Existing secure password 8773!")
            before = original.password
            with self.assertRaisesRegex(ValueError, "already uses"):
                import_snapshot(source)
            original.refresh_from_db()
            self.assertEqual(original.password, before)
            self.assertFalse(ImportRun.objects.exists())
