import asyncio
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "django_project.settings")

from django.core.asgi import get_asgi_application

django_application = get_asgi_application()
_indexes_ensured = False


async def application(scope, receive, send):
    global _indexes_ensured
    if not _indexes_ensured:
        _indexes_ensured = True
        try:
            from app.database import ensure_indexes
            from app.services.hierarchy_sync import trigger_hierarchy_sync
            asyncio.create_task(ensure_indexes())
            trigger_hierarchy_sync()
        except Exception:
            pass
    await django_application(scope, receive, send)

