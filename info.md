# CampusFlow — Development Log

Project: `campusflow/` — React/Vite frontend + Django REST/MongoDB backend
All changes made by Claude via filesystem MCP on the local machine.

---

## Prompt 1 — Initial evaluation

> ok now you are an evaluator of my website ok and create a md file of the task is completeed ro or not and what are th steps need to the complete to connec the full frontend and backend with tha and make a checklist of the list and save in the campusfllw dir info.md file ok an dandalso incleu the my primpt in tje md file to for the futtire docuemntation and and do not mess the md file ok and keep it simpel the and prolem inthe webiste as the cheklis creat it and ai asloattahce the file f my full prject inof na dm prject is hta campuslfow us htfile system to caput the read na dna analsge y it

### What was evaluated

Read every file in `frontend/src` and `backend/app` directly from disk. No changes made — evaluation only.

### Project structure at time of evaluation

**Frontend** (`frontend/` — React + Vite)
- Entry: `src/main.jsx` → `App.jsx`
- Pages: `src/pages/auth/` (Login, Signup) and `src/pages/dashboards/` (23 pages across all roles)
- API layer: `src/api/` (auth, tasks, agents, placements, messages, users, skills, system, dev)
- Shared components: `src/components/common/` and `src/components/layout/`
- Mock data: `src/data/mockData.js` — large file, many pages still importing from here

**Backend** (`backend/` — Django REST Framework + Motor/MongoDB)
- Entry: `django_project/asgi.py`
- Routers: auth, users, tasks, agents, placements, messages, skills, system, dev
- Models: `app/models/user.py`
- DB: `app/database.py` — Motor async client, one collection per resource
- Seed: `app/seed.py` — one demo account per role, password `password123`

### Key finding — research report vs actual code

The project report describes an AI multi-agent system with LLM-driven task decomposition, adaptive agent generation, and a task dependency graph. The actual code is a standard CRUD app. "Agents" are database rows with a `status: running/idle` field toggled manually by an admin. There are zero LLM calls anywhere in the backend. The foundation (auth, roles, dashboards, real-time messaging) is solid, but the research features are 0% implemented.

### Pages wired to the real backend at evaluation time

| Page | Backend calls |
|---|---|
| Login / Signup | `POST /auth/login`, `POST /auth/signup`, `GET /auth/me` |
| Student → Tasks | `GET /tasks`, `POST /tasks`, `PATCH /tasks/{id}`, `DELETE /tasks/{id}` |
| Student → Placements | `GET /placements`, `GET /messages?group=placement-{id}` |
| Student → Skills | `GET /skills/me` |
| Student → Group | `GET /messages?group=CSE-C`, `POST /messages` |
| Student → Profile | `GET /users/me`, `PATCH /users/me` |
| Advisor → Group | `GET /messages?group=CSE-C`, `POST /messages` |
| HOD → Advisor group | `GET /messages?group=hod-advisor-aids`, `POST /messages` |
| Principal → HOD group | `GET /messages?group=principal-hod`, `POST /messages` |
| Admin → Users | `GET /users`, `DELETE /users/{id}` |
| Admin → Agent manager | `GET /agents`, `PATCH /agents/{id}/status` |

### Pages still on mock data at evaluation time

| Page | Mock imports used |
|---|---|
| Student → Dashboard | `CURRENT_STUDENT`, `STUDENT_TASKS`, `DAILY_PLAN`, `AGENTS`, `PLACEMENT_DRIVES`, `STUDENT_SKILL_ASSESSMENT`, `COMMON_GROUP_FEED` |
| Admin → Dashboard | `AGENTS`, `ADMIN_LOGS`, `HALLUCINATION_TREND` |
| Network View (Admin/HOD/Advisor) | `AGENTS`, `AGENT_EDGES`, `NODE_TYPES` |
| Advisor → Dashboard | `ADVISOR_STUDENTS`, `COMMON_GROUP_FEED`, `AGENTS` |
| Advisor → Students | `ADVISOR_STUDENTS`, `DEPARTMENTS` |
| HOD → Dashboard | `ADVISOR_STUDENTS`, `AGENTS`, `REPORTS` |
| Principal → Dashboard | `DEPT_OVERVIEW`, `INSTITUTION_SUMMARY`, `STAFF_INVOLVEMENT`, `COMPLETION_BY_STUDENT` |
| Principal → Departments | `DEPT_OVERVIEW` |
| Admin → Reports | `REPORTS` |
| Admin → Direct Message | `USER_DIRECTORY`, `ROLE_META` |

### Bugs found at evaluation time

- `AccountNotifications.jsx` — renders `<ProfileForm user={user} />` with no `onSave` prop; Save button silently does nothing.
- `AdvisorStudents.jsx` — Add/CSV-import only writes to local React state; resets on refresh, nothing saved to DB.
- `AgentManagerSettings.jsx` — CPU/GPU gauges hardcoded at `62%` / `41%`; never poll the real machine.
- Skills backend (`POST /skills`, `PATCH /skills/{id}`, `DELETE /skills/{id}`) — fully built but no frontend UI ever calls them.
- `AdminDirectMessage.jsx` — Send button appends to a local array only; nothing is persisted or delivered to the recipient.

### Dev bypass login (pre-existing at evaluation time)

`Login.jsx` has a "Developer bypass" button → `GET /dev/users` + `POST /dev/login/{id}` → signs in as any seeded role with no password. Only active when `backend/.env` has `DEV_MODE=true`.

---

## Prompt 2 — Login stamp + Placement completion + Advisor placement view

