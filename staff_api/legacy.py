"""Offline migration only. Web requests never open a legacy SQLite database."""
import hashlib
import json
import re
import sqlite3
import uuid
from contextlib import closing
from datetime import datetime, timezone as utc
from pathlib import Path
from django.contrib.auth import get_user_model
from django.db import transaction
from payments.models import Booking, Court, PlaySession, Receipt
from .models import (Audit, BookingRecord, Cancellation, CourtIdentity, CustomerProfile, Hold,
                     HoldRequest, ImportRun, Invitation, Proof, ScheduleIdentity, StaffIdentity)
from .hashers import b64
from .auth import grant_operations
from . import domain as d


def snapshot(source, destination=None):
    source = Path(source).resolve(strict=True)
    destination = Path(destination or source.parent / "backups" / ("staff-" + datetime.now(utc.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".sqlite")).resolve()
    if destination.exists() or destination == source:
        raise ValueError("Backup destination must be a new file.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as origin, closing(sqlite3.connect(destination)) as target:
        origin.backup(target)
        if target.execute("PRAGMA integrity_check").fetchone()[0] != "ok" or target.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("SQLite integrity or relationship checks failed.")
        tables = [r[0] for r in target.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        counts = {t: target.execute('SELECT COUNT(*) FROM "' + t.replace('"', '""') + '"').fetchone()[0] for t in tables}
    report = {"backup": str(destination), "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(), "counts": counts}
    destination.with_suffix(".manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def when(value):
    return datetime.fromtimestamp(value / 1000, utc.utc) if isinstance(value, (int, float)) else d.parse(value) if value else None


def legacy_password(value):
    if not re.fullmatch(r"[0-9a-fA-F]{32}:[0-9a-fA-F]{128}", value):
        raise ValueError("An account has an unsupported password hash. Arrange a Django password reset; no insecure conversion was attempted.")
    salt, key = value.split(":")
    return "rrs$" + b64(bytes.fromhex(salt)) + "$" + b64(bytes.fromhex(key))


def import_snapshot(path, dry_run=False):
    path = Path(path).resolve(strict=True)
    checksum = hashlib.sha256(path.read_bytes()).hexdigest()
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as old:
        old.row_factory = sqlite3.Row
        if old.execute("PRAGMA integrity_check").fetchone()[0] != "ok" or old.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Source integrity or relationships are invalid.")
        names = {r[0] for r in old.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        rows = {name: [dict(r) for r in old.execute('SELECT * FROM "' + name + '"')] if name in names else [] for name in ["accounts", "invitations", "sessions", "login_limits", "schedules", "customers", "booking_holds", "booking_requests", "bookings", "booking_payments", "payment_proofs", "booking_cancellations", "booking_audit"]}
    prior = ImportRun.objects.filter(pk=checksum).first()
    if prior:
        return {**prior.report, "alreadyImported": True}
    with transaction.atomic():
        users, customers, schedules, bookings, records = {}, {}, {}, {}, {}
        User = get_user_model()
        for row in rows["accounts"]:
            existing = StaffIdentity.objects.filter(legacy_id=row["id"]).select_related("user").first()
            if existing:
                users[row["id"]] = existing.user
                continue
            address = row["email"].strip().lower()
            if User.objects.filter(email__iexact=address).exists():
                raise ValueError("A Django account already uses an imported staff email. Resolve the identity mapping before import; existing credentials were not overwritten.")
            user = User.objects.create(username=address if len(address) <= 150 and not User.objects.filter(username=address).exists() else "staff-" + uuid.uuid4().hex, email=address,
                                       password=legacy_password(row["password"]), is_staff=True, is_superuser=row["role"] == "admin", is_active=bool(row["active"]))
            StaffIdentity.objects.create(user=user, legacy_id=row["id"])
            grant_operations(user)
            users[row["id"]] = user
        for row in rows["customers"]:
            existing = CustomerProfile.objects.filter(pk=row["id"]).first()
            if existing:
                customers[row["id"]] = existing
                continue
            profile = d.customer({"name": row["name"], "email": row["email"], "mobile": row["mobile"]})
            if profile.pk != row["id"]:
                CustomerProfile.objects.filter(pk=profile.pk).update(id=row["id"])
                profile.pk = row["id"]
            customers[row["id"]] = profile

        def court_for(sport, label, alias=None):
            court = Court.objects.filter(sport=sport, name__iexact=label).first()
            if not court:
                court = Court.objects.create(sport=sport, name=label, hourly_amount=40000)
            if alias and not CourtIdentity.objects.filter(court=court).exists():
                CourtIdentity.objects.get_or_create(pk=alias, defaults={"court": court})
            return court

        for row in rows["schedules"]:
            existing = ScheduleIdentity.objects.filter(pk=row["id"]).first()
            if existing:
                schedules[row["id"]] = existing.session
                continue
            match = re.fullmatch(r"(?:Court|Half-court)\s*(\d+)", row["court"], re.I)
            court = court_for(row["sport"], row["court"], f"{row['sport']}-{match[1]}" if match else None)
            session = PlaySession.objects.create(court=court, name=row["name"], starts_at=when(row["starts"]), ends_at=when(row["ends"]), capacity=row["capacity"], amount=row["amount"], active=row["status"] == "active")
            ScheduleIdentity.objects.create(pk=row["id"], session=session, version=row["version"])
            schedules[row["id"]] = session
        for row in rows["booking_holds"]:
            hold, created = Hold.objects.get_or_create(pk=row["id"], defaults={"owner": row["owner"], "payload": json.loads(row["payload"])})
            if not created and (hold.owner != row["owner"] or hold.payload != json.loads(row["payload"])):
                raise ValueError("An existing hold differs from the source. Import was rolled back.")
        for row in rows["booking_requests"]:
            HoldRequest.objects.get_or_create(owner=row["owner"], key=row["key"], defaults={"fingerprint": row["fingerprint"], "hold_id": row["hold_id"]})
        payments = {p["booking_id"]: p for p in rows["booking_payments"]}
        for row in rows["bookings"]:
            existing = Booking.objects.filter(pk=row["id"]).first()
            if existing:
                if not BookingRecord.objects.filter(booking=existing, hold_id=row["hold_id"]).exists():
                    raise ValueError("A booking identifier already exists in Django. Resolve the mapping before import.")
                bookings[row["id"]] = existing
                records[payments[row["id"]]["id"]] = existing.bookingrecord
                continue
            hold = Hold.objects.get(pk=row["hold_id"])
            h = hold.payload
            alias = h["session"]["courtId"] if h.get("session") else h["slots"][0]["courtId"]
            court = court_for(h["context"]["sport"], row["court"], alias)
            p = payments[row["id"]]
            b = Booking.objects.create(pk=row["id"], customer=customers[row["customer_id"]].user, customer_email=customers[row["customer_id"]].email,
                request_key=uuid.uuid5(uuid.NAMESPACE_URL, "legacy:" + row["id"]), court=court, play_session=schedules.get(row["session_id"]),
                starts_at=when(row["starts"]), ends_at=when(row["ends"]), amount=row["amount"], status={"reserved": "awaiting_payment", "canceled": "cancelled", "confirmed": "confirmed"}[row["status"]],
                expires_at=when(row["starts"]), destination_label="", payee="", account="", qr_data=b"")
            Booking.objects.filter(pk=b.pk).update(created_at=when(row["created"]))
            r = BookingRecord.objects.create(booking=b, hold=hold, customer=customers[row["customer_id"]], source=row["source"], created_by=users.get(row["created_by"]),
                method=p["method"], payment_status=p["status"], owner=p["owner"], payment_key=p["key"], payment_id=p["id"], reason=p["reason"], ticket=row["ticket"])
            bookings[row["id"]], records[p["id"]] = b, r
        proof_hashes = {}
        for row in rows["payment_proofs"]:
            p, _ = Proof.objects.get_or_create(pk=row["id"], defaults={"record": records[row["payment_id"]], "name": row["name"], "mime": row["mime"], "content": bytes(row["content"]), "submitted": when(row["submitted"]),
                "status": row["status"], "reason": row["reason"], "reviewed_by": users.get(row["reviewed_by"]), "reviewed": when(row["reviewed"])})
            expected = hashlib.sha256(bytes(row["content"])).hexdigest()
            if hashlib.sha256(bytes(p.content)).hexdigest() != expected:
                raise ValueError("An uploaded file checksum differs. Import was rolled back.")
            proof_hashes[p.pk] = expected
        for r in records.values():
            proof = r.proofs.order_by("-submitted", "-id").first()
            if proof:
                sha = hashlib.sha256(bytes(proof.content)).hexdigest()
                if not Receipt.objects.filter(sha256=sha).exclude(booking=r.booking).exists():
                    Receipt.objects.get_or_create(booking=r.booking, defaults={"image": bytes(proof.content), "sha256": sha, "customer_reference": "Imported payment proof"})
                if r.booking.status == "awaiting_payment" and proof.status == "submitted":
                    r.booking.status = "pending_verification"
                    r.booking.save(update_fields=["status"])
        for row in rows["booking_cancellations"]:
            Cancellation.objects.get_or_create(pk=row["id"], defaults={"booking": bookings[row["booking_id"]], "reason": row["reason"], "requested": when(row["requested"]), "status": row["status"], "refund_status": row["refund_status"],
                "decision": row["decision"], "processed_by": users.get(row["processed_by"]), "processed": when(row["processed"])})
        for row in rows["booking_audit"]:
            Audit.objects.get_or_create(pk=row["id"], defaults={"booking": bookings[row["booking_id"]], "actor": users.get(row["actor_id"]), "action": row["action"], "at": when(row["at"]), "note": row["note"]})
        for row in rows["invitations"]:
            Invitation.objects.get_or_create(pk=row["hash"], defaults={"email": row["email"], "role": row["role"], "bootstrap": bool(row["bootstrap"]), "expires": when(row["expires"])})
        expected = {name: len(items) for name, items in rows.items()}
        verified = {"accounts": StaffIdentity.objects.filter(legacy_id__in=users).count(), "customers": CustomerProfile.objects.filter(pk__in=customers).count(),
                    "schedules": ScheduleIdentity.objects.filter(pk__in=schedules).count(), "bookings": Booking.objects.filter(pk__in=bookings).count(),
                    "booking_payments": BookingRecord.objects.filter(payment_id__in=records).count(), "payment_proofs": Proof.objects.filter(pk__in=proof_hashes).count(),
                    "booking_holds": Hold.objects.filter(pk__in=[r["id"] for r in rows["booking_holds"]]).count(),
                    "booking_requests": sum(HoldRequest.objects.filter(owner=r["owner"], key=r["key"], hold_id=r["hold_id"], fingerprint=r["fingerprint"]).count() for r in rows["booking_requests"]),
                    "booking_cancellations": Cancellation.objects.filter(pk__in=[r["id"] for r in rows["booking_cancellations"]]).count(),
                    "booking_audit": Audit.objects.filter(pk__in=[r["id"] for r in rows["booking_audit"]]).count(),
                    "invitations": Invitation.objects.filter(pk__in=[r["hash"] for r in rows["invitations"]]).count()}
        for name, count in verified.items():
            if count != expected[name]:
                raise ValueError(f"Record count mismatch in {name}.")
        for row in rows["bookings"]:
            r = records[payments[row["id"]]["id"]]
            if r.hold_id != row["hold_id"] or r.customer_id != row["customer_id"] or r.booking.customer_id != customers[row["customer_id"]].user_id or r.booking.amount != row["amount"] or r.booking.starts_at != when(row["starts"]) or r.booking.ends_at != when(row["ends"]):
                raise ValueError("A booking relationship, price or time did not match the source.")
        report = {"sourceSha256": checksum, "sourceCounts": expected, "verifiedCounts": verified, "proofSha256": proof_hashes,
                  "sessionsRequireFreshLogin": expected["sessions"], "loginLimitsReset": expected["login_limits"], "dryRun": dry_run}
        if dry_run:
            transaction.set_rollback(True)
        else:
            ImportRun.objects.create(sha256=checksum, report=report)
        return report
