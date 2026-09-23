# CampusFlow API

Python + Django backend for the CampusFlow frontend, using MongoDB
(via Motor, the async driver) for storage.

## Stack

- **Django** — ASGI runtime, URL dispatch, CORS, and API responses
- **Django REST Framework** — request serializers and API validation
- **Django async views** — endpoint dispatch around Motor's async driver
- **MongoDB / Motor** — async database driver
- **python-jose** — JWT issuing/verification
- **passlib + bcrypt** — password hashing

## 1. Setup

```bash
cd campusflow-backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# edit .env — at minimum set JWT_SECRET to a long random string,
# and MONGO_URI if you're not running Mongo on localhost:27017
```

You need a MongoDB instance running. Easiest options:
- Local: `brew install mongodb-community` (Mac) or the equivalent for
  your OS, then `mongod`
- Docker: `docker run -d -p 27017:27017 mongo`
- Free hosted: [MongoDB Atlas](https://www.mongodb.com/atlas) — put
  the connection string it gives you in `MONGO_URI`

## 2. Seed demo data (optional but recommended)

```bash
python -m app.seed
```

Creates one demo student — `hemesh@campusflow.edu` / `password123` —
with a few tasks, agents, and placement drives, so you have something
to see immediately.

## 3. Run it

```bash
uvicorn django_project.asgi:application --reload --port 8000
```

Open `http://localhost:8000/health` to verify the Django API is running.

## API surface

| Endpoint | Method | Notes |
|---|---|---|
| `/auth/signup` | POST | `{name, email, password, dept?}` → role is auto-resolved from the email (same rule as the frontend's `resolveRoleFromEmail`), returns a JWT |
| `/auth/login` | POST | `{email, password}` → JWT |
| `/auth/me` | GET | Current user, from the JWT |
| `/tasks` | GET/POST | Scoped to the logged-in user |
| `/tasks/{id}` | PATCH | Update status/title/due |
| `/agents` | GET/POST | Admins see all; everyone else sees their own |
| `/agents/{id}/status` | PATCH | Admin-only |
| `/placements` | GET/POST | Scoped to the logged-in user |
| `/messages?group=CSE-C` | GET/POST | Group is just a string key — `"CSE-C"`, `"hod-advisor-aids"`, `"principal-hod"`, etc. — this is how the hierarchy pages in the frontend map to one endpoint |

Every protected route expects `Authorization: Bearer <token>`.

## 4. Wire up the React frontend

This is the main piece of work — the frontend currently reads
everything from `src/data/mockData.js` and fakes auth in
`src/context/AuthContext.jsx`. Replace them one at a time:

**Auth first.** In `AuthContext.jsx`, replace the `login`/`signup`
bodies with real calls:

```js
const login = async ({ email, password }) => {
  const res = await fetch("http://localhost:8000/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error("Login failed");
  const data = await res.json();
  sessionStorage.setItem("campusflow.token", data.access_token);
  persist(data.user);
  return data.user;
};
```

Keep the returned shape (`{id, name, email, role, dept}`) the same as
now — every page already expects it, so nothing downstream needs to
uvicorn django_project.asgi:application --reload --host 127.0.0.1 --port 8000

**Then each resource.** For every mock export you replace (say,
`STUDENT_TASKS`), swap the import for a `fetch` in that page's
component, attaching the token:
## Backend layout

```text
backend/
├── django_project/       Django settings, ASGI entrypoint, URL registry
├── apps/                 Django domain apps
│   ├── accounts/          Authentication, profiles, users, hierarchy
│   ├── tasks/             Task endpoints
│   ├── agents/            Agents, assistant, knowledge
│   ├── communication/     Messages and direct communication
│   ├── academic/          Placements, reports, skills
│   └── platform/          Overview and system endpoints
├── app/
│   ├── api/               DRF serializers and request parsing
│   ├── core/              JWT security and authenticated-user helpers
│   ├── models/            Pydantic API/domain shapes
│   ├── services/          Mongo-backed application services and integrations
│   ├── database.py        Motor client and collection definitions
│   ├── config.py          Environment-backed application settings
│   └── seed.py            Optional local demo-data seeding command
├── data/                  Local JSON data used by application services
├── manage.py               Django management commands
├── requirements.txt        Runtime dependencies
└── .env.example            Environment variable template
```

Keep endpoint code in the relevant `apps/<domain>` package, reusable
validation in `app/api`, authentication in `app/core`, and database
integrations in `app/services`.
The backend uses Uvicorn as its canonical server because Motor requires a
persistent ASGI event loop.

```js
const token = sessionStorage.getItem("campusflow.token");
const res = await fetch("http://localhost:8000/tasks", {
  headers: { Authorization: `Bearer ${token}` },
});
const tasks = await res.json();
```

Do this incrementally — the app will keep working with a mix of real
and mock data while you migrate page by page. Tasks and Placements
are good ones to start with since they're already wired above.

**CORS** is already open to `http://localhost:5173` (Vite's default
port) via `CORS_ORIGINS` in `.env` — add more origins comma-separated
if you deploy the frontend elsewhere.

## Adding a new resource

Every resource follows the same pattern — copy `apps/tasks` as a template:

1. DRF serializers for `Create` / `Out` shapes
2. A Motor collection reference in `app/database.py`
3. A router with `GET`/`POST`/`PATCH` scoped by `current_user`
4. App-local URL patterns in `apps/<domain>/urls.py`

## Migration status

The active application is Django/ASGI with DRF installed and MongoDB
remaining the storage layer. All active API routes use native Django URL
patterns, DRF serializers, and async Motor queries. The old FastAPI-style
compatibility router has been removed.

Good next candidates, following the frontend: `reports`, `agent
limits` (the Admin Agent Manager settings), and a dedicated
`common-group` model if you outgrow the generic `messages` collection
(e.g. to track per-message read receipts server-side instead of in
the frontend's local state).

## Known version pin

`passlib[bcrypt]` breaks with `bcrypt>=4.1` (a bug in passlib's
backend detection, not yours) — `requirements.txt` pins
`bcrypt==4.0.1` to avoid it. If you ever see "password cannot be
longer than 72 bytes" on signup, this is why — don't unpin it.

## Before production

This is a working starting point, not production-hardened. Before
shipping:
- Never commit `.env` — it holds `JWT_SECRET` and your DB connection string
- Add refresh tokens / shorter access-token expiry
- Replace `resolve_role_from_email` with a real directory/SSO lookup
- Add rate limiting on `/auth/*`
- Serve behind HTTPS
- Add request validation limits (file upload size, etc.) once you wire up attachments