> ok i am in testng mode so i need to swithc over different role so you not touch the skip login ok now i need to make a changes in the frontend ok now whenvnere the new upadtion have thenn make one label in the login page liek upate from the date and time just harded code for the liek ok is tha tchagne ed and reflec tinthe outptut liek that ok i think ok and the upad teht chagne in teh info.md and my promp aslo ok and now i need to update my placement page ok make a button called completed actino for the placement ok wheneve the user clik that button and make sure it all the task are compel tef r tehpalcemnt and ok and send the the deatils to the backend to svae that and also it shoul refel t in teh class advisirot side to placemnt section liek thete here the no .fo stunet compelte the acitona dn task completinofor teh speicif drive so that evry student can liely interat thourthe class advsiro in the placemnt copeltion seciton and liek roiunds ,test registration voerall onfo is fed to teh class cadvisor

### Files changed

**`frontend/src/pages/auth/Login.jsx`**
- Added `LAST_UPDATED` constant (hardcoded date/time string — bump by hand on future deploys).
- Rendered as a small pill under the demo-accounts strip: `Updated: <date, time>`.
- Dev bypass button left completely untouched.

**`backend/apps/academic/placements.py`**
- Added `completed: bool = False` and `completed_at: str | None = None` fields to the `Placement` model.
- New endpoint: `POST /placements/{id}/complete` — marks every task in that drive as `done: true`, sets `completed=true` and `completed_at` to current UTC timestamp, saves to MongoDB.

**`frontend/src/api/placements.js`**
- Added `completePlacement(id)` — calls `POST /placements/{id}/complete`.

**`frontend/src/pages/dashboards/StudentPlacements.jsx`**
- Added a "Completed Action" button inside each drive card.
- On click: calls `completePlacement(id)`, marks all tasks done in local state, shows a green "Completed" badge on the card header and a "Completed action logged · timestamp" line.
- Button disables itself permanently after the first successful click (cannot re-trigger).

**`backend/apps/academic/placements.py`** (second addition)
- New endpoint: `GET /placements/advisor/summary` — role-restricted to advisor/hod/principal/admin.
- Groups all students' placement records by `(company, role)`, scoped to the advisor's own department.
- Returns per drive: total students, completed count, and per-student detail (name, email, completed flag, completed_at, full task list).

**`frontend/src/api/placements.js`**
- Added `listAdvisorPlacementSummary()`.

**`frontend/src/pages/dashboards/AdvisorPlacements.jsx`** — new file
- One card per placement drive showing company, role, and an "X/Y students completed" progress bar.
- Expandable per-student list with completion status, timestamp, and full task breakdown (rounds, test registration, etc.).

**`frontend/src/App.jsx`**
- Added route: `/advisor/placements` → `<AdvisorPlacements />`.

**`frontend/src/components/layout/Sidebar.jsx`** (implied by routing)
- Added "Placements" nav item for the advisor role.

---

## Prompt 3 — CPU/GPU live gauges in Admin → Agent Manager

> ok now in the admin page connec the cpu and gpu usage to the frontend

### Files changed

**`backend/apps/platform/system.py`** — new file
- `GET /system/stats` — admin-only (`require_role(Role.ADMIN)`).
- CPU + RAM via `psutil`: returns `cpu_percent`, `cpu_cores`, `memory_percent`, `memory_used_gb`, `memory_total_gb`.
- GPU via subprocess call to `nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,name --format=csv,noheader,nounits`. If `nvidia-smi` is not on PATH or fails for any reason, returns `gpu_available: false` — never sends a made-up number.

**`backend/django_project/urls.py`**
- Added the system app URL registration to `django_project/urls.py`.

**`backend/requirements.txt`**
- Added `psutil==6.0.0`.

**`frontend/src/api/system.js`** — new file
- `getSystemStats()` — calls `GET /system/stats`.

**`frontend/src/pages/dashboards/AgentManagerSettings.jsx`**
- CPU and GPU gauge widgets (previously showing hardcoded `62%` / `41%`) now poll `GET /system/stats` every 4 seconds.
- CPU gauge: shows live percent + core count.
- GPU gauge: shows live percent + GPU name + VRAM used/total when `gpu_available: true`; shows "No GPU detected on this host" otherwise.
- Added RAM usage line as a bonus (psutil already returns it).

### Action required before testing

Run from `campusflow/backend/`:
```
pip install -r requirements.txt
```
or just `pip install psutil==6.0.0`, then restart the FastAPI server. Without this the Workload card throws a 500 error. GPU data only appears if the NVIDIA driver (`nvidia-smi`) is installed.

---

## Prompt 4 — Continue (AccountNotifications fix + Advisor Students + Admin/HOD Dashboard rewires)

> ok continue

### Files changed

**`frontend/src/pages/dashboards/AccountNotifications.jsx`**
- Was: `<ProfileForm user={user} />` with no `onSave` — Save button called `undefined` and silently did nothing.
- Fixed: added `import { updateMyProfile } from "../../api/users"`, added `handleSave` which calls `PATCH /users/me` and then `setUser(updated)` from `useAuth()` so the in-memory session updates immediately. Passed as `onSave={handleSave}` to `ProfileForm`.
- Now works for all roles that have a `/notifications` route (Advisor, HOD, Principal, Admin, Student via StudentProfile).

**`backend/apps/accounts/users.py`**
- Added `StudentCreate` Pydantic model (name, email, optional roll_id, optional dept).
- New endpoint: `GET /advisor/students` — accessible to advisor/hod/principal/admin. Advisors get students filtered to their own `dept`; HOD/Principal/Admin get all students.
- New endpoint: `POST /advisor/students` — accessible to advisor/hod/admin. Creates a new student account in MongoDB with default password `password123` and the advisor's dept. Returns 409 if email already exists.
- Added `from app.core.security import hash_password` import.

