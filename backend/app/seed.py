"""
Run with:  python -m app.seed

Wipes every collection and leaves exactly ONE account: an admin. No
demo student/advisor/hod/principal accounts, no demo tasks, agents,
placements, messages, skills, or reports — those were only ever
stand-ins for a real backend, which now exists. Every other account
and every other piece of data now comes from real usage: people sign
up (Login → Create account), advisors add registered students to
their class, admin creates real agents, etc.

The admin login is: admin@campusflow.edu / password123
(change the password after first login — there's no "change password"
flow yet, so for now that means editing this file and re-running, or
updating the hashed_password field directly in Mongo.)
"""
import asyncio
from campusflow.backend.app.database import (
    users_col, tasks_col, agents_col, placements_col,
    messages_col, skills_col, reports_col,
)
from campusflow.backend.app.core.security import hash_password
from campusflow.backend.app.models.user import resolve_role_from_email

ADMIN_EMAIL = "admin@campusflow.edu"
ADMIN_PASSWORD = "password123"
ADMIN_NAME = "IT Admin"


async def seed():
    # Wipe everything — every collection this app owns.
    await users_col.delete_many({})
    await tasks_col.delete_many({})
    await agents_col.delete_many({})
    await placements_col.delete_many({})
    await messages_col.delete_many({})
    await skills_col.delete_many({})
    await reports_col.delete_many({})

    role = resolve_role_from_email(ADMIN_EMAIL)
    await users_col.insert_one({
        "name": ADMIN_NAME,
        "email": ADMIN_EMAIL,
        "hashed_password": hash_password(ADMIN_PASSWORD),
        "role": role.value,
        "dept": "All",
    })

    print("Database reset. Every collection is empty except one admin account:")
    print(f"  {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
    print("Everyone and everything else -- students, advisors, HODs, the")
    print("principal, tasks, agents, placements, messages, skills, reports --")
    print("now has to be created for real through the app (Sign up, Admin ->")
    print("Agent manager, Advisor -> Students, etc.). Nothing is pre-seeded.")


if __name__ == "__main__":
    asyncio.run(seed())
