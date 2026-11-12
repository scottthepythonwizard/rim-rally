from http.client import HTTPConnection, HTTPException

from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import render


# Next's router and server actions use these request headers for navigation and forms.
FORWARDED_HEADERS = {
    "accept", "accept-language", "content-type", "cookie", "if-modified-since",
    "if-none-match", "origin", "range", "referer", "rsc", "user-agent",
    "next-action", "next-router-prefetch", "next-router-segment-prefetch",
    "next-router-state-tree", "next-url",
}
HOP_HEADERS = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailer", "transfer-encoding", "upgrade",
}


def forward_to_next(request):
    host = request.get_host()
    headers = {
        name: value
        for name, value in request.headers.items()
        if name.lower() in FORWARDED_HEADERS
    }
    headers.update({
        "Host": host,
        "X-Forwarded-Host": host,
        "X-Forwarded-Proto": request.scheme,
        "Accept-Encoding": "identity",
    })
    body = request.body if request.method == "POST" else None
    connection = HTTPConnection("127.0.0.1", settings.NEXT_PORT, timeout=20)
    try:
        connection.request(request.method, request.get_full_path(), body, headers)
        upstream = connection.getresponse()
        response = HttpResponse(
            upstream.read(), status=upstream.status,
            content_type=upstream.headers.get("Content-Type"),
        )
        connection_headers = {
            name.strip().lower() for name in upstream.headers.get("Connection", "").split(",")
        }
        for name, value in upstream.getheaders():
            if name.lower() == "set-cookie":
                response.cookies.load(value)
            elif name.lower() not in HOP_HEADERS | connection_headers:
                response.headers[name] = value
        return response
    except (OSError, HTTPException):
        return render(request, "rim_rally/unavailable.html", status=503)
    finally:
        connection.close()
