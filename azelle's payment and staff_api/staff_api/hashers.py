"""Read-only compatibility for the Node scrypt hashes; Django upgrades on login."""
import base64
import hashlib
import hmac
from django.contrib.auth.hashers import BasePasswordHasher, mask_hash


def b64(data):
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def unb64(data):
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


class LegacyScryptHasher(BasePasswordHasher):
    algorithm = "rrs"

    def encode(self, password, salt):
        raise NotImplementedError("New passwords use Django's preferred hasher.")

    def verify(self, password, encoded):
        try:
            _, salt, expected = encoded.split("$")
            actual = hashlib.scrypt(password.encode(), salt=unb64(salt), n=32768, r=8, p=3, dklen=64, maxmem=64 * 1024 * 1024)
            return hmac.compare_digest(actual, unb64(expected))
        except (ValueError, TypeError):
            return False

    def safe_summary(self, encoded):
        return {"algorithm": self.algorithm, "hash": mask_hash(encoded[-16:])}

    def must_update(self, encoded):
        return True
