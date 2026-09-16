"""Agent graph manager
=======================
Maintains a single persisted JSON file describing the whole agent
network — every agent, how they're connected to each other, and which
agent ids each user is allowed to view (their access scope). Stored at
backend/data/agent_graph.json.

Why a file, not just a live query
----------------------------------
The connections and access rules (system -> hod/advisor, hod -> their
department's advisors, advisor -> their class's students, admin sees
everything, everyone else sees only what they own) used to be computed
inline inside GET /agents/network on every request. That logic now
lives in one place (rebuild_graph, below) and is written to disk as a
plain dictionary, so:
  - there's one on-disk source of truth for "what does the agent
    network look like right now", inspectable outside the API
  - any endpoint that needs the graph (network view, admin tooling,
    future features) reads the same file instead of recomputing rules
  - access scope is explicit and auditable per user, not just baked
    into a query filter

Rebuilt on demand — rebuild_graph() is called whenever the frontend
asks for the graph (see GET /agents/graph in routers/agents.py), which
is cheap at this scale (dozens of agents/users) and guarantees the
file never silently drifts from Mongo.

Hand-editable agents
---------------------
agent_graph.json itself is a generated cache — editing it directly is
pointless, the next rebuild overwrites it. For agents that should be
managed by hand (not tied to a Mongo user account), edit
backend/data/agents_config.json instead. rebuild_graph() reads that
file fresh on every call and merges it straight into `agents` /
`connections`, so a saved change there shows up in the frontend's
Agent Network view on its next 5s poll — no restart, no DB write.

File shape:
{
  "generated_at": "2026-08-31T12:00:00+00:00",
  "agents": {
    "<agent_id>": {
      "name": "...", "role": "student|advisor|hod|system",
      "status": "running|idle", "accuracy": 95.0, "hallucination": 1.0,
      "owner_id": "<user_id>|null", "owner_name": "...|null"
    }
  },
  "connections": {
    "<agent_id>": ["<connected_agent_id>", ...]   # undirected adjacency, by id
  },
  "role_graph": {
    "<role>": ["<connected_role>", ...]            # e.g. {"system": ["advisor","hod"], "advisor": ["hod","student","system"]}
  },
  "access_scope": {
    "<user_id>": ["<agent_id>", ...]              # agents that user may view
  }
}

role_graph is the plain, human-readable summary of the network's shape
(e.g. {"system": ["advisor", "hod"], "student": ["advisor"]}) — it's
derived from `connections` by collapsing each agent id down to its
role, so it's always small and never leaks any specific person's data.
Use `agents` + `connections` (or the per-request `name_graph` from
scoped_view) when you need actual instances, not just roles.
"""
import json
import asyncio
from datetime import datetime, timezone
from pathlib import Path

from app.database import agents_col, users_col
from app.models.user import Role

GRAPH_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "agent_graph.json"

# Hand-editable agents live here, separate from the Mongo-backed ones.
# Edit this file directly (see its own "_comment" key) to add or change
# a system-level agent that isn't owned by any user account — the next
# rebuild_graph() call picks it up, no DB write or restart involved.
STATIC_CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "agents_config.json"

_lock = asyncio.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read() -> dict:
    if not GRAPH_PATH.exists():
        return {}
    try:
        text = GRAPH_PATH.read_text(encoding="utf-8")
        return json.loads(text) if text.strip() else {}
    except (json.JSONDecodeError, OSError):
        # A corrupt/partial file should never break the graph endpoint —
        # rebuild_graph() will overwrite it with a fresh copy.
        return {}


def _write(graph: dict) -> None:
    GRAPH_PATH.parent.mkdir(parents=True, exist_ok=True)
    GRAPH_PATH.write_text(json.dumps(graph, indent=2, ensure_ascii=False), encoding="utf-8")


def _add_edge(connections: dict[str, list[str]], a: str, b: str) -> None:
    connections.setdefault(a, [])
    connections.setdefault(b, [])
    if b not in connections[a]:
        connections[a].append(b)
    if a not in connections[b]:
        connections[b].append(a)


def _read_static_config() -> dict:
    """Read backend/data/agents_config.json fresh off disk every call —
    intentionally not cached, so an edit + save is visible on the very
    next rebuild_graph(). Same defensive shape as _read(): a missing or
    corrupt file just means "no static agents", never a hard failure."""
    if not STATIC_CONFIG_PATH.exists():
        return {"agents": {}, "connections": []}
    try:
        text = STATIC_CONFIG_PATH.read_text(encoding="utf-8")
        data = json.loads(text) if text.strip() else {}
        return {"agents": data.get("agents", {}), "connections": data.get("connections", [])}
    except (json.JSONDecodeError, OSError):
        return {"agents": {}, "connections": []}