**`frontend/src/api/users.js`**
- Added `listAdvisorStudents()` — calls `GET /advisor/students`.
- Added `addStudent(payload)` — calls `POST /advisor/students`.

**`frontend/src/pages/dashboards/AdvisorStudents.jsx`**
- Removed `import { ADVISOR_STUDENTS, DEPARTMENTS } from "../../data/mockData"`.
- Added `useEffect` that calls `listAdvisorStudents()` on mount; populates the student list from the real DB.
- Subtitle now shows real count + advisor's dept (from `useAuth()`).
- "Add student" form: renamed field `id` → `roll_id`, removed hardcoded `DEPARTMENTS` dropdown (dept inherited from advisor profile), added loading/saving/error states, submit now calls `addStudent()` and pushes the returned user into state.
- CSV import: now calls `addStudent()` for each parsed row sequentially; skips duplicates silently; shows saving state.

**`frontend/src/pages/dashboards/AdminDashboard.jsx`**
- Removed `import { AGENTS, ADMIN_LOGS, HALLUCINATION_TREND } from "../../data/mockData"`.
- Added `useState([])` for agents + `useEffect` fetching `GET /agents` on mount via `api.get()`.
- Running/idle count and avg accuracy stat now computed from live agent data.
- "All agents" card now renders from live `agents` state.
- `ADMIN_LOGS` and `HALLUCINATION_TREND` (no backend endpoint yet) inlined as small local constants inside the file — no more `mockData.js` dependency.

**`frontend/src/pages/dashboards/HodDashboard.jsx`**
- Removed `import { ADVISOR_STUDENTS, AGENTS, REPORTS } from "../../data/mockData"`.
- Added `useState` + `useEffect` fetching both `GET /agents` and `GET /advisor/students` on mount.
- Student count stat now shows real number of students in the advisor's dept.
- Running agent count now computed from live agents.
- `REPORTS` (no backend endpoint yet) inlined as a small local `MOCK_REPORTS` constant inside the file.

---

## Prompt 5 — Wire-up review + student "Messages" white-screen crash fix

> ok now you are an evaluator of my website ok and review the campusflow directory ok and analyse what to proceed to run the backend and frontend and wire up ok and i have an issue as a student login the messages is not working i see a white screen and app crashes can you check the frontend and backend code and fix the correct code in the directory files

### Root cause of the white-screen crash

There was no React error boundary anywhere in the app (`main.jsx` rendered `<App />` directly). That means **any** uncaught exception in **any** component tree — not just Messages — unmounts the whole React tree and leaves a blank white page with no on-screen error, only a console stack trace.

On top of that, the messaging components had a few unguarded property accesses that are the most likely trigger for a crash specifically on the student's Messages flow:

- `MyMessages.jsx` — `t.other_user_name[0]?.toUpperCase()` indexed into `other_user_name` *before* the optional-chaining, so a falsy/undefined name (e.g. a DM thread whose other participant no longer resolves) throws `Cannot read properties of undefined`.
- `DirectMessageThread.jsx` — three unguarded calls to `otherUser.name.split(" ")[0]` (placeholder text, empty-state text, footer text) — same class of crash if `otherUser.name` is ever missing.
- `CommonGroupFeed.jsx` — `Linkified` called `text.split(...)` with no fallback for an empty/undefined message body, and the attachment renderer expected `{ kind, file }` while the real backend/DM attachment shape is `{ type, data, name }`, so real image attachments on the Common Group page rendered wrong (not a crash, but a real gap).

### Files changed

**`frontend/src/components/common/ErrorBoundary.jsx`** — new file. Class component implementing `getDerivedStateFromError` / `componentDidCatch`; shows a recoverable "Something went wrong" screen with a reload button instead of a blank page, and still logs the real error to the console for debugging.

**`frontend/src/main.jsx`** — wrapped `<App />` in `<ErrorBoundary>`.

**`frontend/src/pages/dashboards/MyMessages.jsx`** — fixed unsafe indexing: `t.other_user_name?.[0]?.toUpperCase() || "?"` and a fallback `"Unknown user"` label.

**`frontend/src/components/common/DirectMessageThread.jsx`** — introduced `safeName` (`otherUser?.name || "Unknown user"`) and `firstName` derived from it once, used everywhere `otherUser.name` was previously accessed directly; `dmGroup` call also guarded against a missing `otherUser.id`.

**`frontend/src/components/common/CommonGroupFeed.jsx`** — `Linkified` now falls back to `""` for missing text; attachment renderer now reads either `{kind,file}` or `{type,name}` shapes so it no longer silently mis-renders real backend attachments.

### How to run the app (for testing this fix)

Backend (from `campusflow/backend/`):
```
pip install -r requirements.txt
python -m app.seed        # only needed once / to reset demo data
uvicorn django_project.asgi:application --reload --port 8000
```
Requires MongoDB running locally at `mongodb://localhost:27017` (see `backend/.env`).

Frontend (from `campusflow/frontend/`):
```
npm install
npm run dev
```
Opens on `http://localhost:5173` (matches `CORS_ORIGINS` in `backend/.env`). Log in as `student@campusflow.edu` / `password123`, or use the Developer bypass panel on the login screen (`DEV_MODE=true` is already set).

### Still recommended

