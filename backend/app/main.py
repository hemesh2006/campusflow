from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import ensure_indexes
from app.routers import users
from app.routers import agents, assistant, auth, dev, knowledge, messages, overview, placements, reports, skills, system, tasks

app = FastAPI(title="CampusFlow API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(tasks.router)
app.include_router(agents.router)
app.include_router(placements.router)
app.include_router(messages.router)
app.include_router(skills.router)
app.include_router(system.router)
app.include_router(overview.router)
app.include_router(reports.router)
app.include_router(assistant.router)
app.include_router(knowledge.router)

# Dev-only no-password bypass login — router itself 403s unless
# settings.dev_mode is True (see app/routers/dev.py).
if settings.dev_mode:
    app.include_router(dev.router)


@app.on_event("startup")
async def on_startup():
    await ensure_indexes()


@app.get("/health")
async def health():
    return {"status": "ok"}
