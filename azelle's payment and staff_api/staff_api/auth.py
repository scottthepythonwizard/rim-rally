import secrets
from datetime import timedelta
from django.contrib.auth import get_user_model, authenticate, login, logout
from django.contrib.auth.models import Permission
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone
from .models import Invitation, StaffIdentity, LoginLimit
from . import domain as d


def grant_operations(user):
    user.user_permissions.add(*Permission.objects.filter(content_type__app_label="payments", codename__in=["view_booking", "change_booking", "view_court", "view_playsession", "add_playsession", "change_playsession", "delete_playsession"]))


def identity(user):
    return StaffIdentity.objects.get_or_create(user=user)[0]


def actor_data(user):
    old = StaffIdentity.objects.filter(user=user).first()
    return {"id": old.legacy_id if old and old.legacy_id else str(user.pk), "email": user.email, "role": "admin" if user.is_superuser else "staff", "active": int(user.is_active)}


def require_staff(request, admin=False, permission="payments.view_booking"):
    u = request.user
    if not u.is_authenticated:
        d.fail("You do not have permission for this action. Log in again.", "UNAUTHENTICATED", 401)
    info = StaffIdentity.objects.filter(user=u).first()
    if not u.is_active or not u.is_staff or request.session.get("staff_version", 0) != (info.version if info else 0):
        d.fail("You do not have permission for this action.", "FORBIDDEN", 403)
    if (admin and not u.is_superuser) or (permission and not u.has_perm(permission)):
        d.fail("You do not have permission for this action.", "FORBIDDEN", 403)
    return u


def rate_limit(address):
    now = timezone.now()
    blocked = False
    with transaction.atomic():
        LoginLimit.objects.filter(expires__lte=now).delete()
        for key, maximum in [("email:" + d.digest(address), 10), ("global", 120)]:
            item, _ = LoginLimit.objects.select_for_update().get_or_create(pk=key, defaults={"expires": now + timedelta(minutes=15)})
            if item.count >= maximum:
                blocked = True
            item.count += 1
            item.save()
    if blocked:
        d.fail("Too many attempts. Try again in 15 minutes.", "RATE_LIMITED", 429)


def sign_in(request, data):
    address = d.email(data.get("email"))
    password = data.get("password")
    if not isinstance(password, str) or not 1 <= len(password) <= 128:
        d.fail("Enter a password of up to 128 characters.")
    rate_limit(address)
    matches = list(get_user_model().objects.filter(email__iexact=address, is_staff=True)[:2])
    user = authenticate(request, username=matches[0].username if len(matches) == 1 else "missing-" + secrets.token_hex(16), password=password)
    if not user or not user.is_staff or not user.is_active:
        d.fail("Email or password is incorrect.", "INVALID_CREDENTIALS", 401)
    login(request, user)
    request.session["staff_version"] = identity(user).version
    request.session.set_expiry(28800)
    LoginLimit.objects.filter(pk="email:" + d.digest(address)).delete()
    return actor_data(user)


def invite(address, role, bootstrap=False):
    address = d.email(address)
    if role not in {"admin", "staff"}:
        d.fail("Choose a valid role.")
    User = get_user_model()
    if bootstrap and User.objects.filter(is_staff=True).exists():
        d.fail("Initial setup is complete. An admin can invite more accounts.")
    if User.objects.filter(email__iexact=address, is_staff=True).exists():
        d.fail("An account already exists for this email.")
    secret = secrets.token_urlsafe(32)
    if bootstrap:
        Invitation.objects.filter(bootstrap=True).delete()
    Invitation.objects.filter(email=address).delete()
    Invitation.objects.create(hash=d.digest(secret), email=address, role=role, bootstrap=bootstrap, expires=timezone.now() + timedelta(hours=24))
    return secret


def accept(data):
    secret = d.text(data.get("invitation"), "the invitation code", 200)
    entry = Invitation.objects.select_for_update().filter(hash=d.digest(secret), expires__gt=timezone.now()).first()
    User = get_user_model()
    if not entry or (entry.bootstrap and User.objects.filter(is_staff=True).exists()) or User.objects.filter(email__iexact=entry.email, is_staff=True).exists():
        d.fail("This invitation is invalid or expired.")
    password = data.get("password")
    if not isinstance(password, str) or not 12 <= len(password) <= 128:
        d.fail("Use a password between 12 and 128 characters.")
    validate_password(password)
    user = User(username=entry.email if len(entry.email) <= 150 and not User.objects.filter(username=entry.email).exists() else "staff-" + secrets.token_hex(16), email=entry.email, is_staff=True, is_superuser=entry.role == "admin")
    user.set_password(password)
    user.save()
    identity(user)
    grant_operations(user)
    entry.delete()
    return {"message": "Account created."}


def update_account(actor, data):
    identifier = str(data.get("id", ""))
    legacy = StaffIdentity.objects.filter(legacy_id=identifier).select_related("user").first()
    target = legacy.user if legacy else get_user_model().objects.filter(pk=int(identifier), is_staff=True).first() if identifier.isdigit() else None
    if not target:
        d.fail("Account not found.")
    if target.pk == actor.pk:
        d.fail("Another admin must make changes to your account.")
    if data.get("role") not in {"staff", "admin"} or str(data.get("active")) not in {"0", "1"}:
        d.fail("Invalid account settings.")
    active, admin = str(data["active"]) == "1", data["role"] == "admin"
    if (target.is_active, target.is_superuser) != (active, admin):
        target.is_active, target.is_superuser = active, admin
        target.save(update_fields=["is_active", "is_superuser"])
        info = identity(target)
        info.version += 1
        info.save(update_fields=["version"])
        grant_operations(target)
    return {"message": "Account updated."}