- [ ] Reproduce the exact crash with browser DevTools open (Console tab) — the new ErrorBoundary will now print the real stack trace there instead of just going blank, which will confirm whether it was one of the fixed spots above or something else entirely (e.g. a stale/orphaned DM thread in the DB pointing at a deleted user).
- [ ] If it recurs, share the console error text — that pinpoints the exact component/line immediately.

---

## Prompt 6 — Advisor must add already-registered students, not create accounts

> ok now when the teacher add the student but he student must be registered before it ok the no.of student appear which is not mapped to the class advisor ok the class advisor responsible to add the student in the member in the class group this can implement thru make a option add the student instead of the enter the details of the student just add a student list of the student and also option of the remove the student in the class advisor page

### What changed conceptually

Before: an advisor's "Add student" button created a **brand-new account** directly from a typed-in form (or CSV), and `GET /advisor/students` just matched on `dept` — so any student who signed up with the same department string automatically "belonged" to that advisor with no explicit step.

Now: a student must **sign up themselves first** (already-existing Sign up page). Signing up no longer puts them in anyone's class. A new `class_advisor_id` field on the user record tracks actual class membership. The advisor's Students page now shows two lists:

- **My class** — students currently mapped to this advisor (`class_advisor_id == advisor's id`), each with a **Remove** button that unmaps them (sends them back to the unassigned pool).
- **Add student panel** — registered students in the advisor's department who aren't mapped to *any* class advisor yet (`class_advisor_id == null`), each with an **Add** button that maps them into the advisor's class.

### Files changed

**`backend/app/models/user.py`** — added `class_advisor_id: Optional[str] = None` to `UserPublic`.

**`backend/app/core/deps.py`** — `user_doc_to_public()` now carries `class_advisor_id` through.

