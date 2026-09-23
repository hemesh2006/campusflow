from . import auth, dev, users
from app.config import settings

urlpatterns = [*auth.urlpatterns, *users.urlpatterns]
if settings.dev_mode:
    urlpatterns.extend(dev.urlpatterns)
