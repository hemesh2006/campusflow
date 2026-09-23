from . import overview, system

urlpatterns = [*overview.urlpatterns, *system.urlpatterns]
