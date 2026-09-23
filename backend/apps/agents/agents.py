import json
from typing import Optional

from bson import ObjectId
from django.http import JsonResponse
from django.urls import path
from pydantic import BaseModel, ValidationError

from app.database import agents_col, users_col
from app.core.deps import get_current_user
from app.models.user import Role
from app.services import agent_graph


class AgentCreate(BaseModel):
    name: str
    role: str
    status: str = "idle"
    accuracy: float = 95.0
    hallucination: float = 1.0
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None
    deadline: Optional[str] = None


def _body(request):
    try:
        return json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return None


def _error(detail, code):
    return JsonResponse({"detail": detail}, status=code)


def _out(agent):
    return {"id": str(agent["_id"]), **{key: agent.get(key) for key in AgentCreate.model_fields}}


async def _user(request):
    try:
        from app.core.deps import get_current_user
        return await get_current_user(request)
    except Exception as exc:
        return _error(getattr(exc, "detail", "Could not validate credentials"), getattr(exc, "status_code", 401))


async def agents_collection(request):
    current_user = await _user(request)
    if isinstance(current_user, JsonResponse):
        return current_user
    if request.method == "GET":
        query = {} if current_user.role == Role.ADMIN else {"owner_id": current_user.id}
        return JsonResponse([_out(agent) async for agent in agents_col.find(query)], safe=False)
    if request.method != "POST":
        return _error("Method not allowed", 405)
    if current_user.role != Role.ADMIN:
        return _error("Not permitted for this role", 403)
    try:
        payload = AgentCreate.model_validate(_body(request))
    except ValidationError as exc:
        return _error(exc.errors(), 422)
    document = payload.model_dump()
    result = await agents_col.insert_one(document)
    document["_id"] = result.inserted_id
    await agent_graph.rebuild_graph()
    return JsonResponse(_out(document), status=201)


async def agent_status(request, agent_id):
    if request.method != "PATCH":
        return _error("Method not allowed", 405)
    current_user = await _user(request)
    if isinstance(current_user, JsonResponse):
        return current_user
    if current_user.role != Role.ADMIN:
        return _error("Not permitted for this role", 403)
    try:
        object_id = ObjectId(agent_id)
    except Exception:
        return _error("Invalid agent ID", 400)
    status_value = request.GET.get("status_value")
    if not status_value:
        try:
            status_value = (_body(request) or {}).get("status_value")
        except AttributeError:
            status_value = None
    if not status_value:
        return _error("status_value is required", 422)
    agent = await agents_col.find_one({"_id": object_id})
    if not agent:
        return _error("Agent not found", 404)
    await agents_col.update_one({"_id": object_id}, {"$set": {"status": status_value}})
    agent["status"] = status_value
    await agent_graph.rebuild_graph()
    return JsonResponse(_out(agent))


async def agent_network(request):
    current_user = await _user(request)
    if isinstance(current_user, JsonResponse):
        return current_user
    if current_user.role == Role.ADMIN:
        owner_ids = None
    elif current_user.role == Role.HOD:
        owner_ids = [str(user["_id"]) async for user in users_col.find({"dept": current_user.dept})]
    elif current_user.role == Role.ADVISOR:
        class_ids = [str(user["_id"]) async for user in users_col.find({"class_advisor_id": current_user.id})]
        owner_ids = [current_user.id] + class_ids
    else:
        owner_ids = [current_user.id]
    query = {} if owner_ids is None else {"$or": [{"owner_id": {"$in": owner_ids}}, {"role": "system"}]}
    agents = [_out(agent) async for agent in agents_col.find(query)]
    edges = []
    for left in agents:
        for right in agents:
            if left["id"] == right["id"]:
                continue
            if left["role"] == "system" and right["role"] in ("advisor", "hod"):
                edges.append([left["id"], right["id"]])
    return JsonResponse({"agents": agents, "edges": edges})


async def agent_graph_view(request, full=False):
    current_user = await _user(request)
    if isinstance(current_user, JsonResponse):
        return current_user
    if full and current_user.role != Role.ADMIN:
        return _error("Not permitted for this role", 403)
    graph = await agent_graph.rebuild_graph()
    if full:
        return JsonResponse({"generated_at": graph["generated_at"], "agents": graph["agents"], "connections": graph["connections"], "role_graph": graph["role_graph"]})
    view = agent_graph.scoped_view(graph, current_user.id)
    return JsonResponse({"generated_at": graph["generated_at"], "agents": view["agents"], "connections": view["connections"], "name_graph": view["name_graph"], "role_graph": graph["role_graph"]})


async def agent_graph_full(request):
    return await agent_graph_view(request, full=True)


urlpatterns = [
    path("agents", agents_collection),
    path("agents/network", agent_network),
    path("agents/graph", agent_graph_view),
    path("agents/graph/full", agent_graph_full),
    path("agents/<str:agent_id>/status", agent_status),
]
