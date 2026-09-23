from . import placements, reports, skills

urlpatterns = [*placements.urlpatterns, *reports.urlpatterns, *skills.urlpatterns]
