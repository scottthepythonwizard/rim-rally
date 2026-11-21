"""Restore this integration's exact source changes; never reset Git or databases."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

root = Path(__file__).resolve().parent.parent
backup = root / ".rim-rally/payment-integration-before"
roots = {"frontend": root, "core": root.parent / "payment-core"}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--apply", action="store_true", help="Apply the reviewed restore plan after checking all file hashes.")
args = parser.parse_args()
plan = json.loads((backup / "changes.json").read_text(encoding="utf8"))
originals = json.loads((backup / "manifest.json").read_text(encoding="utf8"))
checked = []
for entry in plan:
    label, relative = entry["path"].split("/", 1)
    base = roots[label].resolve()
    target = (base / relative).resolve()
    if not target.is_relative_to(base):
        raise SystemExit("Unsafe restore path; nothing was changed.")
    current = hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None
    if current != entry["after"]:
        raise SystemExit(f"File changed after integration; refusing to overwrite: {target}")
    source = backup / entry["path"]
    if entry["path"] in originals and (not source.is_file() or hashlib.sha256(source.read_bytes()).hexdigest() != originals[entry["path"]]):
        raise SystemExit(f"Backup validation failed: {source}")
    checked.append((target, source if entry["path"] in originals else None))

for target, source in checked:
    print(("Restore " if source else "Remove new file ") + str(target))
if not args.apply:
    print("Preview only. Add --apply to restore these source files. Databases and secrets are never touched.")
else:
    for target, source in checked:
        if source:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        elif target.exists():
            target.unlink()
    print("Pre-integration source restored. Rebuild Next.js before starting it again.")
