# CampusFlow — Frontend (UI only)

A dummy-data React frontend for the CampusFlow multi-agent college
management concept. No backend calls are made yet — everything reads
from `src/data/mockData.js` so you can wire it up to a real API later.

## Run it

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`).

To build a production bundle:

```bash
npm run build
npm run preview
```

## How auth works right now

There's no backend, so `src/context/AuthContext.jsx` fakes it:

- **Sign up / sign in** takes a name + college email. The role
  (Admin, Principal, HOD, Class Advisor, Student) is resolved
  automatically from the email in `resolveRoleFromEmail()` in
  `src/data/mockData.js` — the UI never asks the person to pick a
  role, matching the real flow you'll eventually wire to your
  directory/API.
- On the login screen there's a **"Preview any role"** strip — a
  demo-only shortcut so you can click into every dashboard without
  creating five accounts. Remove it once real auth is in place (it's
  clearly commented in `AuthContext.jsx` and `Login.jsx`).

## Where to plug in the backend

- `src/context/AuthContext.jsx` — replace `login`/`signup` with real
  API calls; keep the same shape (`{ id, name, email, role, dept }`)
  and the rest of the app won't need to change.
- `src/data/mockData.js` — every export here is a stand-in for an
  API response (tasks, agents, students, group messages, logs,
  reports). Swap these for fetched data source-by-source.
- Telegram linking (`components/common/TelegramConnect.jsx`) and the
  QR step are visual only — connect to your bot's real linking flow.

## Structure

```
src/
  components/
    layout/        Sidebar, Topbar, AppShell (role-aware nav)
    common/         Shared primitives, AgentConstellation, sliders, etc.
  pages/
    auth/           Login, Signup
    dashboards/      One dashboard set per role
  context/          AuthContext (dummy session)
  data/mockData.js   All dummy data
```

## Roles covered

Admin · Principal · Dept. HOD · Class Advisor · Student — each with
its own sidebar, dashboard, and scoped views (agent network, task
board, common group feed, fairness/accountability slider, reports).

## Design

"Signal" theme — deep navy background, blue/cyan glassmorphism, and
an animated node-constellation as the recurring visual for the
agent-network concept (used quietly behind login/signup, and in full
on each role's Agent Network page). Fully responsive: collapses to a
slide-in sidebar and single-column layout under ~860px.

## Newer additions (still frontend-only / mock data)

- **Per-user assistant** — floating chat bubble (bottom-right) on every
  dashboard. Answers are computed locally in
  `components/common/AssistantChat.jsx` from the same mock data as the
  rest of the app — not a real LLM call.
- **Profile pages** — `components/common/ProfileForm.jsx` (photo upload
  preview via `URL.createObjectURL`, contact info, DOB, and semester
  marks for students) is used on every role's Profile page.
- **Telegram linking** — `components/common/TelegramConnect.jsx` now
  offers both "Scan QR" and "Enter code" tabs, available to every role
  via their sidebar's Profile page.
- **Message hierarchy** — Admin → any user by ID (`AdminDirectMessage`),
  Principal ↔ HOD (`PrincipalHodGroup`), HOD ↔ Advisor
  (`HodAdvisorGroup`), Advisor/HOD ↔ students (existing common group
  pages). All share `CommonGroupFeed`.
- **Message composer** (`CommonGroupFeed.jsx`) — auto-linkifies URLs in
  message text, has a mock "format check" step (`moderate` prop) that
  suggests a cleaned-up version of an unstructured message before
  sending, a mock file/image/PDF attach menu, and a per-message
  "mark as read" action plus aggregate "seen by" stats.
- **CSV student import** — Advisor → Students → Add student → Import
  CSV tab. Expects columns `full name, roll no, email, department`
  (parsed client-side in `AdvisorStudents.jsx`, no upload endpoint).
- **Agent Manager** (Admin only) — global/per-user/per-HOD agent
  limits, mock CPU/GPU workload gauges, a process list, and a "reset
  all agents" action. All in-memory; nothing is actually started or
  stopped.

None of the above talks to a network — same rule as the rest of the
app: swap the relevant mock data or local state for real calls when
the backend exists.