async def rebuild_graph() -> dict:
    """Pull every agent + user from Mongo, recompute connections and
    per-user access scope, persist the result to agent_graph.json, and
    return the full graph dict."""
    agents_raw = [a async for a in agents_col.find({})]
    users_raw = [u async for u in users_col.find({})]

    agents: dict[str, dict] = {}
    for a in agents_raw:
        aid = str(a["_id"])
        agents[aid] = {
            "name": a.get("name"),
            "role": a.get("role"),
            "status": a.get("status", "idle"),
            "accuracy": a.get("accuracy", 0.0),
            "hallucination": a.get("hallucination", 0.0),
            "owner_id": a.get("owner_id"),
            "owner_name": a.get("owner_name"),
            "deadline": a.get("deadline"),
        }

    # Merge in hand-edited static agents (backend/data/agents_config.json)
    # — this is what makes them show up automatically: this function runs
    # on every /agents/graph call, so a saved file edit is live within one
    # poll cycle, no restart or database write required.
    static_config = _read_static_config()
    agents.update(static_config["agents"])

    users_by_id = {str(u["_id"]): u for u in users_raw}

    system_ids = [aid for aid, a in agents.items() if a["role"] == "system"]
    advisor_agents = [aid for aid, a in agents.items() if a["role"] == "advisor"]
    hod_agents = [aid for aid, a in agents.items() if a["role"] == "hod"]
    student_agents = [aid for aid, a in agents.items() if a["role"] == "student"]

    connections: dict[str, list[str]] = {}

    # System agents coordinate every hod/advisor agent.
    for sid in system_ids:
        for aid in advisor_agents + hod_agents:
            _add_edge(connections, sid, aid)

    # HOD agents connect to their department's advisor agents.
    for hid in hod_agents:
        hod_owner = agents[hid].get("owner_id")
        hod_dept = users_by_id.get(hod_owner, {}).get("dept") if hod_owner else None
        if not hod_dept:
            continue
        for aid in advisor_agents:
            adv_owner = agents[aid].get("owner_id")
            adv_dept = users_by_id.get(adv_owner, {}).get("dept") if adv_owner else None
            if adv_dept == hod_dept:
                _add_edge(connections, hid, aid)

    # Advisor agents connect to agents owned by students mapped into
    # that advisor's class (class_advisor_id).
    for aid in advisor_agents:
        adv_owner = agents[aid].get("owner_id")
        if not adv_owner:
            continue
        for sid in student_agents:
            s_owner = agents[sid].get("owner_id")
            student_doc = users_by_id.get(s_owner) if s_owner else None
            if student_doc and student_doc.get("class_advisor_id") == adv_owner:
                _add_edge(connections, aid, sid)

    # Explicit extra edges declared in the static config (e.g. connecting
    # two hand-added system agents to each other).
    for a_id, b_id in static_config["connections"]:
        if a_id in agents and b_id in agents:
            _add_edge(connections, a_id, b_id)

    for aid in agents:
        connections.setdefault(aid, [])

    # role_graph — the same connections, collapsed from agent ids down
    # to roles, deduped. This is the small, human-readable graph (e.g.
    # {"system": ["advisor", "hod"], "advisor": ["hod", "student", "system"]})
    # — safe to hand to anyone since it names roles, not people.
    role_graph: dict[str, list[str]] = {}
    for aid, neighbors in connections.items():
        role = agents[aid]["role"]
        bucket = role_graph.setdefault(role, [])
        for nid in neighbors:
            n_role = agents[nid]["role"]
            if n_role != role and n_role not in bucket:
                bucket.append(n_role)

    # Access scope — which agent ids each user may view. Mirrors the
    # visibility rules used elsewhere in the app: Admin sees every
    # agent; HOD sees system agents + every agent owned by someone in
    # their department; Advisor sees their own agent + their class's
    # student agents; everyone else sees only their own agent.
    access_scope: dict[str, list[str]] = {}
    for uid, u in users_by_id.items():
        role = u.get("role")
        if role == Role.ADMIN.value:
            visible = list(agents.keys())
        elif role == Role.HOD.value:
            dept = u.get("dept")
            dept_user_ids = {i for i, uu in users_by_id.items() if uu.get("dept") == dept}
            visible = [aid for aid, a in agents.items()
                       if a["role"] == "system" or a.get("owner_id") in dept_user_ids]
        elif role == Role.ADVISOR.value:
            class_ids = {i for i, uu in users_by_id.items() if uu.get("class_advisor_id") == uid}
            own_and_class = class_ids | {uid}
            visible = [aid for aid, a in agents.items() if a.get("owner_id") in own_and_class]
        else:
            visible = [aid for aid, a in agents.items() if a.get("owner_id") == uid]
        access_scope[uid] = visible

    graph = {
        "generated_at": _now(),
        "agents": agents,
        "connections": connections,
        "role_graph": role_graph,
        "access_scope": access_scope,
    }
    async with _lock:
        _write(graph)
    return graph


def load_graph() -> dict:
    """Read the last persisted graph without touching Mongo. Empty
    dict if the file doesn't exist yet — call rebuild_graph() first."""
    return _read()


def scoped_view(graph: dict, user_id: str) -> dict:
    """Filter the full graph down to what a specific user is allowed
    to see, using the persisted access_scope. Returns a proper
    subgraph — {agents, connections, name_graph} — with edges already
    restricted to visible agents only, so the frontend can draw the
    graph directly without re-checking permissions.

    name_graph is connections re-keyed by agent *name* instead of id
    (e.g. {"System agent": ["Advisor agent — CSE-C"], "Advisor agent — CSE-C": [...]})
    — handy for simple list-style UI. Names aren't guaranteed unique
    (two students could share a display name), so treat `agents` (by
    id) as the source of truth and `name_graph` as a display
    convenience only."""
    visible_ids = set(graph.get("access_scope", {}).get(user_id, []))
    agents = {aid: a for aid, a in graph.get("agents", {}).items() if aid in visible_ids}
    connections = {
        aid: [n for n in neighbors if n in visible_ids]
        for aid, neighbors in graph.get("connections", {}).items()
        if aid in visible_ids
    }
    name_graph: dict[str, list[str]] = {}
    for aid, neighbors in connections.items():
        name = agents[aid]["name"]
        name_graph[name] = [agents[nid]["name"] for nid in neighbors]
    return {"agents": agents, "connections": connections, "name_graph": name_graph}
