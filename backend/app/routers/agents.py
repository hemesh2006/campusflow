from typing import Optional, Annotated
from pydantic import BaseModel, BeforeValidator
from fastapi import APIRouter, Depends, HTTPException, status
from bson import ObjectId
from app.database import agents_col, users_col
from app.core.deps import get_current_user, require_role
from app.models.user import UserPublic, Role
from app.services import agent_graph

PyObjectId = Annotated[str, BeforeValidator(str)]


class AgentCreate(BaseModel):
    name: str
    role: str  # student | advisor | hod | system — which population this agent serves
    status: str = "idle"  # running | idle
    accuracy: float = 95.0
    hallucination: float = 1.0
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None
    deadline: Optional[str] = None  # human-readable — next thing this agent is tracking/due on, shown in the network graph's hover tooltip


class AgentOut(AgentCreate):
    id: PyObjectId


router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[AgentOut])
async def list_agents(current_user: UserPublic = Depends(get_current_user)):
    # Admins see every agent; everyone else only sees their own.
    query = {} if current_user.role == Role.ADMIN else {"owner_id": current_user.id}
    cursor = agents_col.find(query)
    return [AgentOut(id=str(a["_id"]), **{k: a.get(k) for k in AgentCreate.model_fields}) async for a in cursor]


@router.post("", response_model=AgentOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role(Role.ADMIN))])
async def create_agent(payload: AgentCreate):
    result = await agents_col.insert_one(payload.model_dump())
    await agent_graph.rebuild_graph()  # keep agent_graph.json in sync with the new agent
    return AgentOut(id=str(result.inserted_id), **payload.model_dump())


@router.patch("/{agent_id}/status", response_model=AgentOut, dependencies=[Depends(require_role(Role.ADMIN))])
async def set_agent_status(agent_id: str, status_value: str):
    agent = await agents_col.find_one({"_id": ObjectId(agent_id)})
    if not agent:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")
    await agents_col.update_one({"_id": ObjectId(agent_id)}, {"$set": {"status": status_value}})
    agent["status"] = status_value
    await agent_graph.rebuild_graph()  # status changes flow straight into the persisted graph
    return AgentOut(id=str(agent["_id"]), **{k: agent.get(k) for k in AgentCreate.model_fields})


class AgentNetworkOut(BaseModel):
    agents: list[AgentOut]
    edges: list[list[str]]


@router.get("/network", response_model=AgentNetworkOut)
async def agent_network(current_user: UserPublic = Depends(get_current_user)):
    """Powers the Agent Network graph (NetworkView.jsx). Edges are derived
    on the fly from real role/ownership data — system agents coordinate
    every hod/advisor agent, hod agents connect to their department's
    advisor agents, and advisor agents connect to the agents owned by
    students mapped into that advisor's class (class_advisor_id). No
    separate edges collection to keep in sync."""
    if current_user.role == Role.ADMIN:
        owner_ids = None
    elif current_user.role == Role.HOD:
        owner_ids = [str(u["_id"]) async for u in users_col.find({"dept": current_user.dept})]
    elif current_user.role == Role.ADVISOR:
        class_ids = [str(u["_id"]) async for u in users_col.find({"class_advisor_id": current_user.id})]
        owner_ids = [current_user.id] + class_ids
    else:
        owner_ids = [current_user.id]

    query = {} if owner_ids is None else {"$or": [{"owner_id": {"$in": owner_ids}}, {"role": "system"}]}
    agents = [AgentOut(id=str(a["_id"]), **{k: a.get(k) for k in AgentCreate.model_fields}) async for a in agents_col.find(query)]

    owner_object_ids = [ObjectId(a.owner_id) for a in agents if a.owner_id]
    owner_info: dict[str, dict] = {}
    if owner_object_ids:
        async for u in users_col.find({"_id": {"$in": owner_object_ids}}):
            owner_info[str(u["_id"])] = {"class_advisor_id": u.get("class_advisor_id")}

    system_ids = [a.id for a in agents if a.role == "system"]
    advisor_agents = [a for a in agents if a.role == "advisor"]
    hod_ids = [a.id for a in agents if a.role == "hod"]
    student_agents = [a for a in agents if a.role == "student"]

    edges: list[list[str]] = []
    for sid in system_ids:
        for aid in [a.id for a in advisor_agents] + hod_ids:
            edges.append([sid, aid])
    for hid in hod_ids:
        for adv in advisor_agents:
            edges.append([hid, adv.id])
    for adv in advisor_agents:
        for sa in student_agents:
            info = owner_info.get(sa.owner_id) if sa.owner_id else None
            if info and info.get("class_advisor_id") == adv.owner_id:
                edges.append([adv.id, sa.id])

    return AgentNetworkOut(agents=agents, edges=edges)


class AgentGraphOut(BaseModel):
    generated_at: str
    agents: dict[str, dict]
    connections: dict[str, list[str]]
    name_graph: dict[str, list[str]] = {}
    role_graph: dict[str, list[str]] = {}


@router.get("/graph", response_model=AgentGraphOut)
async def agent_graph_view(current_user: UserPublic = Depends(get_current_user)):
    """File-backed agent graph — rebuilds backend/data/agent_graph.json
    from live Mongo data (see app/services/agent_graph.py), then returns
    only the subgraph this user's access_scope allows them to see:
    their visible agents (dict keyed by agent id), the connections
    between them (adjacency dict by id), the same connections re-keyed
    by agent name for simple list UI (name_graph), and the small
    role-level summary of the whole network's shape (role_graph, not
    scoped — it only names roles, never people). Poll this endpoint
    (or just re-call it after any action) to pick up changes as soon
    as the file is rebuilt — generated_at changes on every rebuild."""
    full_graph = await agent_graph.rebuild_graph()
    view = agent_graph.scoped_view(full_graph, current_user.id)
    return AgentGraphOut(
        generated_at=full_graph["generated_at"],
        agents=view["agents"],
        connections=view["connections"],
        name_graph=view["name_graph"],
        role_graph=full_graph["role_graph"],
    )


@router.get("/graph/full", response_model=AgentGraphOut, dependencies=[Depends(require_role(Role.ADMIN))])
async def agent_graph_full(_admin: UserPublic = Depends(get_current_user)):
    """Admin-only: the entire persisted graph, unscoped — every agent,
    every connection, straight from agent_graph.json. Useful for
    debugging access scope without impersonating another role."""
    full_graph = await agent_graph.rebuild_graph()
    return AgentGraphOut(
        generated_at=full_graph["generated_at"],
        agents=full_graph["agents"],
        connections=full_graph["connections"],
        role_graph=full_graph["role_graph"],
    )
