from . import tasks
from . import group_tasks

urlpatterns = tasks.urlpatterns + group_tasks.urlpatterns