**`backend/apps/accounts/users.py`**
- `GET /advisor/students` — now filters on `class_advisor_id == current_user.id` for advisors (was `dept == current_user.dept`). HOD/Principal/Admin still see every student (oversight view).
- `GET /advisor/students/unassigned` — new. Returns students with `class_advisor_id: null`, scoped to the advisor's own dept (HOD/Principal/Admin see all depts).
- `POST /advisor/students/{id}/add` — new, advisor-only. Maps a student into the caller's class; 409 if that student is already mapped anywhere.
- `POST /advisor/students/{id}/remove` — new, advisor-only. Unmaps a student; 403 if the student isn't currently in *that* advisor's class (stops one advisor detaching another's students).
- `POST /advisor/students` (the old create-a-new-account endpoint) — kept for HOD/Admin onboarding edge cases, but new accounts it creates are now also stamped with `class_advisor_id` when called by an advisor. The advisor UI no longer calls this.

**`backend/app/seed.py`** — the seeded demo student is now explicitly mapped to the seeded demo advisor via `class_advisor_id` (so the demo still shows a populated class out of the box); any student who signs up after seeding starts unmapped.

**`frontend/src/api/users.js`** — added `listUnassignedStudents()`, `addStudentToClass(id)`, `removeStudentFromClass(id)`; kept `addStudent()` (legacy) for completeness, unused by the advisor page now.

**`frontend/src/pages/dashboards/AdvisorStudents.jsx`** — rewritten. Removed the manual entry form and CSV import modal entirely. New layout: a collapsible "Add student" panel listing unassigned registered students with per-row **Add** buttons, and the main list of the advisor's current class with per-row **Remove** buttons. Both lists refresh from the two new endpoints; a manual **Refresh** button is also available.

### Testing notes

- Sign up a new student (Login page → Create account) with the same department as `advisor@campusflow.edu` (`AI & DS`) to see them appear in the advisor's "Add student" panel.
- The seeded student (`student@campusflow.edu`) already appears in the advisor's class after running `python -m app.seed` — use Remove on them to see them reappear in the unassigned pool, then Add them back.

---

## Prompt 7 — Wire up remaining mock-data pages (Advisor Dashboard, Principal/HOD overview, Reports, Agent Network)

> yes

(Continuing the plan from the prior evaluator pass — no verbatim new instruction beyond confirming the ordered plan: Advisor Dashboard → Principal/HOD overview endpoints → Reports → Agent Network.)

### Correction to Prompt 5's checklist

`AdminDirectMessage.jsx` was already fully wired (`listUsers()` / `listDmThreads()` on mount, sends through `DirectMessageThread.jsx` → `POST /messages`). The "still open" line for it in the Prompt 5 checklist was stale — moved to Done below.

### Files changed

**`backend/apps/accounts/users.py`**
- Added `AdvisorStudentOut(UserPublic)` with `tasks_done` / `tasks_total`, computed live from `tasks_col` per student.
- `GET /advisor/students` and `GET /advisor/students/unassigned` now return `AdvisorStudentOut` instead of bare `UserPublic` — previously these endpoints had no task data at all, so `AdvisorStudents.jsx`'s expanded task-progress view was silently always empty for real students (mock field names `tasksDone`/`tasksTotal` never matched anything the real API returned).

**`frontend/src/pages/dashboards/AdvisorStudents.jsx`**
- Fixed the above: `s.tasksDone`/`s.tasksTotal` → `s.tasks_done`/`s.tasks_total` to match the real (snake_case) API response.

**`frontend/src/pages/dashboards/AdvisorDashboard.jsx`** — rewritten
- Removed `ADVISOR_STUDENTS`, `COMMON_GROUP_FEED`, `AGENTS` mock imports.
- Now fetches `listAdvisorStudents()`, `listAgents()`, and `listMessages("CSE-C")` on mount; roster snapshot, avg attendance, at-risk list, and "your agent" card all computed from live data. Common group feed now posts through `postMessage()` like `AdvisorGroup.jsx` already did.

**`backend/apps/platform/overview.py`** — new file
- `GET /overview/departments` — per-dept students/advisors/agents-running/avg-task-completion, computed from `users_col`/`agents_col`/`tasks_col` (Principal/HOD/Admin).
- `GET /overview/institution` — total students, dept count, overall completion rate, messages sent in the last 7 days (Principal/Admin).
- `GET /overview/staff-activity` — per advisor/HOD: messages sent, completed tasks among their scoped students, and a composite 0–100 activity score (documented as a lightweight heuristic, not a claimed ML metric).
- `GET /overview/completion-by-student` — per-student task completion %, dept-scoped for HOD.
- Nothing here is a new collection — all four endpoints aggregate existing `users`/`tasks`/`agents`/`messages` data live.

**`backend/django_project/urls.py`** — registered the overview routes.

**`frontend/src/api/overview.js`** — new file, thin wrappers for the four endpoints above.

**`frontend/src/pages/dashboards/PrincipalDashboard.jsx`** — rewritten
- Removed `DEPT_OVERVIEW`, `INSTITUTION_SUMMARY`, `STAFF_INVOLVEMENT`, `COMPLETION_BY_STUDENT` mock imports.
- Fetches all four `/overview/*` endpoints in parallel; loading/error states added.

**`frontend/src/pages/dashboards/PrincipalDepartments.jsx`** — rewritten
- Removed `DEPT_OVERVIEW` mock import and the `FairnessSlider` (no real per-department fairness signal exists anywhere in the backend — was always rendering the same default). Replaced with a real "avg. task completion" progress bar from `GET /overview/departments`.

**`backend/apps/academic/reports.py`** — new file
- `Report` stored in a new `reports_col`: `subject`, `body`, `from_user_id`, `from_name`, `from_dept`, `status` (open/investigating/resolved), `created_at`.
- `POST /reports` — any authenticated role can file one.
- `GET /reports` — Admin/Principal see everything; HOD scoped to `from_dept == their dept`.
- `PATCH /reports/{id}` — status transition (Admin, or HOD for their own dept's reports).

**`backend/app/database.py`** — added `reports_col` + index on `from_dept`.

**`backend/django_project/urls.py`** — registered the reports routes.

**`frontend/src/api/reports.js`** — new file (`listReports`, `fileReport`, `updateReportStatus`).

**`frontend/src/pages/dashboards/AdminReports.jsx`** — rewritten
- Removed `REPORTS` mock import; loads from `GET /reports`.
- "Forward to HOD" → `PATCH /reports/{id}` with `status: "investigating"`; "Mark resolved" → `status: "resolved"`. Buttons previously did nothing at all.

**`frontend/src/pages/dashboards/HodDashboard.jsx`** — rewritten
- Removed the hardcoded `["CSE-C","CSE-D","AIDS-A","AIDS-B"]` fake class list and `MOCK_REPORTS`.
- Now fetches `GET /agents`, `listAdvisorStudents()`, `listReports()`, and `listDepartmentsOverview()`; class-advisor count, department completion %, and the reports card are all real.

**`backend/apps/agents/agents.py`**
- Added `GET /agents/network` — returns `{agents, edges}`. Edges are derived on the fly (not stored): system-role agents connect to every HOD/advisor agent, HOD agents connect to their department's advisor agents, and advisor agents connect to agents owned by students mapped into that advisor's class (`class_advisor_id`). Scoping: Admin sees everything; HOD sees their dept; Advisor sees their own agent + their class's student agents + system agents; Student sees only their own.

**`frontend/src/api/agents.js`** — added `getAgentNetwork()`.

**`frontend/src/pages/dashboards/NetworkView.jsx`** — rewritten
- Removed `AGENTS`, `AGENT_EDGES` mock imports (kept `NODE_TYPES` from `mockData.js` — that's static legend styling, not data).
- Fetches `getAgentNetwork()` on mount; handles the empty-scope case (e.g. an advisor with no agents yet) instead of assuming `AGENTS` is always non-empty.

**`frontend/src/pages/dashboards/AdminDashboard.jsx`**
- Fixed a latent bug found while wiring the above: the "All agents" list read `a.owner` (a mock-data-only field) instead of `a.owner_name` (the real `AgentOut` field), so every agent's owner line was blank for real data. `ADMIN_LOGS` / `HALLUCINATION_TREND` intentionally left as inline mock — no real event pipeline exists yet (see "Still open").

### Testing notes for this pass

- Advisor Dashboard, Principal Dashboard/Departments, Admin Reports, HOD Dashboard, and the Agent Network page (all three role variants) now require a live backend — no more fallback to mock data on any of these pages.
- `overview.avg_completion` and `completion-by-student` show `0%` for any student with zero tasks — this is real data (no tasks yet), not a bug.
- Nothing currently calls `POST /reports` from the UI yet — reports can only be filed via the API directly for now (see "Still open").

---

## Prompt 8 — Connect a real local LLM (Ollama) to the personal assistant agent + admin model selection + resumable action log

> yes and connect hte real llm  of ollma ok now connect the llm brain to the frontend ok now ineed to maintain every deatils and action in the user_action.json ok wheven the user ask in the agent section which is personal asssistant  ok connect it tot the agent and set the role of the assistant ok and pass the data tot he agent and make a reasoanble answer based onteh awhat actions need ot eperformed like that ok liek the assistant and the respoonse shoul be well strucured if th it has  atime or datte it  need ot highlghted and weell defined incldue the bold or italic all the things fot teh backedn connections  of the llm us ethe ollama  ok and include the model selection inthe admin panel based on the model selection alll the agent us eht tllm to reposen ok for the assistant for each user apply ths i in the chatbot section  ok wehnce the user not mention anything sthen sned te command to the agent that is the personal agent assigned to each on eto gahte the quires of the user and update the status in every step so that it can be resume us ehte file sytem connector to upad the file campus flow

### What this connects

The existing floating "Your assistant" chat bubble (`AssistantChat.jsx`, already wired into `AppShell` for every role) was answering from a hardcoded keyword-matching function (`answerFor()`) over mock data — no LLM involved anywhere. That function is now gone. The same chat UI now calls a real local **Ollama** model on the backend, with a role-specific system prompt, per the plan: LLM brain → backend → frontend chatbot (the "agent section" / personal assistant), every action logged to `user_action.json` for resume, and a model picker in the admin panel.

### Backend — new Ollama-backed assistant

**`backend/app/config.py`**
- Added `ollama_host` (default `http://localhost:11434`), `ollama_default_model` (default `llama3.2`), `ollama_timeout_seconds`.

**`backend/app/services/ollama_client.py`** — new file
- Async httpx client for a local Ollama server. `list_models()` → `GET /api/tags`. `chat(model, messages)` → `POST /api/chat` (non-streaming). Every failure (server down, model not pulled) raises `OllamaError` with a clear human-readable message instead of a raw connection traceback.

**`backend/app/services/action_log.py`** — new file
- File-backed, append-only logger writing to **`backend/data/user_action.json`** (created automatically on first use). One JSON record per assistant query: `id`, `user_id`, `user_name`, `role`, `step`, `message`, `response`, `model`, `status` (`in_progress` → `completed`/`error`), `created_at`, `updated_at`. `start_action()` is called (and persisted) *before* the Ollama call so there's always a durable record even if the model never responds — that's what makes a conversation resumable. `user_history(user_id)` reads it back out, oldest-first, for the frontend to replay into the chat panel. Capped at 2000 records institution-wide (oldest dropped first).

**`backend/apps/agents/assistant.py`** — new file
- `POST /assistant/chat` — any authenticated role. Builds a role-specific system prompt (different persona/brief for student/advisor/hod/principal/admin), logs the query as `in_progress`, calls Ollama with the active model + last 8 turns of history for context, logs the result as `completed` or `error`, returns the reply. System prompt explicitly instructs the model to: format replies in Markdown, **bold** anything the user must not miss (deadlines/statuses/counts), *italicize* supporting detail, **always bold every date or time it mentions**, and — when the user's message is vague or doesn't say what they want — ask a clarifying question with 2-3 concrete examples instead of guessing (this is the "gather the user's queries" behavior).
- `GET /assistant/history` — this user's recent action-log entries, for resuming a conversation.
- `GET /assistant/models` (admin-only) — lists every model pulled on the Ollama host + which one is active.
- `POST /assistant/model` (admin-only) — sets the active model, persisted in a new Mongo `settings` collection (single doc, `_id: "assistant"`). Every user's agent reads this same setting, so one admin choice governs all agents institution-wide.

**`backend/app/database.py`** — added `settings_col = db["settings"]`.

**`backend/django_project/urls.py`** — registered the assistant routes.

**`backend/requirements.txt`** — added `httpx==0.27.2`.

### Frontend — real backend wired into the existing chat bubble

**`frontend/src/api/assistant.js`** — new file: `sendAssistantMessage(message, history)`, `getAssistantHistory(limit)`, `getAssistantModels()`, `setAssistantModel(model)`.

**`frontend/src/lib/richText.jsx`** — new file. Dependency-free renderer: `**bold**` → `<strong>`, `*italic*` → `<em>`, `- bullet` lines → `<ul><li>`, and every date/time-shaped substring (ISO dates, "24 Aug 2026", "Aug 24, 2026", `10:30 AM`, "Today"/"Tomorrow"/etc.) is auto-wrapped in a highlighted `<mark>` even if the model forgets to bold it itself — belt-and-braces for the "dates/times must be well-defined and highlighted" requirement.

**`frontend/src/components/common/AssistantChat.jsx`** — rewritten
- Removed the `answerFor()` mock-data keyword matcher and its mock-data imports entirely.
- On first open, calls `getAssistantHistory()` and rehydrates the chat panel from the user's real action log (resume-on-reopen instead of resetting every time); falls back to a greeting if there's no history yet.
- Sending a message calls `sendAssistantMessage()` with the last 8 turns as context, shows a typing indicator while waiting, and renders the reply through `renderAssistantText()` (bold/italic/highlighted dates, bullet lists).
- Each bubble shows a small timestamp; failed calls (Ollama/backend unreachable) render as a distinct error-styled bubble with the real error message (e.g. "is `ollama serve` running?") instead of failing silently.

**`frontend/src/index.css`** — added styles for `.assistant-highlight` (the bold-mark date/time pill), `.assistant-list`, paragraph spacing inside bubbles, and `.assistant-bubble-error`.

**`frontend/src/pages/dashboards/AgentManagerSettings.jsx`** — added a new "Assistant model (Ollama)" card (admin panel, left column, between Global limits and Workload): fetches `GET /assistant/models` on mount, dropdown of every pulled model with the active one marked, "Set as active model" button calling `POST /assistant/model`, manual refresh button, and a clear inline error if Ollama isn't reachable.

### Action required before testing

1. **Install the new backend dependency** — from `campusflow/backend/`:
   ```
   pip install -r requirements.txt
   ```
   (adds `httpx`, needed to call Ollama.)
2. **Install and run Ollama** on this machine (or wherever `OLLAMA_HOST` should point):
   - Download from ollama.com if not already installed.
   - `ollama serve` (if it isn't already running as a background service).
   - `ollama pull llama3.2` (or any model of your choice) — at least one model must be pulled before the admin model picker will show anything.
3. Log in as `admin@campusflow.edu` → **Agent manager** → pick a model in the new "Assistant model (Ollama)" card → **Set as active model**. Until an admin does this once, agents fall back to `ollama_default_model` (`llama3.2`) from `backend/app/config.py`.
4. Open the assistant chat bubble (bottom-right, any role) and send a message. If Ollama isn't running, the bubble will show a clear error instead of hanging.
5. `backend/data/user_action.json` is created automatically on the first chat message — nothing to set up by hand.

### Still open

- [ ] `GET /assistant/models` / `chat()` call Ollama directly by hostname — if the backend ever runs on a different machine from Ollama, set `OLLAMA_HOST` in `backend/.env`.
- [ ] The assistant's system prompt says it does *not* have live access to the user's actual task/placement/attendance records unless pasted into the chat (it's a general-purpose local LLM, not yet fed live DB context per message) — a natural next step would be to inject a summary of the user's real `/tasks`, `/placements`, etc. into the system or first user message so answers are grounded in real data instead of the model saying "I don't have that information."
- [ ] No UI yet to browse/replay the full `user_action.json` log (e.g. an admin activity viewer) — right now it's only consumed by each user's own `GET /assistant/history`.

---

## Prompt 9 — Agent graph, file-backed with access scope + connections dictionaries

> ok now the i need to main tain the graph ok in the backedn file sep file that could conaint the access scope for the view and all the gconnected agent sin teh dictionalryy format ok if the frontend ask thenthe shwo the graph info and connencttot eh front end ok and i needt manage all the agents in the file fo agentgraph file ok in the backnd ok

### What changed conceptually

The agent network's connection rules (system -> hod/advisor, hod -> their dept's advisors, advisor -> their class's students) and per-role visibility used to be computed inline, on every request, inside `GET /agents/network`. That logic now lives in one dedicated service and is persisted to disk as plain dictionaries — a single on-disk source of truth for "what does the agent network look like right now", instead of logic buried in a query filter.

### Files changed

**`backend/app/services/agent_graph.py`** — new file. Manages `backend/data/agent_graph.json`:
```
{
  "generated_at": "...",
  "agents": { "<agent_id>": {name, role, status, accuracy, hallucination, owner_id, owner_name} },
  "connections": { "<agent_id>": ["<agent_id>", ...] },   # undirected adjacency dict
  "access_scope": { "<user_id>": ["<agent_id>", ...] }    # which agents each user may view
}
```
- `rebuild_graph()` — pulls every agent + user from MongoDB, recomputes `connections` (same edge rules as the existing `/agents/network` endpoint) and `access_scope` per user (Admin = all; HOD = system agents + their dept; Advisor = self + their class's students; everyone else = only their own agent), and writes the file.
- `load_graph()` — reads the last persisted file without touching Mongo.
- `scoped_view(graph, user_id)` — filters the full graph down to a subgraph (`agents` + `connections`) for one user, using their `access_scope` entry. Edges are pre-restricted to visible agents only.

**`backend/apps/agents/agents.py`**
- `POST /agents` and `PATCH /agents/{id}/status` now call `agent_graph.rebuild_graph()` after writing, so the file never drifts from Mongo when an agent is created or its status changes.
- New `GET /agents/graph` — rebuilds the graph, then returns the subgraph scoped to the caller (`{generated_at, agents, connections}`, dict-keyed by agent id).
- New `GET /agents/graph/full` — admin-only, returns the entire unscoped graph for debugging access rules.
- `GET /agents/network` (existing, powers `NetworkView.jsx`) left unchanged — same response shape, still works as before.

**`frontend/src/api/agents.js`** — added `getAgentGraph()` (`GET /agents/graph`) and `getAgentGraphFull()` (`GET /agents/graph/full`). Not yet wired into a page — `NetworkView.jsx` still uses `getAgentNetwork()`; these are available for whatever surface needs the file-backed dict-shaped version next.

### Testing notes

- First call to `GET /agents/graph` creates `backend/data/agent_graph.json` if it doesn't exist yet.
- The frontend calls are wrapped and ready (`getAgentGraph`, `getAgentGraphFull`) but no page renders them yet — say the word if you want a graph view wired up.

---

## Master checklist — current state

### Done

- [x] `StudentDashboard.jsx` — fully rewritten to fetch `/tasks`, `/agents`, `/placements`, `/skills/me`, `/messages?group=CSE-C`; profile fields from `useAuth()`; daily plan derived from real pending tasks
- [x] Login page — hardcoded `LAST_UPDATED` build stamp pill
- [x] Student Placements — "Completed Action" button; persists `completed` + `completed_at` via `POST /placements/{id}/complete`
- [x] `GET /placements/advisor/summary` — new backend endpoint for advisor placement view
- [x] `AdvisorPlacements.jsx` — new page; per-drive progress + per-student task breakdown; wired into routing + sidebar
- [x] `GET /system/stats` — new backend endpoint (psutil CPU/RAM + nvidia-smi GPU)
- [x] `AgentManagerSettings.jsx` — CPU/GPU/RAM gauges now poll live backend every 4s
- [x] `AccountNotifications.jsx` — `onSave` now wired; profile edits `PATCH /users/me` and update session
- [x] `GET /advisor/students` — new backend endpoint (dept-scoped student list)
- [x] `POST /advisor/students` — new backend endpoint (creates student account)
- [x] `AdvisorStudents.jsx` — loads real students from DB; Add/CSV-import persists to MongoDB
- [x] `AdminDashboard.jsx` — agent stats + agent list from real `GET /agents`; no more `mockData.js` import
- [x] `HodDashboard.jsx` — agent count + student count from real backend; no more `mockData.js` import
- [x] Global `ErrorBoundary` added around the app — crashes now show a recoverable screen + console stack trace instead of a blank white page
- [x] `MyMessages.jsx` / `DirectMessageThread.jsx` — fixed unguarded `.name`/`.other_user_name` property access that could crash the student Messages page
- [x] `CommonGroupFeed.jsx` — fixed attachment shape mismatch and unguarded `text.split()`
- [x] `class_advisor_id` field + `GET /advisor/students/unassigned`, `POST /advisor/students/{id}/add`, `POST /advisor/students/{id}/remove` — advisor now maps already-registered students into their class instead of creating accounts
- [x] `AdvisorStudents.jsx` — rewritten with "My class" (Remove) + "Add student" unassigned-pool panel (Add); manual entry form and CSV import removed
- [x] `AdminDirectMessage.jsx` — actually already fully wired (correction — see Prompt 7); persists via `POST /messages`, threads via `GET /messages/dm/threads`
- [x] `AdvisorStudentOut` (`tasks_done`/`tasks_total`) added to `GET /advisor/students` + `/unassigned`; fixed `AdvisorStudents.jsx` reading the wrong (camelCase) field names
- [x] `AdvisorDashboard.jsx` — rewritten off `listAdvisorStudents()`, `listAgents()`, `listMessages("CSE-C")`; no more mockData import
- [x] `GET /overview/departments`, `/institution`, `/staff-activity`, `/completion-by-student` — new backend aggregation endpoints for Principal/HOD
- [x] `PrincipalDashboard.jsx` + `PrincipalDepartments.jsx` — rewritten off the four `/overview/*` endpoints; dept-level fairness slider (never had real data) replaced with real avg. task completion
- [x] `GET /reports`, `POST /reports`, `PATCH /reports/{id}` — new backend endpoint + `reports_col`; wired `AdminReports.jsx` (Forward to HOD / Mark resolved now do something) and `HodDashboard.jsx`'s reports card
- [x] `GET /agents/network` — new backend endpoint deriving graph edges live from role/ownership data; wired `NetworkView.jsx` (kept `NODE_TYPES` as a static frontend legend constant)
- [x] `AdminDashboard.jsx` — fixed `a.owner` → `a.owner_name` bug in the "All agents" list (found while wiring the above)
- [x] `POST /assistant/chat`, `GET /assistant/history`, `GET /assistant/models`, `POST /assistant/model` — new backend router connecting the personal assistant to a real local Ollama model, role-specific system prompts, admin-selectable active model (Mongo `settings` collection)
- [x] `backend/app/services/ollama_client.py` + `backend/app/services/action_log.py` — new Ollama client and file-backed step logger writing to `backend/data/user_action.json` (in_progress → completed/error) for resumable conversations
- [x] `AssistantChat.jsx` — rewritten off the old mock-data `answerFor()` keyword matcher; now calls the real backend, rehydrates from `GET /assistant/history` on open, renders **bold**/*italic*/highlighted dates via new `frontend/src/lib/richText.jsx`
- [x] `AgentManagerSettings.jsx` — new "Assistant model (Ollama)" card; admin picks which pulled model every agent institution-wide runs on

### Still open

- [ ] No frontend UI calls `POST /reports` yet — reports can currently only be filed via the API directly
- [ ] System logs + hallucination trend endpoint — `AdminDashboard.jsx` log/trend widgets still use inline mock (no real event pipeline exists to source these from)
- [ ] Skills management UI — `POST/PATCH/DELETE /skills` endpoints exist but no frontend page calls them
- [ ] Per-student "fairness" / accountability-bias score (`AdvisorStudents.jsx` `FairnessSlider`) — UI exists but no backend field or endpoint was ever built for it; always shows the same default
- [ ] Delete `frontend/src/data/mockData.js` — down to `ROLES`, `ROLE_META`, `resolveRoleFromEmail`, `DEPARTMENTS`, `NODE_TYPES` (all legitimate static/label constants, not data) plus a few unused exports; safe to prune the unused exports and rename if desired, but nothing dynamic depends on it anymore
- [ ] LLM-agent research features — task decomposition, adaptive agent generation, deadline-aware planning are still not implemented. The personal assistant chat (Prompt 8) now runs on a real local LLM via Ollama with role-aware prompting, but it does not yet automatically decompose tasks, spin up new agents, or plan around deadlines on its own — it answers/asks in conversation, it doesn't act autonomously yet.

---

## Testing notes

- All demo accounts use password `password123`. Run `python -m app.seed` from `campusflow/backend/` to reset the DB to a clean state.
- Dev bypass (no-password role switcher) is on the Login page — only works when `DEV_MODE=true` in `backend/.env`.
- Only one student (`student@campusflow.edu`) is seeded. Advisor placement summary and student list will show just that one student until more are added via "Add student" or seeded.
- `psutil` must be installed (`pip install -r requirements.txt` in `backend/`) before CPU/GPU stats will work.
- GPU stats only appear if the NVIDIA driver is installed and `nvidia-smi` is on PATH.
