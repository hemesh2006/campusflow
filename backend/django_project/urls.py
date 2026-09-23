from django.http import JsonResponse
from django.urls import include, path


def health(request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("health", health),
    path("", include("apps.accounts.urls")),
    path("", include("apps.tasks.urls")),
    path("", include("apps.agents.urls")),
    path("", include("apps.communication.urls")),
    path("", include("apps.academic.urls")),
    path("", include("apps.platform.urls")),
]
