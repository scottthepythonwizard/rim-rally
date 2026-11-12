import json

from django.conf import settings
from django.contrib.staticfiles.views import serve
from django.shortcuts import redirect, render
from django.urls import resolve
from django.views.decorators.http import require_http_methods, require_safe
from django.views.decorators.vary import vary_on_headers

from .next_bridge import forward_to_next


FACILITY = json.loads(
    (settings.BASE_DIR / "src" / "mocks" / "facility.json").read_text(encoding="utf-8")
)


@require_safe
@vary_on_headers("RSC")
def home(request):
    if request.headers.get("RSC") == "1":
        return forward_to_next(request)
    return render(request, "rim_rally/home.html", {"facility": FACILITY, "current": "home"})


@require_safe
@vary_on_headers("RSC")
def facility(request, facility_id):
    if request.headers.get("RSC") == "1":
        return forward_to_next(request)
    if facility_id != FACILITY["id"]:
        return not_found(request)
    return render(
        request, "rim_rally/facility.html", {"facility": FACILITY, "current": "about"}
    )


@require_http_methods(["GET", "HEAD", "POST"])
def next_page(request, **route_parameters):
    return forward_to_next(request)


@require_safe
def next_asset(request, asset):
    return forward_to_next(request)


@require_safe
def public_asset(request, path):
    return serve(request, path)


def not_found(request):
    if request.path_info.endswith("/"):
        canonical_path = request.path_info.removesuffix("/")
        if canonical_path and resolve(canonical_path).func in (facility, next_page):
            path, separator, query = request.get_full_path().partition("?")
            return redirect(
                f"{path.removesuffix('/')}{separator}{query}",
                permanent=True,
                preserve_request=True,
            )
    return render(request, "rim_rally/not_found.html", {"facility": FACILITY}, status=404)
