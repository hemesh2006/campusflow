from . import agents, assistant, knowledge

urlpatterns = [*agents.urlpatterns, *assistant.urlpatterns, *knowledge.urlpatterns]
