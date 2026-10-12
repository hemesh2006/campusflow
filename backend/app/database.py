from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

client = AsyncIOMotorClient(settings.mongo_uri)
db = client[settings.mongo_db_name]

# Collections — one per resource. Add new ones here as the app grows.
users_col = db["users"]
tasks_col = db["tasks"]
agents_col = db["agents"]
placements_col = db["placements"]
messages_col = db["messages"]
skills_col = db["skills"]
reports_col = db["reports"]
settings_col = db["settings"]  # small key/value docs, e.g. the admin-selected assistant model
attendance_col = db["attendance"]  # daily attendance logs by advisor and date
group_tasks_col = db["group_tasks"]  # advisor-broadcast tasks auto-created from messages
group_task_completions_col = db["group_task_completions"]  # per-student completion records



async def ensure_indexes():
    """Called once at startup. Add new indexes here as new query
    patterns show up — this is the only place that needs to change."""
    await users_col.create_index("email", unique=True)
    await tasks_col.create_index("owner_id")
    await agents_col.create_index("owner_id")
    await placements_col.create_index("company")
    await placements_col.create_index("owner_id")
    await messages_col.create_index("group")
    await skills_col.create_index("owner_id")
    await reports_col.create_index("from_dept")
    await group_tasks_col.create_index("advisor_id")
    await group_tasks_col.create_index("group")
    await group_task_completions_col.create_index([("task_id", 1), ("student_id", 1)], unique=True)
